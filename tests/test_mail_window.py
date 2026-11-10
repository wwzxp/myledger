"""邮件扫描范围与附件删除的测试。

两件事：
1. 只扫最近 N 天的未读邮件（不能把历史未读全翻一遍）。
2. 待导入的压缩包能被删除（邮件里的附件不一定是想要的）。
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

from app import mailbox


class FakeIMAP:
    """记录收到的搜索条件，供断言使用。"""

    instances: list["FakeIMAP"] = []
    messages: dict[bytes, bytes] = {}

    def __init__(self, host, port, **kwargs):
        self.search_args = None
        self.stored = []
        FakeIMAP.instances.append(self)

    def login(self, username, password):
        return "OK", [b""]

    def select(self, mailbox_name, readonly=False):
        return "OK", [b"1"]

    def search(self, charset, *criteria):
        self.search_args = criteria
        return "OK", [b" ".join(FakeIMAP.messages.keys())]

    def fetch(self, uid, parts):
        from email.message import EmailMessage

        message = EmailMessage()
        message["Subject"] = "微信支付账单"
        message["From"] = "wechatpay@tencent.com"
        message["Date"] = "Thu, 06 Nov 2026 10:00:00 +0800"
        message.set_content("账单")
        message.add_attachment(b"PK\x03\x04data", maintype="application", subtype="zip", filename="bill.zip")
        return "OK", [(uid + b" (RFC822)", message.as_bytes())]

    def store(self, uid, flag, value):
        self.stored.append((uid, flag, value))
        return "OK", [b""]

    def logout(self):
        return "BYE", [b""]


class ScanWindowTest(unittest.TestCase):
    def setUp(self):
        FakeIMAP.instances = []
        FakeIMAP.messages = {b"1": b"x"}
        self._orig_ssl = mailbox.imaplib.IMAP4_SSL
        self._orig_plain = mailbox.imaplib.IMAP4
        mailbox.imaplib.IMAP4_SSL = FakeIMAP
        mailbox.imaplib.IMAP4 = FakeIMAP

    def tearDown(self):
        mailbox.imaplib.IMAP4_SSL = self._orig_ssl
        mailbox.imaplib.IMAP4 = self._orig_plain

    def test_search_uses_since_date(self):
        with TemporaryDirectory() as tmp:
            mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "code", tmp, days=7)
            args = FakeIMAP.instances[-1].search_args
            joined = " ".join(a.decode() if isinstance(a, bytes) else str(a) for a in args)
            self.assertIn("UNSEEN", joined)
            self.assertIn("SINCE", joined)

    def test_since_date_matches_days_window(self):
        with TemporaryDirectory() as tmp:
            mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "code", tmp, days=7)
            args = FakeIMAP.instances[-1].search_args
            joined = " ".join(a.decode() if isinstance(a, bytes) else str(a) for a in args)
            expected = (datetime.now() - timedelta(days=7)).strftime("%d-%b-%Y")
            self.assertIn(expected, joined)

    def test_default_window_is_seven_days(self):
        with TemporaryDirectory() as tmp:
            mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "code", tmp)
            args = FakeIMAP.instances[-1].search_args
            joined = " ".join(a.decode() if isinstance(a, bytes) else str(a) for a in args)
            expected = (datetime.now() - timedelta(days=7)).strftime("%d-%b-%Y")
            self.assertIn(expected, joined)


class DeleteAttachmentTest(unittest.TestCase):
    def test_delete_removes_file(self):
        with TemporaryDirectory() as tmp:
            inbox = Path(tmp)
            target = inbox / "20261106-1-账单.zip"
            target.write_bytes(b"PK\x03\x04")
            self.assertTrue(mailbox.delete_attachment(inbox, target.name))
            self.assertFalse(target.exists())

    def test_delete_missing_returns_false(self):
        with TemporaryDirectory() as tmp:
            self.assertFalse(mailbox.delete_attachment(Path(tmp), "nope.zip"))

    def test_delete_rejects_path_traversal(self):
        with TemporaryDirectory() as tmp:
            inbox = Path(tmp) / "inbox"
            inbox.mkdir()
            outside = Path(tmp) / "secret.zip"
            outside.write_bytes(b"x")
            self.assertFalse(mailbox.delete_attachment(inbox, "../secret.zip"))
            self.assertTrue(outside.exists())

    def test_delete_rejects_absolute_path(self):
        with TemporaryDirectory() as tmp:
            outside = Path(tmp) / "x.zip"
            outside.write_bytes(b"x")
            self.assertFalse(mailbox.delete_attachment(Path(tmp) / "inbox", str(outside)))


if __name__ == "__main__":
    unittest.main()
