"""邮件账单的两种形态：附件型与链接型。

这是对 `test_mailbox.py` 的补充：原测试只覆盖附件型，
而真实邮件里微信是「点击下载」链接、支付宝是 zip 附件。
"""

from __future__ import annotations

import unittest
from email.message import EmailMessage
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from app import mailbox

WECHAT_LINK = "https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmmspliced?package=abc&type=download"


def build_link_message(subject: str, sender: str, body_html: str) -> bytes:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["Date"] = "Thu, 06 Nov 2026 10:00:00 +0800"
    message.set_content("请使用 HTML 查看")
    message.add_alternative(body_html, subtype="html")
    return message.as_bytes()


def build_attachment_message(subject: str, sender: str, name: str, payload: bytes) -> bytes:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["Date"] = "Thu, 06 Nov 2026 11:00:00 +0800"
    message.set_content("账单见附件")
    message.add_attachment(payload, maintype="application", subtype="zip", filename=name)
    return message.as_bytes()


class FakeIMAP:
    instances: list["FakeIMAP"] = []
    messages: dict[bytes, bytes] = {}

    def __init__(self, host, port, **kwargs):
        self.stored = []
        FakeIMAP.instances.append(self)

    def login(self, username, password):
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
        return "BYE", [b""]


class LinkAndAttachmentTest(unittest.TestCase):
    def setUp(self):
        FakeIMAP.instances = []
        FakeIMAP.messages = {
            b"201": build_link_message("微信支付账单流水文件", "微信支付 <wechatpay@tencent.com>", f'<p>已生成</p><a href="{WECHAT_LINK}">点击下载</a>'),
            b"202": build_attachment_message("支付宝交易流水明细", "支付宝提醒 <service@mail.alipay.com>", "支付宝交易明细.zip", b"PK\x03\x04data"),
        }
        self._orig_ssl = mailbox.imaplib.IMAP4_SSL
        self._orig_plain = mailbox.imaplib.IMAP4
        mailbox.imaplib.IMAP4_SSL = FakeIMAP
        mailbox.imaplib.IMAP4 = FakeIMAP

    def tearDown(self):
        mailbox.imaplib.IMAP4_SSL = self._orig_ssl
        mailbox.imaplib.IMAP4 = self._orig_plain

    def test_link_mail_yields_download_url_not_file(self):
        with TemporaryDirectory() as tmp:
            result = mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "code", tmp)
            links = [item.url for item in result.links]
            self.assertTrue(any("wx.tenpay.com" in url for url in links), links)
            # 链接型不应产生本地文件
            self.assertEqual([a.filename for a in result.saved], ["支付宝交易明细.zip"])

    def test_attachment_mail_still_saved(self):
        with TemporaryDirectory() as tmp:
            result = mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "code", tmp)
            self.assertEqual(len(result.saved), 1)
            self.assertTrue(result.saved[0].path.is_file())

    def test_both_kinds_marked_seen(self):
        with TemporaryDirectory() as tmp:
            mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "code", tmp)
            marked = {uid for uid, _f, _v in FakeIMAP.instances[-1].stored}
            self.assertEqual(marked, {b"201", b"202"})

    def test_non_bill_link_not_collected(self):
        FakeIMAP.messages = {
            b"203": build_link_message("促销活动", "shop@example.com", '<a href="https://shop.example.com/sale">立即购买</a>'),
        }
        with TemporaryDirectory() as tmp:
            result = mailbox.fetch_bill_attachments("imap.qq.com", 993, "me@qq.com", "code", tmp)
            self.assertEqual(result.links, [])

    def test_link_download_saves_zip(self):
        """点击下载链接应把文件存到 inbox，并能被后续导入流程使用。"""
        with TemporaryDirectory() as tmp:
            with mock.patch.object(mailbox, "_download_url", return_value=(b"PK\x03\x04downloaded", "微信账单.zip")):
                saved = mailbox.download_link(
                    mailbox.BillLink(url=WECHAT_LINK, subject="微信支付账单", sender="wechatpay@tencent.com", uid="201"),
                    tmp,
                )
            self.assertIsNotNone(saved)
            self.assertTrue(saved.path.is_file())
            self.assertEqual(saved.path.read_bytes()[:4], b"PK\x03\x04")


if __name__ == "__main__":
    unittest.main()
