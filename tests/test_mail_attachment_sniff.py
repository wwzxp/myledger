"""附件识别的边界。

两个真实踩到的坑：
1. 有些邮件会把 1x1 追踪像素伪装成 `.zip` 附件名，写入磁盘后导入必然失败。
2. 主题里不含「账单」关键词、但确实带了 zip 附件的邮件曾被整体跳过。
"""

from __future__ import annotations

import unittest

from app import mailbox
from app.mailbox import _looks_like_zip, _looks_like_bill

# 1x1 透明 GIF，某些发信方把它命名为 xxx.zip
GIF_BYTES = (
    b"GIF89a\x01\x00\x01\x00\x80\x01\x00\x00\x00\x00\xff\xff\xff!\xf9\x04"
    b"\x01\x00\x00\x01\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02L\x01\x00;"
)


class ZipSniffTest(unittest.TestCase):
    def test_real_zip_passes(self):
        self.assertTrue(_looks_like_zip(b"PK\x03\x04" + b"\x00" * 32))

    def test_empty_zip_passes(self):
        # 空 zip 的结束记录也以 PK 开头
        self.assertTrue(_looks_like_zip(b"PK\x05\x06" + b"\x00" * 18))

    def test_gif_named_zip_rejected(self):
        self.assertFalse(_looks_like_zip(GIF_BYTES))

    def test_plain_text_rejected(self):
        self.assertFalse(_looks_like_zip(b"not a zip at all"))

    def test_empty_payload_rejected(self):
        self.assertFalse(_looks_like_zip(b""))

    def test_short_payload_rejected(self):
        self.assertFalse(_looks_like_zip(b"PK"))


class TrackingLinkTest(unittest.TestCase):
    """支付宝正文里的 kcart.alipay.com/web/bi.do 是埋点像素，不是账单。"""

    def test_build_message(self):
        from email.message import EmailMessage

        message = EmailMessage()
        message["Subject"] = "演示用户的支付宝交易流水明细"
        message["From"] = "service@mail.alipay.com"
        message.set_content(
            '<img src="https://kcart.alipay.com/web/bi.do?screen=-&BIProfile=gotone" />',
            subtype="html",
        )
        self.assertEqual(mailbox._extract_bill_links(message), [])

    def test_real_bill_link_kept(self):
        from email.message import EmailMessage

        message = EmailMessage()
        message["Subject"] = "账单"
        message["From"] = "wechat@tenpay.com"
        message.set_content("https://wx.tenpay.com/download/bill.zip")
        self.assertEqual(
            mailbox._extract_bill_links(message),
            ["https://wx.tenpay.com/download/bill.zip"],
        )


class WechatLinkHostTest(unittest.TestCase):
    """微信账单邮件的真实下载域名是 tenpay.wechatpay.cn（.cn）。

    白名单一度只有 wx.tenpay.com / tenpay.com，导致微信账单邮件
    命中了关键词却既没有附件也没有链接，静默丢弃。
    """

    def _links_in(self, url):
        from email.message import EmailMessage

        message = EmailMessage()
        message["Subject"] = "微信支付-账单流水文件"
        message["From"] = "wechatpay@tencent.com"
        message.set_content(f"下载账单 {url}")
        return mailbox._extract_bill_links(message)

    def test_wechatpay_cn_kept(self):
        url = (
            "https://tenpay.wechatpay.cn/userroll/userbilldownload/"
            "downloadfilefromemail?encrypted_file_data=ABC"
        )
        self.assertEqual(self._links_in(url), [url])

    def test_legacy_wx_tenpay_kept(self):
        url = "https://wx.tenpay.com/download/bill.zip"
        self.assertEqual(self._links_in(url), [url])

    def test_lookalike_host_rejected(self):
        url = "https://evil-wechatpay.cn.attacker.com/bill.zip"
        self.assertEqual(self._links_in(url), [])


class BillFilterTest(unittest.TestCase):
    def test_wechat_subject_matches(self):
        self.assertTrue(_looks_like_bill("微信支付账单", "wechat@tencent.com"))

    def test_alipay_sender_matches(self):
        self.assertTrue(_looks_like_bill("交易提醒", "service@mail.alipay.com"))

    def test_unknown_subject_does_not_match(self):
        self.assertFalse(_looks_like_bill("本周推荐", "news@shop.example.com"))


if __name__ == "__main__":
    unittest.main()
