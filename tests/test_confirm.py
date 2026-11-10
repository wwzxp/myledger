"""确认链路测试：中性交易（不计收支）必须能在没有分类的情况下确认。

这是回归测试：修复前，前端 `confirmPending` 在分类为空时直接 return，
后端 `update_entry` 也拒绝无分类的非转账条目，导致点击「确认」静默无反应。
"""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app import bookkeeping


class NeutralConfirmTest(unittest.TestCase):
    def setUp(self):
        self._tmp = TemporaryDirectory()
        self._original = bookkeeping.DB_PATH
        bookkeeping.set_db_path(Path(self._tmp.name) / "test.db")
        bookkeeping.init_db()

    def tearDown(self):
        bookkeeping.set_db_path(self._original)
        self._tmp.cleanup()

    def _insert_neutral_pending(self) -> int:
        conn = bookkeeping.connect()
        try:
            cursor = conn.execute(
                """
                insert into entries (transaction_time, type, category, status, amount_cents,
                                     currency, transaction_object, account, target_account,
                                     participant, balance_delta_cents, actual_balance_cents, note)
                values ('2026-11-03 09:26:03', '不计收支', '', 'pending', 149700,
                        'CNY', '工商银行(4938)', '工商银行储蓄卡(4938)', '', '自己', 0, 0, '零钱提现')
                """
            )
            conn.commit()
            return int(cursor.lastrowid)
        finally:
            conn.close()

    def test_neutral_entry_confirms_without_category(self):
        entry_id = self._insert_neutral_pending()
        bookkeeping.confirm_entry(entry_id, "", source="pending")

        conn = bookkeeping.connect()
        try:
            row = conn.execute("select status, category from entries where id = ?", (entry_id,)).fetchone()
        finally:
            conn.close()

        self.assertEqual(row["status"], "confirmed")
        self.assertEqual(row["category"] or "", "")

    def test_expense_still_requires_category(self):
        conn = bookkeeping.connect()
        try:
            cursor = conn.execute(
                """
                insert into entries (transaction_time, type, category, status, amount_cents,
                                     currency, transaction_object, account, target_account,
                                     participant, balance_delta_cents, actual_balance_cents, note)
                values ('2026-11-05 11:36:59', '支出', '', 'pending', 1590,
                        'CNY', '肯德基', '招商银行信用卡(1455)', '', '自己', 0, 0, '')
                """
            )
            conn.commit()
            entry_id = int(cursor.lastrowid)
        finally:
            conn.close()

        with self.assertRaises(ValueError):
            bookkeeping.confirm_entry(entry_id, "", source="pending")


if __name__ == "__main__":
    unittest.main()
