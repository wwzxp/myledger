"""抖音支付 PDF 账单解析。

抖音导出的「支付交易流水」是 PDF，不是 csv/xlsx，排版是单列无框线：
字段按 x 坐标分列，超宽内容会折行——「招商银行信用卡（1455）」在 PDF 里
被断成「招商银行信用卡（1」+「455）」，交易单号与商家单号同样会断。

解析分两层：
- `read_douyin_rows(data)`：用 pdfplumber 取词，再交给下面的纯函数
- `douyin_records(words)`：只依赖词坐标，可脱离 PDF 测试

测试直接喂合成坐标，不需要生成 PDF，也不需要真实账单（含身份证号）。
"""

from __future__ import annotations

import unittest

from app import importers


# 表头在真实 PDF 里的 x 起点（取自抖音导出样本）
HEADER_X = {
    "交易时间": 53.95,
    "收/支/其他": 127.20,
    "金额（元）": 192.52,
    "收/付款方式": 276.62,
    "交易单号": 423.87,
    "交易对方": 575.53,
    "商家单号": 713.01,
}


def w(text, column, top):
    """按列名造一个「词」，x 用该列表头的 x 起点。"""
    return {"text": text, "x0": HEADER_X[column], "top": top}


def header(top=200.0):
    return [w(name, name, top) for name in HEADER_X]


class ColumnReconstructTest(unittest.TestCase):
    def test_single_row(self):
        words = header() + [
            w("2026-10-30", "交易时间", 220), w("11:43:27", "交易时间", 220),
            w("支出", "收/支/其他", 220),
            w("146.70", "金额（元）", 220),
            w("招商银行信用卡（1455）", "收/付款方式", 220),
            w("ST2026103011431935274281340255", "交易单号", 220),
            w("亲友付", "交易对方", 220),
            w("2105012610300505348977460255", "商家单号", 220),
        ]
        rows = importers.douyin_records(words)
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(r["transaction_time"], "2026-10-30 11:43:27")
        self.assertEqual(r["type"], "支出")
        self.assertEqual(r["amount_cents"], 14670)
        self.assertEqual(r["account"], "招商银行信用卡（1455）")
        self.assertEqual(r["transaction_object"], "亲友付")

    def test_wrapped_fragments_join(self):
        """折行的两段必须拼回同一个字段，且不漏字。"""
        words = header() + [
            w("2026-10-30", "交易时间", 220), w("11:43:27", "交易时间", 220),
            w("支出", "收/支/其他", 220),
            w("146.70", "金额（元）", 220),
            w("招商银行信用卡（1", "收/付款方式", 220),
            w("ST20261030114319352742813402", "交易单号", 220),
            w("亲友付", "交易对方", 220),
            w("210501261030050534897746", "商家单号", 220),
            # 折行：下一行的同列片段
            w("455）", "收/付款方式", 232),
            w("0255", "交易单号", 232),
            w("0255", "商家单号", 232),
        ]
        r = importers.douyin_records(words)[0]
        self.assertEqual(r["account"], "招商银行信用卡（1455）")
        self.assertIn("ST202610301143193527428134020255", r["note"])
        self.assertIn("2105012610300505348977460255", r["note"])

    def test_multiple_rows_split_by_date(self):
        words = header() + [
            w("2026-10-30", "交易时间", 220), w("支出", "收/支/其他", 220), w("10.00", "金额（元）", 220),
            w("亲友付", "交易对方", 220),
            w("2026-10-21", "交易时间", 260), w("支出", "收/支/其他", 260), w("20.00", "金额（元）", 260),
            w("抖音电商", "交易对方", 260),
        ]
        rows = importers.douyin_records(words)
        self.assertEqual([r["amount_cents"] for r in rows], [1000, 2000])
        self.assertEqual([r["transaction_object"] for r in rows], ["亲友付", "抖音电商"])

    def test_neutral_type_mapped(self):
        words = header() + [
            w("2026-10-30", "交易时间", 220), w("其他", "收/支/其他", 220), w("20.00", "金额（元）", 220),
        ]
        self.assertEqual(importers.douyin_records(words)[0]["type"], "不计收支")

    def test_income_type(self):
        words = header() + [
            w("2026-10-30", "交易时间", 220), w("收入", "收/支/其他", 220), w("5.00", "金额（元）", 220),
        ]
        self.assertEqual(importers.douyin_records(words)[0]["type"], "收入")

    def test_unknown_type_skipped(self):
        words = header() + [
            w("2026-10-30", "交易时间", 220), w("待定", "收/支/其他", 220), w("20.00", "金额（元）", 220),
        ]
        self.assertEqual(importers.douyin_records(words), [])

    def test_no_header_yields_nothing(self):
        words = [w("2026-10-30", "交易时间", 220), w("支出", "收/支/其他", 220), w("1.00", "金额（元）", 220)]
        self.assertEqual(importers.douyin_records(words), [])

    def test_empty_yields_nothing(self):
        self.assertEqual(importers.douyin_records([]), [])


class DouyinDetectTest(unittest.TestCase):
    def test_detect_pdf(self):
        from app import upload

        self.assertEqual(upload.detect_source(b"%PDF-1.3\n..."), "douyin")


class DouyinArchiveTest(unittest.TestCase):
    def test_pdf_accepted(self):
        from app.archive import _looks_like_bill

        self.assertTrue(_looks_like_bill("dy_202611061350100510014239612584133.pdf"))

    def test_csv_still_accepted(self):
        from app.archive import _looks_like_bill

        self.assertTrue(_looks_like_bill("支付宝交易明细.csv"))
        self.assertTrue(_looks_like_bill("微信账单.xlsx"))


if __name__ == "__main__":
    unittest.main()
