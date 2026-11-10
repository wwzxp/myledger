"""从邮箱拉取微信/支付宝账单附件。

设计要点（见 docs/specs/账单邮件导入-产品规格.md）：
- 只用标准库 `imaplib` / `email`，不引入第三方邮件库。
- 只扫描**未读**邮件，处理后标记已读，避免重复提取。
- 只保存 zip 附件到本地待导入目录；**不解压**——密码由用户手动输入。
- 附件按「邮箱 UID + 文件名」命名，重复扫描不会覆盖。

QQ 邮箱需要「授权码」而非登录密码，且必须在网页端开启 IMAP 服务。
"""

from __future__ import annotations

import email
import imaplib
import os
import re
import ssl
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from email.header import decode_header
from pathlib import Path

# 只关心账单类邮件：微信支付、支付宝
BILL_SENDERS = ("wechat", "tenpay", "alipay", "支付宝", "微信支付", "mail.alipay.com")
BILL_SUBJECT_HINTS = ("账单", "对账", "交易流水", "bill")

MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024

# 账单下载链接的域名白名单：只认这些，避免把任意链接当账单。
# 注意 alipay.com 本身太宽：kcart.alipay.com 是埋点像素，不是账单文件。
# 微信真实下载域名是 tenpay.wechatpay.cn（.cn 不是 .com）。
BILL_LINK_HOSTS = (
    "wx.tenpay.com",
    "tenpay.com",
    "tenpay.wechatpay.cn",
    "wechatpay.cn",
    "bill.alipay.com",
)

# 埋点/统计路径，正文里出现也不当下载链接
BILL_LINK_DENY_PATHS = ("/web/bi.do", "/bi.do", "/analytics", "/track")

# 单独保存异常类型：测试里会替换 IMAP4_SSL，若直接写 imaplib.IMAP4.error
# 在替换后就会解析到替身类上。
IMAP_ERROR = imaplib.IMAP4.error


class MailError(RuntimeError):
    """邮件连接或认证失败。消息可直接展示给用户。"""


@dataclass
class SavedAttachment:
    path: Path
    filename: str
    uid: str
    subject: str
    sender: str
    received: str


@dataclass
class BillLink:
    """微信这类「点击下载」邮件：正文里只有一个下载 URL。"""

    url: str
    subject: str
    sender: str
    uid: str


@dataclass
class FetchResult:
    scanned: int = 0
    matched: int = 0
    saved: list[SavedAttachment] = field(default_factory=list)
    links: list[BillLink] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    error: str = ""
    days: int = 7

    def as_dict(self) -> dict:
        return {
            "scanned": self.scanned,
            "matched": self.matched,
            "saved": [
                {"filename": a.filename, "path": str(a.path), "subject": a.subject, "received": a.received}
                for a in self.saved
            ],
            "links": [
                {"url": item.url, "subject": item.subject, "sender": item.sender, "uid": item.uid}
                for item in self.links
            ],
            "skipped": self.skipped[:20],
            "error": self.error,
            "days": self.days,
        }


def _decode_header_value(raw: str) -> str:
    parts = []
    for chunk, encoding in decode_header(raw or ""):
        if isinstance(chunk, bytes):
            parts.append(chunk.decode(encoding or "utf-8", errors="replace"))
        else:
            parts.append(chunk)
    return "".join(parts)


def _safe_name(name: str) -> str:
    name = Path(name).name
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name) or "attachment.zip"


def _looks_like_zip(content: bytes) -> bool:
    """按文件头判断是否真 zip。

    有发信方把 1x1 追踪像素命名为 .zip，只看后缀会把垃圾写进待导入目录。
    """
    if len(content) < 4:
        return False
    return content[:2] == b"PK"


def _looks_like_bill(subject: str, sender: str) -> bool:
    haystack = f"{subject} {sender}".lower()
    return any(token.lower() in haystack for token in BILL_SENDERS + BILL_SUBJECT_HINTS)


def _extract_bill_links(message) -> list[str]:
    """从正文（纯文本或 HTML）里找账单下载链接，只认域名白名单。"""
    found: list[str] = []
    for part in message.walk():
        if part.get_content_maintype() == "multipart":
            continue
        if part.get_content_type() not in ("text/plain", "text/html"):
            continue
        try:
            body = part.get_payload(decode=True) or b""
            text = body.decode(part.get_content_charset() or "utf-8", errors="replace")
        except Exception:
            continue
        for match in re.finditer(r'https?://[^\s"\'<>）)]+', text):
            url = match.group(0)
            host = re.sub(r"^https?://", "", url).split("/")[0].lower()
            if not any(host == allowed or host.endswith("." + allowed) for allowed in BILL_LINK_HOSTS):
                continue
            path = re.sub(r"^https?://[^/]+", "", url).lower()
            if any(path.startswith(denied) for denied in BILL_LINK_DENY_PATHS):
                continue
            if url not in found:
                found.append(url)
    return found


def _download_url(url: str, timeout: int = 60) -> tuple[bytes, str]:
    """下载链接指向的文件。返回 (内容, 建议文件名)。"""
    import urllib.request

    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (myledger)"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content = response.read(MAX_ATTACHMENT_BYTES + 1)
        if len(content) > MAX_ATTACHMENT_BYTES:
            raise MailError("下载内容超过大小上限")
        disposition = response.headers.get("content-disposition", "")
        name = ""
        match = re.search(r"filename\*?=(?:UTF-8'')?\"?([^\";]+)", disposition, re.I)
        if match:
            name = urllib.parse.unquote(match.group(1)).strip()
        if not name:
            path = urllib.parse.urlparse(url).path
            name = Path(path).name or "微信账单.zip"
        # 不能凭后缀猜：追踪链接（如 alipay 的 /web/bi.do）也会被拼成 .zip。
        # 是否真的是账单由调用方按文件头判定。
        if not name.lower().endswith(".zip"):
            name = Path(urllib.parse.urlparse(url).path).name or "attachment"
        return content, name


