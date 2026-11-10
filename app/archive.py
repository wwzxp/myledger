"""压缩包解包：微信/支付宝导出的 zip（含密码保护）→ 单个账单文件字节。

微信「下载账单 → 用作个人对账」给的是**带密码的 zip**，密码通过微信支付公众号下发，
里面通常是一个 .csv 或 .xlsx。支付宝部分导出也给 zip（可能带密码）。

设计约束：
- 只用 pyzipper 读 AES / ZipCrypto 两种加密方式，不落盘解压结果。
- 一个压缩包里只接受**一个**可识别的账单文件；多个时报错而不是猜。
- 密码错误与压缩包损坏必须区分，前者可让用户重输。
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass

# .txt 常见于「说明文件」，只按内容判断是否是账单，避免把 readme 当账单。
ACCEPTED_SUFFIXES = (".csv", ".xlsx", ".xls", ".txt")
MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024  # 防御压缩炸弹


class ArchiveError(ValueError):
    """压缩包无法处理。消息直接展示给用户。"""


class PasswordRequired(ArchiveError):
    """压缩包加密但未提供密码。"""


class WrongPassword(ArchiveError):
    """密码错误。"""


@dataclass
class ExtractedBill:
    filename: str
    content: bytes


def _looks_like_bill(name: str) -> bool:
    """按扩展名判断。.txt 只有名字含账单特征时才接受。"""
    lower = name.lower()
    if lower.endswith((".csv", ".xlsx", ".xls", ".pdf")):
        return True
    if lower.endswith(".txt"):
        return any(token in lower for token in ("账单", "bill", "alipay", "wechat", "明细"))
    return False


def is_zip(data: bytes) -> bool:
    """是否是**账单压缩包**（而不是 xlsx）。

    xlsx 与 zip 的魔数都是 PK\x03\x04，只看魔数会把 xlsx 误判成压缩包。
    这里额外排除 OOXML 容器：合法的 xlsx 一定含 `[Content_Types].xml`。
    """
    if data[:4] not in (b"PK\x03\x04", b"PK\x05\x06"):
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = archive.namelist()
    except zipfile.BadZipFile:
        return False
    if "[Content_Types].xml" in names:
        return False  # OOXML（xlsx/xlsm/docx/pptx），不是账单 zip
    return True


def extract_bill(data: bytes, password: str | None = None) -> ExtractedBill:
    """从 zip 里取出唯一的账单文件。

    非 zip 直接原样返回（方便调用方统一处理）。
    """
    if not is_zip(data):
        raise ArchiveError("不是 zip 压缩包")

    try:
        import pyzipper
    except ImportError as exc:  # pragma: no cover - 依赖缺失时给出可操作提示
        raise ArchiveError("缺少 pyzipper，无法处理加密压缩包") from exc

    try:
        archive = pyzipper.AESZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ArchiveError(f"压缩包损坏：{exc}") from exc

    with archive:
        infos = [info for info in archive.infolist() if not info.is_dir()]
        bills = [info for info in infos if _looks_like_bill(info.filename)]

        if not bills:
            listing = "、".join(info.filename for info in infos[:5]) or "（空）"
            raise ArchiveError(f"压缩包里没有 csv/xlsx/pdf 账单文件，内容：{listing}")
        if len(bills) > 1:
            listing = "、".join(info.filename for info in bills[:5])
            raise ArchiveError(f"压缩包里有多个账单文件，无法确定用哪个：{listing}")

        target = bills[0]
        if target.file_size > MAX_UNCOMPRESSED_BYTES:
            raise ArchiveError(f"解压后文件过大（{target.file_size // 1024 // 1024} MB）")

        encrypted = bool(target.flag_bits & 0x1)
        if encrypted and not password:
            raise PasswordRequired("压缩包已加密，请填写密码")

        if password:
            archive.setpassword(password.encode("utf-8"))

        try:
            content = archive.read(target)
        except RuntimeError as exc:
            # pyzipper 对错误密码抛 RuntimeError("Bad password for file ...")
            if "password" in str(exc).lower():
                raise WrongPassword("密码不正确") from exc
            raise ArchiveError(f"解压失败：{exc}") from exc
        except zipfile.BadZipFile as exc:
            raise ArchiveError(f"压缩包损坏：{exc}") from exc

    return ExtractedBill(filename=target.filename, content=content)
