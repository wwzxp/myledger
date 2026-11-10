"""美团账单解析。

美团导出的 csv 结构与微信/支付宝都不同：
- 文件头是若干行说明，真正的表头在「【美团交易账单明细列表】」之后
- 时间有两列：交易创建时间 / 交易成功时间，用后者
- 金额有两列：订单金额 / 实付金额，用后者（有优惠时两者不等）
- 「收/支」直接是 支出 / 收入 / 不计收支
"""

from __future__ import annotations

import unittest

from app import importers, upload


def _bill(*rows: list[str]) -> bytes:
    """按美团真实导出结构拼一份 csv。"""
    header = (
        "美团交易账单明细\n"
        "美团用户名：[test]\n"
        "起始时间：[2026-11-01] 终止时间：[2026-11-06]\n"
        "导出交易类型：[全部]\n"
        "导出时间：[2026-11-06 13:40:48]\n"
        '""\n'
        "共：2笔记录\n"
        "支出：2笔 165.84元\n"
        "收入：0笔 0.00元\n"
        "不计收支：0笔 0.00元\n"
        '""\n'
        "特别提示：\n"
        "1. 本明细与实际交易结果不符时，以实际交易情况为准\n"
        '""\n'
        "【美团交易账单明细列表】\n"
        "交易创建时间,交易成功时间,交易类型,订单标题,收/支,支付方式,订单金额,实付金额,交易单号,商家单号,备注\n"
    )
    return (header + "\n".join(",".join(row) for row in rows) + "\n").encode("utf-8-sig")


class MeituanParseTest(unittest.TestCase):
    def test_reads_rows_after_headers(self):
        data = _bill(
            ["2026-11-04 22:27:09", "2026-11-04 23:29:10", "支付", "示例充电服务", "支出",
             "微信支付", "¥6.87", "¥6.87", "261104111", "1102432", "/"],
            ["2026-11-04 22:26:22", "2026-11-04 22:26:23", "支付", "示例鸡煲店", "支出",
             "美团月付", "¥158.97", "¥158.97", "261104112", "1MENG4", "/"],
        )
        rows = importers.read_meituan_rows(data)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["amount_cents"], 687)
        self.assertEqual(rows[0]["type"], "支出")
        self.assertEqual(rows[0]["transaction_object"], "示例充电服务")
        self.assertEqual(rows[1]["amount_cents"], 15897)

    def test_uses_success_time_not_create_time(self):
        data = _bill(
            ["2026-11-04 22:27:09", "2026-11-04 23:29:10", "支付", "测试", "支出",
             "微信支付", "¥1.00", "¥1.00", "x", "y", "/"],
        )
        rows = importers.read_meituan_rows(data)
        self.assertEqual(rows[0]["transaction_time"], "2026-11-04 23:29:10")

    def test_uses_paid_amount_not_order_amount(self):
        """有优惠时订单金额 ≠ 实付金额，记账要用实付。"""
        data = _bill(
            ["2026-11-04 10:00:00", "2026-11-04 10:00:01", "支付", "测试", "支出",
             "微信支付", "¥20.00", "¥15.80", "x", "y", "/"],
        )
        rows = importers.read_meituan_rows(data)
        self.assertEqual(rows[0]["amount_cents"], 1580)

    def test_neutral_rows_kept(self):
        data = _bill(
            ["2026-11-04 10:00:00", "2026-11-04 10:00:01", "充值", "余额充值", "不计收支",
             "微信支付", "¥30.00", "¥30.00", "x", "y", "/"],
        )
        rows = importers.read_meituan_rows(data)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["type"], "不计收支")
        self.assertEqual(rows[0]["amount_cents"], 3000)

    def test_refund_is_income(self):
        data = _bill(
            ["2026-11-04 10:00:00", "2026-11-04 10:00:01", "退款", "订单退款", "收入",
             "微信支付", "¥12.00", "¥12.00", "x", "y", "/"],
        )
        rows = importers.read_meituan_rows(data)
        self.assertEqual(rows[0]["type"], "收入")
        self.assertEqual(rows[0]["amount_cents"], 1200)

    def test_empty_bill_rejected(self):
        data = _bill()
        with self.assertRaises(importers.ImportRejected):
            importers.read_meituan_rows(data)


class MeituanDetectSourceTest(unittest.TestCase):
    def test_detect_meituan(self):
        data = _bill(
            ["2026-11-04 10:00:00", "2026-11-04 10:00:01", "支付", "测试", "支出",
             "微信支付", "¥1.00", "¥1.00", "x", "y", "/"],
        )
        self.assertEqual(upload.detect_source(data), "meituan")

    def test_meituan_not_confused_with_wechat(self):
        """美团表头也含「交易类型」，不能被误判成微信。"""
        data = _bill(
            ["2026-11-04 10:00:00", "2026-11-04 10:00:01", "支付", "测试", "支出",
             "微信支付", "¥1.00", "¥1.00", "x", "y", "/"],
        )
        self.assertNotEqual(upload.detect_source(data), "wechat")


if __name__ == "__main__":
    unittest.main()
