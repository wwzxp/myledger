"""邮件附件提取测试：用假 IMAP 连接验证解析与落盘，不连真实邮箱。"""

from __future__ import annotations

import unittest
from email.message import EmailMessage
from pathlib import Path
from tempfile import TemporaryDirectory

from app import mailbox


def build_message(subject: str, sender: str, attach_name: str, payload: bytes, is_zip=True) -> bytes:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["Date"] = "Thu, 06 Nov 2026 08:00:00 +0800"
    message.set_content("账单见附件")
    maintype, subtype = ("application", "zip") if is_zip else ("text", "plain")
    message.add_attachment(payload, maintype=maintype, subtype=subtype, filename=attach_name)
    return message.as_bytes()


class FakeIMAP:
    """最小可用的 IMAP 替身，只实现 mailbox 用到的几个方法。"""

    instances: list["FakeIMAP"] = []
    messages: dict[bytes, bytes] = {}
    login_error: Exception | None = None

    def __init__(self, host, port, **kwargs):
        if FakeIMAP.login_error:
            raise FakeIMAP.login_error
        self.host = host
        self.port = port
        self.stored: list[tuple[bytes, str, str]] = []
        self.logged_out = False
        FakeIMAP.instances.append(self)

    def login(self, username, password):
        if password != "good-auth-code":
            raise mailbox.IMAP_ERROR("AUTHENTICATIONFAILED")
        return "OK", [b""]

    def select(self, mailbox_name, readonly=False):
        return "OK", [b"1"]

    def search(self, charset, *criteria):
        return "OK", [b" ".join(FakeIMAP.messages.keys())]

    def fetch(self, uid, parts):
        return "OK", [(uid + b" (RFC822)", FakeIMAP.messages[uid])]

    def store(self, uid, flag, value):
        self.stored.append((uid, flag, value))
        return "OK", [b""]

    def logout(self):
        self.logged_out = True
        return "BYE", [b""]


class MailboxTest(unittest.TestCase):
    def setUp(self):
        FakeIMAP.instances = []
        FakeIMAP.login_error = None
        FakeIMAP.messages = {
            b"101": build_message("微信支付账单", "wechat@tenpay.com", "微信账单.zip", b"PK\x03\x04zipdata"),
            b"102": build_message("支付宝交易流水", "service@mail.alipay.com", "alipay.zip", b"PK\x03\x04more"),
            b"103": build_message("周末聚餐照片", "friend@example.com", "photo.zip", b"notabill"),
            b"104": build_message("微信支付账单", "wechat@tenpay.com", "账单.txt", b"plain", is_zip=False),
        }
        self._orig = mailbox.imaplib.IMAP4_SSL
        mailbox.imaplib.IMAP4_SSL = FakeIMAP
        self._orig_plain = mailbox.imaplib.IMAP4
        mailbox.imaplib.IMAP4 = FakeIMAP

    def tearDown(self):
        mailbox.imaplib.IMAP4_SSL = self._orig
        mailbox.imaplib.IMAP4 = self._orig_plain

    def test_extracts_only_bill_zip_attachments(self):
        with TemporaryDirectory() as tmp:
            result = mailbox.fetch_bill_attachments(
                "imap.qq.com", 993, "me@qq.com", "good-auth-code", tmp
            )
            names = sorted(a.filename for a in result.saved)
            self.assertEqual(names, ["alipay.zip", "微信账单.zip"])
            self.assertEqual(result.scanned, 4)
            self.assertEqual(result.matched, 3)  # 103 主题不含账单关键词但发件人也不是；104 是账单但非 zip
            for saved in result.saved:
                self.assertTrue(saved.path.is_file())
                self.assertGreater(saved.path.stat().st_size, 0)

    def test_accepts_zip_without_bill_keywords(self):
        """主题和发件人都不含账单关键词，但带了真 zip 附件，也要收。"""
        with TemporaryDirectory() as tmp:
            FakeIMAP.messages = {
                b"201": build_message("资料包", "someone@example.com", "账单.zip", b"PK\x03\x04zipdata"),
            }
            result = mailbox.fetch_bill_attachments(
                "imap.qq.com", 993, "me@qq.com", "good-auth-code", tmp
            )
            self.assertEqual([a.filename for a in result.saved], ["账单.zip"])

    def test_rejects_fake_zip_attachment(self):
        """后缀是 .zip 但内容是 GIF 追踪像素，不能落盘。"""
        with TemporaryDirectory() as tmp:
            FakeIMAP.messages = {
                b"301": build_message(
                    "微信支付账单", "wechat@tenpay.com", "bi.do.zip",
                    b"GIF89a\x01\x00\x01\x00\x80\x01\x00\x00\x00\x00\xff\xff\xff",
                ),
            }
            result = mailbox.fetch_bill_attachments(
                "imap.qq.com", 993, "me@qq.com", "good-auth-code", tmp
            )
            self.assertEqual(result.saved, [])
            self.assertTrue(any("不是真正的 zip" in note for note in result.skipped))

    def test_marks_processed_mail_as_seen(self):
        with TemporaryDirectory() as tmp:
            mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "good-auth-code", tmp)
            instance = FakeIMAP.instances[-1]
            marked = {uid for uid, _flag, _value in instance.stored}
            self.assertEqual(marked, {b"101", b"102"})

    def test_non_zip_bill_is_skipped_not_saved(self):
        with TemporaryDirectory() as tmp:
            result = mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "good-auth-code", tmp)
            self.assertNotIn("账单.txt", [a.filename for a in result.saved])

    def test_wrong_auth_code_gives_actionable_error(self):
        with TemporaryDirectory() as tmp:
            with self.assertRaises(mailbox.MailError) as ctx:
                mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "wrong", tmp)
            self.assertIn("授权码", str(ctx.exception))

    def test_connection_failure_is_wrapped(self):
        def boom(*args, **kwargs):
            raise OSError("network down")

        mailbox.imaplib.IMAP4_SSL = boom
        with TemporaryDirectory() as tmp:
            with self.assertRaises(mailbox.MailError) as ctx:
                mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "good-auth-code", tmp)
            self.assertIn("无法连接", str(ctx.exception))

    def test_second_run_does_not_overwrite_same_uid(self):
        with TemporaryDirectory() as tmp:
            first = mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "good-auth-code", tmp)
            second = mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "good-auth-code", tmp)
            self.assertEqual(len(first.saved), 2)
            self.assertEqual(len(second.saved), 0)
            self.assertTrue(any("已存在" in reason for reason in second.skipped))


if __name__ == "__main__":
    unittest.main()
