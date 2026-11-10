"""压缩包解包测试：加密 zip、密码错误、多个账单文件、非 zip。"""

from __future__ import annotations

import io
import unittest

try:
    import pyzipper
except ModuleNotFoundError:  # 系统解释器可能未装；跳过而不是让整套测试失败
    pyzipper = None

from app.archive import ArchiveError, ExtractedBill, PasswordRequired, WrongPassword, extract_bill, is_zip
from app.upload import ImportRejected, import_upload

PASSWORD = "wechat-2026"


def make_zip(entries: dict[str, bytes], password: str | None = None) -> bytes:
    buffer = io.BytesIO()
    kwargs = {"compression": pyzipper.ZIP_DEFLATED}
    if password:
        kwargs.update(encryption=pyzipper.WZ_AES)
    with pyzipper.AESZipFile(buffer, "w", **kwargs) as archive:
        if password:
            archive.setpassword(password.encode("utf-8"))
        for name, content in entries.items():
            archive.writestr(name, content)
    return buffer.getvalue()


ALIPAY = (
    "--------------------------------------------------------------------------------\n"
    "导出信息：\n"
    + "\n" * 20
    + "交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注,\n"
    "2026-10-08 12:00:00,餐饮美食,某餐厅,*,午餐,支出,35.00,花呗,交易成功,20261008001,M001,\n"
).encode("gb18030")


@unittest.skipIf(pyzipper is None, "需要 pyzipper（pip install pyzipper）")
class ExtractBillTest(unittest.TestCase):
    def test_plain_zip_is_rejected_as_not_encrypted_but_extracted(self):
        data = make_zip({"bill.csv": ALIPAY})
        bill = extract_bill(data)
        self.assertIsInstance(bill, ExtractedBill)
        self.assertEqual(bill.filename, "bill.csv")
        self.assertEqual(bill.content, ALIPAY)

    def test_encrypted_zip_needs_password(self):
        data = make_zip({"bill.csv": ALIPAY}, PASSWORD)
        with self.assertRaises(PasswordRequired):
            extract_bill(data)

    def test_encrypted_zip_with_correct_password(self):
        data = make_zip({"bill.csv": ALIPAY}, PASSWORD)
        bill = extract_bill(data, PASSWORD)
        self.assertEqual(bill.content, ALIPAY)

    def test_wrong_password_is_distinguished(self):
        data = make_zip({"bill.csv": ALIPAY}, PASSWORD)
        with self.assertRaises(WrongPassword):
            extract_bill(data, "wrong-password")

    def test_multiple_bills_are_rejected(self):
        data = make_zip({"a.csv": ALIPAY, "b.csv": ALIPAY}, PASSWORD)
        with self.assertRaises(ArchiveError) as ctx:
            extract_bill(data, PASSWORD)
        self.assertIn("多个", str(ctx.exception))

    def test_zip_without_bill_is_rejected(self):
        data = make_zip({"readme.txt": b"hi", "notes.md": b"x"})
        with self.assertRaises(ArchiveError):
            extract_bill(data)

    def test_is_zip_detects_magic(self):
        self.assertTrue(is_zip(make_zip({"a.csv": ALIPAY})))
        self.assertFalse(is_zip(ALIPAY))

    def test_xlsx_is_not_treated_as_zip(self):
        """xlsx 与 zip 魔数相同（PK\x03\x04）；含 [Content_Types].xml 的必须当 xlsx。"""
        from openpyxl import Workbook

        buffer = io.BytesIO()
        Workbook().save(buffer)
        xlsx_bytes = buffer.getvalue()

        self.assertFalse(is_zip(xlsx_bytes))
        with self.assertRaises(ArchiveError):
            extract_bill(xlsx_bytes)

    def test_real_zip_still_recognized_alongside_xlsx(self):
        xlsx_like = {"[Content_Types].xml": b"<Types/>", "xl/workbook.xml": b"<workbook/>"}
        self.assertFalse(is_zip(make_zip(xlsx_like)))
        self.assertTrue(is_zip(make_zip({"bill.csv": ALIPAY})))


@unittest.skipIf(pyzipper is None, "需要 pyzipper（pip install pyzipper）")
class ImportUploadWithZipTest(unittest.TestCase):
    def test_encrypted_zip_imports_end_to_end(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory

        from app import bookkeeping

        data = make_zip({"支付宝账单.csv": ALIPAY}, PASSWORD)
        with TemporaryDirectory() as tmp:
            original = bookkeeping.DB_PATH
            bookkeeping.set_db_path(Path(tmp) / "t.db")
            try:
                bookkeeping.init_db()
                result = import_upload(data, "账单.zip", password=PASSWORD)
            finally:
                bookkeeping.set_db_path(original)

        self.assertEqual(result.source, "alipay")
        self.assertEqual(result.filename, "支付宝账单.csv")
        self.assertEqual(result.unpacked_from, "账单.zip")
        self.assertEqual(result.parsed, 1)

    def test_missing_password_surfaces_actionable_error(self):
        data = make_zip({"bill.csv": ALIPAY}, PASSWORD)
        with self.assertRaises(ImportRejected) as ctx:
            import_upload(data, "bill.zip")
        self.assertIn("密码", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
