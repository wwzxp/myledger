"""上传链路测试：来源识别、拒绝不合规文件、金额分转换。

不启真服务：直接测 upload 的纯函数与 multipart 解析。
"""

from __future__ import annotations

import unittest
from decimal import Decimal

from app import multipart
from app.importers import to_cents
from app.upload import ImportRejected, detect_source


class DetectSourceTest(unittest.TestCase):
    def test_xlsx_by_zip_magic(self):
        self.assertEqual(detect_source(b"PK\x03\x04rest"), "wechat")

    def test_alipay_by_header(self):
        text = "交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注,"
        self.assertEqual(detect_source(text.encode("gb18030")), "alipay")

    def test_wechat_csv_by_header(self):
        text = "交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式"
        self.assertEqual(detect_source(text.encode("utf-8")), "wechat")

    def test_unknown_file_is_rejected_with_actionable_message(self):
        with self.assertRaises(ImportRejected) as ctx:
            detect_source(b"date,amount\n2026-01-01,10")
        self.assertIn("微信", str(ctx.exception))
        self.assertIn("支付宝", str(ctx.exception))

    def test_empty_file_is_rejected(self):
        with self.assertRaises(ImportRejected):
            from app.upload import import_upload

            import_upload(b"", "empty.csv")


class ToCentsTest(unittest.TestCase):
    def test_plain_decimal(self):
        self.assertEqual(to_cents("28.50"), 2850)

    def test_currency_symbol_and_thousands_separator(self):
        self.assertEqual(to_cents("¥1,234.56"), 123456)

    def test_integer_string(self):
        self.assertEqual(to_cents("7"), 700)

    def test_blank_and_slash_mean_zero(self):
        self.assertEqual(to_cents(""), 0)
        self.assertEqual(to_cents("/"), 0)
        self.assertEqual(to_cents(None), 0)

    def test_no_float_rounding_error(self):
        # 0.29 * 100 在浮点下是 28.999999999999996
        self.assertEqual(to_cents("0.29"), 29)
        self.assertEqual(to_cents("1103.28"), 110328)
        self.assertEqual(Decimal("1103.28") * 100, Decimal("110328.00"))


class MultipartTest(unittest.TestCase):
    def test_parses_single_file_field(self):
        boundary = "X"
        body = (
            b"--X\r\n"
            b'Content-Disposition: form-data; name="file"; filename="bill.csv"\r\n'
            b"Content-Type: text/csv\r\n\r\n"
            b"a,b,c\r\n"
            b"--X--\r\n"
        )
        fields, files = multipart.parse_multipart(body, multipart.parse_boundary("multipart/form-data; boundary=X"))
        self.assertEqual(fields, {})
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0].filename, "bill.csv")
        self.assertEqual(files[0].content, b"a,b,c")

    def test_missing_boundary_is_an_error(self):
        with self.assertRaises(multipart.MultipartError):
            multipart.parse_boundary("multipart/form-data")


if __name__ == "__main__":
    unittest.main()

class MultipartPayloadTest(unittest.TestCase):
    """上传是字节级还原：少一个字节，GB18030 的 CSV 就整个解不开。"""

    def _wrap(self, payload: bytes) -> bytes:
        return (
            b"--BOUND\r\n"
            b'Content-Disposition: form-data; name="file"; filename="a.bin"\r\n'
            b"Content-Type: application/octet-stream\r\n\r\n"
            + payload
            + b"\r\n--BOUND--\r\n"
        )

    def test_payload_ending_with_newline_is_not_truncated(self):
        # 真实账单 CSV 以 \n 结尾，曾因 rstrip(b"\r\n") 被吃掉一个字节
        payload = "交易时间,交易分类\n2026-01-01 00:00:00,餐饮\n".encode("gb18030")
        _, files = multipart.parse_multipart(self._wrap(payload), b"BOUND")
        self.assertEqual(files[0].content, payload)

    def test_binary_payload_is_byte_identical(self):
        # xlsx/zip 是二进制，任何 strip 都可能破坏它
        payload = bytes(range(256)) * 8
        _, files = multipart.parse_multipart(self._wrap(payload), b"BOUND")
        self.assertEqual(files[0].content, payload)

    def test_payload_ending_with_crlf_keeps_one_crlf(self):
        payload = b"abc\r\n"
        _, files = multipart.parse_multipart(self._wrap(payload), b"BOUND")
        self.assertEqual(files[0].content, payload)
