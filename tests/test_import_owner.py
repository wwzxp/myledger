"""导入必须落到当前用户名下，且重复导入要有可见反馈。

两个真实故障：
1. 导入链路没有传 owner_id，所有条目落到 owner_id=0，用户在界面上看不到自己的数据。
2. 同一份账单重复导入时全部被去重，但结果里没有 deduped 字段，
   前端只显示「新增 0 笔」，用户以为导入失败。
"""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app import bookkeeping, upload


ALIPAY_CSV = (
    "------------------------------------------------------------------------------------\n"
    "导出信息：\n"
    "姓名：测试\n"
    "支付宝账户：test@example.com\n"
    "起始时间：[2026-11-01 00:00:00] 终止时间：[2026-11-05 23:59:59]\n"
    "导出交易类型：[全部]\n"
    "导出时间：[2026-11-06 10:00:00]\n"
    "共2笔记录\n"
    "------------------------------------------------------------------------------------\n"
    "交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注\n"
    "2026-11-01 12:00:00,餐饮美食,某餐厅,,午餐,支出,25.00,余额,交易成功,20261101001,M001,\n"
    "2026-11-02 09:00:00,交通出行,地铁,,乘车,支出,4.00,余额,交易成功,20261102001,M002,\n"
)


class OwnerAttributionTest(unittest.TestCase):
    """导入的数据必须带 owner_id，不能落到 0 号。"""

    def setUp(self):
        self._tmp = TemporaryDirectory()
        self._orig_db = bookkeeping.DB_PATH
        bookkeeping.DB_PATH = Path(self._tmp.name) / "test.db"
        bookkeeping.init_db()

    def tearDown(self):
        bookkeeping.DB_PATH = self._orig_db
        self._tmp.cleanup()

    def test_import_attributes_to_owner(self):
        result = upload.import_upload(ALIPAY_CSV.encode("utf-8"), "alipay.csv", owner_id=7)
        self.assertEqual(result.parsed, 2)

        conn = bookkeeping.connect()
        try:
            owners = {row["owner_id"] for row in conn.execute("select owner_id from entries")}
        finally:
            conn.close()
        self.assertEqual(owners, {7})

    def test_unconfirmed_rows_also_carry_owner(self):
        upload.import_upload(ALIPAY_CSV.encode("utf-8"), "alipay.csv", owner_id=7)
        conn = bookkeeping.connect()
        try:
            owners = {row["owner_id"] for row in conn.execute("select owner_id from unconfirmed_entries")}
        finally:
            conn.close()
        # 没有待确认记录时集合为空，也算通过；有的话 owner 必须是 7
        self.assertTrue(owners <= {7})


class KeywordRuleOwnerTest(unittest.TestCase):
    """关键词规则必须落到指定用户名下。

    add_rule 的 SQL 用了 owner_id 变量，但函数签名长期缺这个参数，
    调用即 TypeError，导致「学到的规则」和手动加规则都用不了。
    """

    def setUp(self):
        self._tmp = TemporaryDirectory()
        self._orig_db = bookkeeping.DB_PATH
        bookkeeping.DB_PATH = Path(self._tmp.name) / "test.db"
        bookkeeping.init_db()

    def tearDown(self):
        bookkeeping.DB_PATH = self._orig_db
        self._tmp.cleanup()

    def test_add_keyword_rule_attributes_owner(self):
        rule = bookkeeping.add_keyword_rule("中国移动", "居家/手机电话", "支出", owner_id=5)
        self.assertEqual(rule["keyword"], "中国移动")
        self.assertEqual(rule["category"], "居家/手机电话")

        conn = bookkeeping.connect()
        try:
            owners = {row["owner_id"] for row in conn.execute("select owner_id from merchant_category_rules")}
        finally:
            conn.close()
        self.assertEqual(owners, {5})

    def test_rules_are_isolated_per_owner(self):
        bookkeeping.add_keyword_rule("中国移动", "居家/手机电话", "支出", owner_id=5)
        bookkeeping.add_keyword_rule("话费", "居家/手机电话", "支出", owner_id=6)

        conn = bookkeeping.connect()
        try:
            rows = conn.execute(
                "select owner_id, merchant from merchant_category_rules order by owner_id"
            ).fetchall()
        finally:
            conn.close()
        self.assertEqual([(r["owner_id"], r["merchant"]) for r in rows], [(5, "中国移动"), (6, "话费")])