def delete_attachment(inbox_dir: str | Path, name: str) -> bool:
    """删除待导入目录里的一个附件。拒绝路径穿越与绝对路径。"""
    target_dir = Path(inbox_dir).resolve()
    candidate = (target_dir / name).resolve()
    # 解析后必须仍在该目录内，且是普通文件
    if target_dir not in candidate.parents:
        return False
    if not candidate.is_file():
        return False
    candidate.unlink()
    return True


def _secure_mkdir(path: Path) -> None:
    """建目录并收到只有属主可用。邮件附件里是完整账单，属敏感数据。"""
    path.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path, 0o700)
    except (OSError, NotImplementedError):
        pass


def download_link(link: BillLink, inbox_dir: str | Path) -> SavedAttachment | None:
    """下载链接型邮件的附件并保存。失败抛 MailError。"""
    target_dir = Path(inbox_dir)
    _secure_mkdir(target_dir)
    try:
        content, name = _download_url(link.url)
    except MailError:
        raise
    except Exception as exc:
        raise MailError(f"下载失败：{exc}") from exc

    # 链接可能返回追踪像素或错误页，落盘前同样校验文件头。
    if not _looks_like_zip(content):
        raise MailError(f"下载到的内容不是 zip（{len(content)} 字节），已忽略：{link.url}")

    stamp = datetime.now().strftime("%Y%m%d")
    target = target_dir / f"{stamp}-{link.uid}-{_safe_name(name)}"
    if target.exists():
        return None
    target.write_bytes(content)
    return SavedAttachment(
        path=target, filename=_safe_name(name), uid=link.uid, subject=link.subject,
        sender=link.sender, received="",
    )


def fetch_bill_attachments(
    host: str,
    port: int,
    username: str,
    password: str,
    inbox_dir: str | Path,
    mailbox: str = "INBOX",
    mark_seen: bool = True,
    timeout: int = 30,
    days: int = 7,
) -> FetchResult:
    """连接 IMAP，取未读邮件里的 zip 附件并存到 inbox_dir。"""
    result = FetchResult()
    target_dir = Path(inbox_dir)
    _secure_mkdir(target_dir)

    try:
        if port == 993:
            connection = imaplib.IMAP4_SSL(host, port, ssl_context=ssl.create_default_context(), timeout=timeout)
        else:
            connection = imaplib.IMAP4(host, port, timeout=timeout)
    except (OSError, IMAP_ERROR) as exc:
        raise MailError(f"无法连接邮件服务器 {host}:{port}：{exc}") from exc

    try:
        try:
            connection.login(username, password)
        except IMAP_ERROR as exc:
            raise MailError(
                "邮箱登录失败。QQ 邮箱需要用「授权码」而不是登录密码，"
                "并先在网页端 设置 → 账号 → 开启 IMAP 服务。"
            ) from exc

        status, _ = connection.select(mailbox, readonly=False)
        if status != "OK":
            raise MailError(f"无法打开邮箱目录：{mailbox}")

        # 只看最近 days 天的未读：不指定日期会把几百封历史未读全翻一遍。
        since = (datetime.now() - timedelta(days=max(1, days))).strftime("%d-%b-%Y")
        status, data = connection.search(None, "UNSEEN", "SINCE", since)
        if status != "OK":
            raise MailError("搜索未读邮件失败")

        uids = (data[0] or b"").split()
        result.scanned = len(uids)
        result.days = max(1, days)

        for uid in uids:
            uid_text = uid.decode()
            status, payload = connection.fetch(uid, "(RFC822)")
            if status != "OK" or not payload or not isinstance(payload[0], tuple):
                result.skipped.append(f"UID {uid_text}：读取失败")
                continue

            message = email.message_from_bytes(payload[0][1])
            subject = _decode_header_value(message.get("Subject", ""))
            sender = _decode_header_value(message.get("From", ""))
            received = message.get("Date", "")

            # 关键词只用来标记「像账单」，不作为门槛：
            # 主题不含「账单」但确实带了 zip 的邮件也要收。
            looks_like_bill = _looks_like_bill(subject, sender)
            if looks_like_bill:
                result.matched += 1

            found = False
            bill_links = _extract_bill_links(message)
            for url in bill_links:
                result.links.append(
                    BillLink(url=url, subject=subject, sender=sender, uid=uid_text)
                )
                found = True

            for part in message.walk():
                if part.get_content_maintype() == "multipart":
                    continue
                filename = _decode_header_value(part.get_filename() or "")
                if not filename.lower().endswith(".zip"):
                    continue
                content = part.get_payload(decode=True) or b""
                if not content or len(content) > MAX_ATTACHMENT_BYTES:
                    result.skipped.append(f"{filename}：附件为空或过大")
                    continue
                if not _looks_like_zip(content):
                    result.skipped.append(f"{filename}：不是真正的 zip")
                    continue

                stamp = datetime.now().strftime("%Y%m%d")
                safe = _safe_name(filename)
                target = target_dir / f"{stamp}-{uid_text}-{safe}"
                if target.exists():
                    result.skipped.append(f"{filename}：已存在")
                    continue
                target.write_bytes(content)
                result.saved.append(
                    SavedAttachment(
                        path=target, filename=safe, uid=uid_text, subject=subject, sender=sender, received=received
                    )
                )
                found = True

            if found and mark_seen:
                connection.store(uid, "+FLAGS", "\\Seen")
    finally:
        try:
            connection.logout()
        except Exception:
            pass

    return result
