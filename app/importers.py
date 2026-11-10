"""账单解析的门面层。

上游 Bookkeeping 把解析逻辑写在两个 CLI 脚本里（`import_wechat_bill.py`
与 `import_alipay_bill.py`），它们的输出是「标准 CSV 记录 + 中文钥匙」。
本模块把这两条路径收敛成一组纯函数，供 Web 层与测试直接调用：

    read_wechat_rows(path) -> list[dict]
    read_alipay_rows(path) -> list[dict]

返回的每条记录都带 `amount_cents`（整数分）与归一化的 `type`
（支出 / 收入 / 不计收支），中性交易保留而不是丢弃 —— 丢弃会让月度
支出合计失真，这是本项目明确要避免的。

解析规则本身不在这里重写：表头识别、编码回退、中性交易映射都复用上游，
只做字段名与金额单位的统一。
"""

from __future__ import annotations

import importlib.util
import io as _io
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from types import ModuleType

_MODULE_DIR = Path(__file__).resolve().parent


def _bookkeeping_module() -> ModuleType:
    """上游脚本写的是 `from bookkeeping import ...`；fork 后在 app/ 包内，
    需要先把包内模块注册成顶层名 `bookkeeping`，保持上游源码原样不动。"""
    module = sys.modules.get("bookkeeping")
    if module is None:
        module = _load("bookkeeping", "bookkeeping.py")
        sys.modules["bookkeeping"] = module
    return module