class PendingDeleteTest(unittest.TestCase):
    """待确认条目必须能删除。

    同一笔消费可能同时出现在微信和美团账单里，跨平台去重做不到
    （交易单号不同），用户只能手动删掉多出来的那条。
    """

    def setUp(self):
        self._tmp = TemporaryDirectory()
        self._orig_db = bookkeeping.DB_PATH
        bookkeeping.DB_PATH = Path(self._tmp.name) / "test.db"
        bookkeeping.init_db()

    def tearDown(self):
        bookkeeping.DB_PATH = self._orig_db
        self._tmp.cleanup()

    def test_delete_pending_entry(self):
        conn = bookkeeping.connect()
        try:
            cur = conn.execute(
                "insert into entries(owner_id, transaction_time, type, status, amount_cents, currency, transaction_object, account, participant) "
                "values (1,'2026-11-04 10:00:00','支出','pending',687,'CNY','示例充电服务','微信支付','自己')"
            )
            conn.commit()
            entry_id = cur.lastrowid
        finally:
            conn.close()

        result = bookkeeping.delete_pending(entry_id, "pending", owner_id=1)
        self.assertTrue(result["ok"])

        conn = bookkeeping.connect()
        try:
            left = conn.execute("select count(*) c from entries where id=?", (entry_id,)).fetchone()["c"]
        finally:
            conn.close()
        self.assertEqual(left, 0)

    def test_delete_unconfirmed_entry(self):
        """unconfirmed_entries 里的行也要能删。

        注意 init_db() 会把这些行迁移到 entries(status='pending')，
        所以直接调 delete_pending 而不是先 init_db。
        """
        conn = bookkeeping.connect()
        try:
            cur = conn.execute(
                "insert into unconfirmed_entries(owner_id, transaction_time, type, amount_cents, currency, transaction_object, account, participant) "
                "values (1,'2026-11-04 10:00:00','支出',40000,'CNY','信用贷','余额','自己')"
            )
            conn.commit()
            entry_id = cur.lastrowid
        finally:
            conn.close()

        result = bookkeeping.delete_pending(entry_id, "unconfirmed", owner_id=1)
        self.assertTrue(result["ok"])

        conn = bookkeeping.connect()
        try:
            left = conn.execute("select count(*) c from unconfirmed_entries where id=?", (entry_id,)).fetchone()["c"]
            migrated = conn.execute(
                "select count(*) c from entries where id=? and status='pending'", (entry_id,)
            ).fetchone()["c"]
        finally:
            conn.close()
        # 原行被删；即使它已被迁移到 entries，那条也必须一并消失
        self.assertEqual(left, 0)
        self.assertEqual(migrated, 0)

    def test_migration_preserves_owner(self):
        """init_db 把 unconfirmed 搬到 entries 时不能丢 owner_id。"""
        conn = bookkeeping.connect()
        try:
            conn.execute(
                "insert into unconfirmed_entries(owner_id, transaction_time, type, amount_cents, currency, transaction_object, account, participant) "
                "values (9,'2026-11-04 10:00:00','支出',40000,'CNY','信用贷','余额','自己')"
            )
            conn.commit()
        finally:
            conn.close()

        bookkeeping.init_db()

        conn = bookkeeping.connect()
        try:
            owners = {r["owner_id"] for r in conn.execute(
                "select owner_id from entries where transaction_object='信用贷'"
            )}
        finally:
            conn.close()
        self.assertEqual(owners, {9})

    def test_cannot_delete_other_users_entry(self):
        conn = bookkeeping.connect()
        try:
            cur = conn.execute(
                "insert into entries(owner_id, transaction_time, type, status, amount_cents, currency, transaction_object, account, participant) "
                "values (2,'2026-11-04 10:00:00','支出','pending',100,'CNY','别人的','微信支付','自己')"
            )
            conn.commit()
            entry_id = cur.lastrowid
        finally:
            conn.close()

        with self.assertRaises(ValueError):
            bookkeeping.delete_pending(entry_id, "pending", owner_id=1)

    def test_cannot_delete_confirmed_entry(self):
        """只能删待确认的，已确认的要去账单页删（要同步账户余额）。"""
        conn = bookkeeping.connect()
        try:
            cur = conn.execute(
                "insert into entries(owner_id, transaction_time, type, status, amount_cents, currency, transaction_object, account, participant) "
                "values (1,'2026-11-04 10:00:00','支出','confirmed',100,'CNY','已确认','微信支付','自己')"
            )
            conn.commit()
            entry_id = cur.lastrowid
        finally:
            conn.close()

        with self.assertRaises(ValueError):
            bookkeeping.delete_pending(entry_id, "pending", owner_id=1)


class DedupeFeedbackTest(unittest.TestCase):
    """重复导入要能看出「去哪了」，而不是一片空白。"""

    def setUp(self):
        self._tmp = TemporaryDirectory()
        self._orig_db = bookkeeping.DB_PATH
        bookkeeping.DB_PATH = Path(self._tmp.name) / "test.db"
        bookkeeping.init_db()

    def tearDown(self):
        bookkeeping.DB_PATH = self._orig_db
        self._tmp.cleanup()

    def test_second_import_reports_deduped(self):
        first = upload.import_upload(ALIPAY_CSV.encode("utf-8"), "alipay.csv", owner_id=1)
        self.assertGreater(first.confirmed + first.pending, 0)

        second = upload.import_upload(ALIPAY_CSV.encode("utf-8"), "alipay.csv", owner_id=1)
        self.assertEqual(second.parsed, 2)
        self.assertGreater(second.deduped, 0)
        self.assertTrue(
            any("重复" in warning for warning in second.warnings),
            f"应提示去重，实际 warnings={second.warnings}",
        )

    def test_different_owner_not_treated_as_duplicate(self):
        """别人导入过的同金额记录，不该把当前用户的导入去重掉。"""
        upload.import_upload(ALIPAY_CSV.encode("utf-8"), "alipay.csv", owner_id=1)
        other = upload.import_upload(ALIPAY_CSV.encode("utf-8"), "alipay.csv", owner_id=2)
        self.assertEqual(other.deduped, 0)
        self.assertGreater(other.confirmed + other.pending, 0)


if __name__ == "__main__":
    unittest.main()
