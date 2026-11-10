"""网页上传导入：把「拖文件进浏览器」变成一次完整入库。

设计要点：
- 数据源按**文件内容**识别（表头/魔数），不按文件名猜。
- 解析复用 `importers.py`，入库复用 `bookkeeping.import_file`，不重复实现去重与校验。
- 解析结果先落标准 CSV 到系统临时目录，导入完立即删除，不在磁盘留账单副本。
- 返回结构化结果供 UI 展示：数据源、总笔数、新增、跳过、按类型的合计。
"""

from __future__ import annotations

import csv
import os
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path

from app import bookkeeping
from app.archive import ArchiveError, ExtractedBill, PasswordRequired, WrongPassword, extract_bill, is_zip
from app.importers import (
    MEITUAN_MARKER,
    ImportRejected,
    read_alipay_rows,
    read_douyin_rows,
    read_meituan_rows,
    read_wechat_rows,
)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB，够覆盖数年的账单导出
STANDARD_FIELDS = [
    "transaction_time",
    "type",
    "category_level1",
    "category_level2",
    "category",
    "amount",
    "currency",
    "transaction_object",
    "account",
    "target_account",
    "participant",
    "note",
]


@dataclass
class ImportResult:
    source: str
    filename: str
    parsed: int = 0
    unpacked_from: str | None = None
    confirmed: int = 0
    pending: int = 0
    skipped: int = 0
    deduped: int = 0
    totals: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


def detect_source(data: bytes, filename: str = "") -> str:
    """按内容识别数据源，返回 'wechat' 或 'alipay'。

    xlsx 是 zip 容器（魔数 PK\\x03\\x04）；csv 解码后看表头。
    支付宝表头含「交易分类」与「收/付款方式」；微信表头含「交易类型」与「金额(元)」。
    """
    if data[:5] == b"%PDF-":
        return "douyin"

    if data[:2] == b"PK":
        return "wechat"

    text = _decode_csv(data)
    head = text[:4000]
    # 美团先判：它的表头也含「交易类型」，不能落到微信分支
    if MEITUAN_MARKER in head or ("订单标题" in head and "实付金额" in head):
        return "meituan"
    if "交易时间" in head and "收/付款方式" in head:
        return "alipay"
    if "交易时间" in head and "金额(元)" in head:
        return "wechat"
    raise ImportRejected(
        "无法识别账单来源。支持微信支付的 .xlsx、支付宝的 .csv、美团的 .csv。"
    )


def _decode_csv(data: bytes) -> str:
    for encoding in ("gb18030", "utf-8-sig", "utf-8"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("gb18030", errors="replace")


def import_upload(data: bytes, filename: str = "", password: str | None = None, owner_id: int = 0) -> ImportResult:
    """解析并导入一次上传。返回结构化结果；失败抛 ImportRejected。

    `data` 可以是账单文件本身，也可以是包含账单的 zip（允许加密）。
    """
    if not data:
        raise ImportRejected("文件是空的。")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImportRejected(f"文件超过 {MAX_UPLOAD_BYTES // 1024 // 1024} MB 上限。")

    unpacked_from = None
    if is_zip(data):
        try:
            extracted: ExtractedBill = extract_bill(data, password)
        except PasswordRequired as exc:
            raise ImportRejected(f"{exc}（微信账单密码见微信支付公众号下发的通知）") from exc
        except (WrongPassword, ArchiveError) as exc:
            raise ImportRejected(str(exc)) from exc
        unpacked_from = filename or "(压缩包)"
        data = extracted.content
        filename = extracted.filename

    source = detect_source(data, filename)
    try:
        if source == "wechat":
            rows = read_wechat_rows(data)
        elif source == "meituan":
            rows = read_meituan_rows(data)
        elif source == "douyin":
            rows = read_douyin_rows(data)
        else:
            rows = read_alipay_rows(data, account_map=_account_map())
    except SystemExit as exc:  # 上游解析器用 SystemExit 报格式错误
        raise ImportRejected(f"解析失败：{exc}") from exc
    except Exception as exc:
        raise ImportRejected(f"解析失败：{exc}") from exc

    if not rows:
        raise ImportRejected("文件解析成功但没有可导入的记录。")

    result = ImportResult(
        source=source, filename=filename or "(未命名)", parsed=len(rows), unpacked_from=unpacked_from
    )
    result.totals = _totals(rows)

    bookkeeping.init_db()
    with tempfile.TemporaryDirectory(prefix="myledger-") as tmpdir:
        csv_path = Path(tmpdir) / "standard.csv"
        _write_standard_csv(csv_path, rows)
        outcome = bookkeeping.import_file(str(csv_path), owner_id=owner_id)

    result.confirmed = int(outcome.get("confirmed", 0))
    result.pending = int(outcome.get("pending", 0))
    result.skipped = int(outcome.get("unconfirmed", 0))
    result.deduped = int(outcome.get("deduped", 0))

    if result.pending:
        result.warnings.append(
            f"{result.pending} 笔进入待确认：可先跑规则候选，再用本地模型或人工补类目。"
        )

    # 解析到的笔数与实际落库的笔数对不上时，必须说清楚差额去哪了，
    # 否则用户只看到「什么都没发生」。
    accounted = result.confirmed + result.pending + result.skipped + result.deduped
    if result.parsed and accounted < result.parsed:
        result.warnings.append(
            f"解析 {result.parsed} 笔，落库 {accounted} 笔；"
            f"差额 {result.parsed - accounted} 笔被跳过（金额为 0 或缺少必要字段）。"
        )
    if result.deduped:
        result.warnings.append(
            f"{result.deduped} 笔与已有记录重复（时间 ±2 秒、金额、账户相同），已忽略。"
        )
    return result


def _account_map() -> dict:
    """支付宝的付款方式名 → 已有账户名。空映射时保留原始名称，不做猜测。"""
    from app.config import load_config

    return load_config().account_map


def _totals(rows: list[dict]) -> dict:
    totals: dict[str, float] = {}
    for row in rows:
        kind = row.get("type") or "未分类"
        totals[kind] = round(totals.get(kind, 0.0) + row.get("amount_cents", 0) / 100.0, 2)
    return totals


def _write_standard_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=STANDARD_FIELDS)
        writer.writeheader()
        for row in rows:
            level1, _, level2 = str(row.get("category") or "").partition("/")
            writer.writerow(
                {
                    "transaction_time": row.get("transaction_time", ""),
                    "type": row.get("type", ""),
                    "category_level1": level1,
                    "category_level2": level2,
                    "category": row.get("category", ""),
                    "amount": f"{row.get('amount_cents', 0) / 100:.2f}",
                    "currency": "CNY",
                    "transaction_object": row.get("transaction_object", ""),
                    "account": row.get("account", ""),
                    "target_account": "",
                    "participant": "自己",
                    "note": row.get("note", ""),
                }
            )
