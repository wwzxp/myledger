"""导入链路测试：只断言外部可观测结果。

fixture 为合成账单（字段结构与真实导出一致，姓名/账号/流水号为假值），
不使用真实账单。
"""

from __future__ import annotations

import csv
import io
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from openpyxl import Workbook

from app.importers import alipay_header, read_alipay_rows, read_wechat_rows


def _write_alipay_csv(path: Path, rows: list[list[str]], header_offset: int = 24) -> None:
    """写一个 GB18030 编码、带前置说明行的支付宝账单。"""
    lines = ["--------------------------------------------------------------------------------"]
    lines += ["导出信息："] + [""] * (header_offset - 3)
    lines.append(alipay_header())
    lines += [",".join(row) for row in rows]
    path.write_bytes(("\n".join(lines) + "\n").encode("gb18030"))


def _write_wechat_xlsx(path: Path, rows: list[list[str]], header_offset: int = 18) -> None:
    workbook = Workbook()
    sheet = workbook.active
    for _ in range(header_offset - 1):
        sheet.append([])
    sheet.append(
        [
            "交易时间", "交易类型", "交易对方", "商品", "收/支", "金额(元)",
            "支付方式", "当前状态", "交易单号", "商户单号", "备注",
        ]
    )
    for row in rows:
        sheet.append(row)
    workbook.save(path)


class AlipayImporterTest(unittest.TestCase):
    def test_reads_gb18030_and_maps_fields(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "alipay.csv"
            _write_alipay_csv(
                path,
                [["2026-10-08 12:00:00", "餐饮美食", "某餐厅", "*", "午餐", "支出", "35.00", "花呗", "交易成功", "20261008001", "M001", ""]],
            )
            rows = read_alipay_rows(path)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["amount_cents"], 3500)
            self.assertEqual(rows[0]["type"], "支出")
            self.assertEqual(rows[0]["transaction_object"], "某餐厅")

    def test_neutral_transaction_is_not_income_or_expense(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "alipay.csv"
            _write_alipay_csv(
                path,
                [["2026-10-09 09:00:00", "投资理财", "余额宝", "*", "转入", "不计收支", "1000.00", "账户余额", "交易成功", "20261009001", "", ""]],
            )
            rows = read_alipay_rows(path)
            self.assertEqual(rows[0]["type"], "不计收支")

    def test_header_detection_survives_extra_leading_lines(self):
        # 上游 DEG 的 issue #236 就是因为按固定行号跳过而吞掉首笔。
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "alipay.csv"
            _write_alipay_csv(
                path,
                [["2026-10-10 08:00:00", "交通出行", "地铁", "*", "通勤", "支出", "4.00", "零钱", "交易成功", "20261010001", "", ""]],
                header_offset=26,
            )
            rows = read_alipay_rows(path)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["amount_cents"], 400)


class WechatImporterTest(unittest.TestCase):
    def test_reads_xlsx_and_keeps_neutral_rows(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "wechat.xlsx"
            _write_wechat_xlsx(
                path,
                [
                    ["2026-10-08 12:00:00", "商户消费", "美团", "外卖", "支出", "¥28.50", "零钱", "支付成功", "W001", "M001", ""],
                    ["2026-10-09 10:00:00", "零钱提现", "招商银行储蓄卡", "", "", "¥500.00", "零钱", "已到账", "W002", "", ""],
                ],
            )
            rows = read_wechat_rows(path.read_bytes())
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["amount_cents"], 2850)
            self.assertEqual(rows[1]["type"], "不计收支")

    def test_amount_symbol_is_stripped(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "wechat.xlsx"
            _write_wechat_xlsx(
                path,
                [["2026-10-11 19:00:00", "商户消费", "某超市", "日用", "支出", "¥1,234.56", "零钱", "支付成功", "W003", "", ""]],
            )
            rows = read_wechat_rows(path.read_bytes())
            self.assertEqual(rows[0]["amount_cents"], 123456)


if __name__ == "__main__":
    unittest.main()


class ModuleLoaderTest(unittest.TestCase):
    """打包态（PyInstaller）里 app/ 下没有 .py 源文件。

    importers 曾用 spec_from_file_location 按路径加载，打包后必然
    FileNotFoundError，表现为「导入账单直接 400」。
    """

    def test_loads_from_package_when_source_file_missing(self):
        import sys
        from pathlib import Path
        from unittest import mock

        from app import importers

        sys.modules.pop("bookkeeping", None)
        # 模拟打包态：_MODULE_DIR 下找不到 bookkeeping.py
        missing = Path("/nonexistent-packed-dir")
        with mock.patch.object(importers, "_MODULE_DIR", missing):
            module = importers._load("bookkeeping", "bookkeeping.py")
        self.assertTrue(hasattr(module, "valid_categories"))