def _load(name: str, filename: str) -> ModuleType:
    """加载上游脚本。

    单文件打包（PyInstaller）后，`app/` 里只剩编译进归档的字节码，
    磁盘上并没有 `bookkeeping.py` 这些源文件，按路径加载必然找不到。
    所以先走包内常规 import；只有当那些模块确实以独立文件形式存在
    （源码树 / 安装目录）时才回退到按路径加载。
    """
    existing = sys.modules.get(name)
    if existing is not None:
        return existing

    file_path = _MODULE_DIR / filename
    if not file_path.is_file():
        # 打包态：文件不在磁盘上，用包内模块名直接导入
        import importlib as _importlib

        stem = filename[:-3]  # 去掉 .py
        package = __name__.rsplit(".", 1)[0] if "." in __name__ else ""
        target = f"{package}.{stem}" if package else stem
        module = _importlib.import_module(target)
        sys.modules[name] = module
        return module

    spec = importlib.util.spec_from_file_location(name, file_path)
    if spec is None or spec.loader is None:  # pragma: no cover - 打包环境异常
        raise ImportError(f"无法加载 {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_bookkeeping_module()
_wechat = _load("_upstream_wechat", "import_wechat_bill.py")
_alipay = _load("_upstream_alipay", "import_alipay_bill.py")

ALIPAY_HEADER = "交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注,"


def alipay_header() -> str:
    """支付宝明细的表头行，供 fixture 与解析器对齐。"""
    return ALIPAY_HEADER


# 抖音支付 PDF：表头 7 列及其在页面上的 x 起点（取自真实导出样本）。
# 用起点两两取中点作为列边界——数据词的 x0 会略偏离表头，但不会跨过中点。
DOUYIN_COLUMNS = (
    "交易时间", "收/支/其他", "金额（元）", "收/付款方式",
    "交易单号", "交易对方", "商家单号",
)
DOUYIN_HEADER_X = {
    "交易时间": 53.95,
    "收/支/其他": 127.20,
    "金额（元）": 192.52,
    "收/付款方式": 276.62,
    "交易单号": 423.87,
    "交易对方": 575.53,
    "商家单号": 713.01,
}
DOUYIN_TYPE_MAP = {"支出": "支出", "收入": "收入", "其他": "不计收支"}
# 页脚混在同一列里，按文本标记与底部边距截断
DOUYIN_FOOTER_MARKS = ("说明：", "抖音支付科技有限公司")
DOUYIN_BOTTOM_MARGIN = 40


def _douyin_bounds() -> list[tuple[float, str]]:
    xs = [DOUYIN_HEADER_X[c] for c in DOUYIN_COLUMNS]
    bounds = [((a + b) / 2, col) for a, b, col in zip(xs, xs[1:], DOUYIN_COLUMNS[:-1])]
    bounds.append((float("inf"), DOUYIN_COLUMNS[-1]))
    return bounds


DOUYIN_BOUNDS = _douyin_bounds()
_DOUYIN_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _douyin_column(x0: float) -> str:
    for limit, name in DOUYIN_BOUNDS:
        if x0 < limit:
            return name
    return DOUYIN_COLUMNS[-1]


def douyin_records(words: list[dict]) -> list[dict]:
    """把 pdfplumber 的词还原成交易记录。纯函数，不依赖 PDF 解析。

    抖音的排版没有表格线，靠 x 坐标分列；日期是行起点，
    折行片段（更大的 top）按列拼回上一条。
    """
    if not any(word["text"] == "交易时间" for word in words):
        return []

    ordered = sorted(words, key=lambda word: (round(word["top"], 1), word["x0"]))
    buckets: list[dict[str, list[str]]] = []
    current: dict[str, list[str]] | None = None
    for word in ordered:
        text = word["text"]
        if _DOUYIN_DATE.match(text) and _douyin_column(word["x0"]) == "交易时间":
            current = {column: [] for column in DOUYIN_COLUMNS}
            buckets.append(current)
        if current is None:
            continue
        current[_douyin_column(word["x0"])].append(text)

    records: list[dict] = []
    for bucket in buckets:
        when = " ".join(bucket["交易时间"])
        raw_type = "".join(bucket["收/支/其他"])
        tx_type = DOUYIN_TYPE_MAP.get(raw_type)
        if not tx_type:
            continue
        amount = "".join(bucket["金额（元）"])
        if not amount:
            continue
        order_no = "".join(bucket["交易单号"])
        merchant_no = "".join(bucket["商家单号"])
        note_bits = [part for part in (f"交易单号 {order_no}" if order_no else "",
                                       f"商家单号 {merchant_no}" if merchant_no else "") if part]
        records.append({
            "transaction_time": when,
            "type": tx_type,
            "category": "",
            "amount": amount,
            "transaction_object": "".join(bucket["交易对方"]),
            "account": "".join(bucket["收/付款方式"]),
            "note": "；".join(note_bits),
        })
    return [_normalize(record) for record in records]


def read_douyin_rows(path: str | Path | bytes, account_map: dict | None = None) -> list[dict]:
    """解析抖音支付导出的 PDF 流水。"""
    try:
        import pdfplumber
    except ImportError as exc:  # pragma: no cover - 依赖缺失时给出可操作提示
        raise ImportRejected("缺少 pdfplumber，无法解析 PDF 账单") from exc

    if isinstance(path, (bytes, bytearray)):
        source = _io.BytesIO(bytes(path))
    else:
        source = Path(path)

    words: list[dict] = []
    try:
        with pdfplumber.open(source) as pdf:
            for page in pdf.pages:
                page_words = page.extract_words()
                if not any(word["text"] == "交易时间" for word in page_words):
                    continue  # 只有说明文字的页
                # 页脚（说明、公司名、页码）混在同一列里，按 y 截掉
                footer_top = min(
                    (word["top"] for word in page_words if word["text"] in DOUYIN_FOOTER_MARKS),
                    default=page.height,
                )
                cutoff = min(footer_top, page.height - DOUYIN_BOTTOM_MARGIN)
                words.extend(word for word in page_words if word["top"] < cutoff)
    except ImportRejected:
        raise
    except Exception as exc:
        raise ImportRejected(f"PDF 解析失败：{exc}") from exc

    raw_rows = douyin_records(words)
    if not raw_rows:
        raise ImportRejected("抖音账单里没有交易记录。")
    return raw_rows


class ImportRejected(ValueError):
    """账单无法识别或不合规。消息可直接展示给用户。"""


# 美团导出的说明行之后才是真正的表头，用这一行定位。
MEITUAN_MARKER = "【美团交易账单明细列表】"
MEITUAN_TIME_KEYS = ("交易成功时间", "交易创建时间")
MEITUAN_AMOUNT_KEYS = ("实付金额", "订单金额")
MEITUAN_TYPES = {"支出", "收入", "不计收支"}


def read_meituan_rows(path: str | Path | bytes, account_map: dict | None = None) -> list[dict]:
    """解析美团账单 csv（UTF-8 BOM）。

    表头在「【美团交易账单明细列表】」之后。时间取「交易成功时间」
    （失败单不产生记账），金额取「实付金额」（有优惠时与订单金额不等）。
    """
    if isinstance(path, (bytes, bytearray)):
        raw = bytes(path)
    else:
        raw = Path(path).read_bytes()
    text = raw.decode("utf-8-sig", errors="replace")

    lines = text.splitlines()
    marker = next((i for i, line in enumerate(lines) if MEITUAN_MARKER in line), None)
    if marker is None:
        raise ImportRejected("美团账单缺少「【美团交易账单明细列表】」标记行。")

    import csv as _csv
    import io as _io

    reader = _csv.reader(_io.StringIO("\n".join(lines[marker + 1:])))
    header = None
    rows: list[dict] = []
    for values in reader:
        if not values or not any(v.strip() for v in values):
            continue
        if header is None:
            header = [v.strip() for v in values]
            continue
        record = dict(zip(header, values))
        tx_type = (record.get("收/支") or "").strip()
        if tx_type not in MEITUAN_TYPES:
            continue
        when = next((record.get(k, "").strip() for k in MEITUAN_TIME_KEYS if record.get(k, "").strip()), "")
        amount = next((record.get(k, "").strip() for k in MEITUAN_AMOUNT_KEYS if record.get(k, "").strip()), "")
        rows.append({
            "transaction_time": when,
            "type": tx_type,
            "category": "",
            "amount": amount,
            "transaction_object": (record.get("订单标题") or "").strip(),
            "account": _meituan_account(record),
            "note": (record.get("备注") or "").strip().strip("/"),
        })

    if header is None:
        raise ImportRejected("美团账单没有表头行。")
    if not rows:
        raise ImportRejected("美团账单解析成功但没有可导入的记录。")
    return [_normalize(r) for r in rows]


def _meituan_account(record: dict) -> str:
    """支付方式映射到账户名；美团月付单独保留。"""
    method = (record.get("支付方式") or "").strip()
    return method or "美团"


def to_cents(value) -> int:
    """把「¥1,234.56」「28.5」这类金额统一成整数分。

    用 Decimal 而不是 float：账单金额是精确到分的十进制数，
    float 会在千分位与小数相加时引入误差。
    """
    if value is None:
        return 0
    text = str(value).strip()
    if not text or text == "/":
        return 0
    text = text.replace("¥", "").replace("￥", "").replace(",", "").replace(" ", "")
    try:
        return int((Decimal(text) * 100).to_integral_value())
    except (InvalidOperation, ValueError):
        return 0


def _normalize(record: dict) -> dict:
    return {
        "transaction_time": record.get("transaction_time", ""),
        "type": record.get("type", ""),
        "category": record.get("category", ""),
        "amount_cents": to_cents(record.get("amount")),
        "transaction_object": record.get("transaction_object", ""),
        "account": record.get("account", ""),
        "note": record.get("note", ""),
    }


def read_wechat_rows(path: str | Path | bytes, account_map: dict | None = None) -> list[dict]:
    """解析微信支付 xlsx。中性交易（提现/充值/还款）以 `不计收支` 保留。

    `path` 可以是路径或文件字节（Web 上传场景）。
    """
    source = path if isinstance(path, (bytes, bytearray)) else str(path)
    _, _, raw_rows = _wechat.read_wechat_xlsx(source)
    pairs, _skipped = _wechat.classify_rows(raw_rows, account_map or {})
    return [_normalize(record) for _row, record in pairs]


def read_alipay_rows(path: str | Path | bytes, account_map: dict | None = None) -> list[dict]:
    """解析支付宝 csv（GB18030 优先）。`不计收支` 同样保留。

    `path` 可以是路径或文件字节（Web 上传场景）。
    """
    source = path if isinstance(path, (bytes, bytearray)) else str(path)
    _, raw_rows = _alipay.decode_alipay_csv(source)
    pairs, _skipped = _alipay.classify_rows(raw_rows, account_map or {})
    return [_normalize(record) for _row, record in pairs]
