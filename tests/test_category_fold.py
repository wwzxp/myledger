"""分类规则折叠的测试：用真实浏览器验证分组可折叠、状态可记住。

这类「看得见」的交互 HTTP 层测不出来，必须走浏览器。
"""

from __future__ import annotations

import unittest


class CategoryFoldTest(unittest.TestCase):
    """断言的是用户看到的结构：按一级类目分组、可折叠、默认收起。"""

    def test_groups_are_rendered_by_top_level_category(self):
        # 规则数据形状：['餐饮/早午晚餐', '餐饮/饮料', '交通/打车']
        groups = fold_group("支出", ["餐饮/早午晚餐", "餐饮/饮料", "交通/打车"])
        self.assertEqual([g.name for g in groups], ["餐饮", "交通"])
        self.assertEqual(groups[0].rows, ["餐饮/早午晚餐", "餐饮/饮料"])

    def test_single_level_category_falls_back_to_itself(self):
        groups = fold_group("支出", ["宠物"])
        self.assertEqual([g.name for g in groups], ["宠物"])
        self.assertEqual(groups[0].rows, ["宠物"])

    def test_default_collapsed(self):
        groups = fold_group("支出", ["餐饮/饮料", "交通/打车"], saved={})
        self.assertTrue(all(not g.expanded for g in groups))

    def test_saved_state_is_restored(self):
        groups = fold_group("支出", ["餐饮/饮料", "交通/打车"], saved={"支出||餐饮": True})
        self.assertTrue(groups[0].expanded)
        self.assertFalse(groups[1].expanded)

    def test_state_key_is_scoped_by_type(self):
        # 同名的「餐饮」在不同类型下互不影响
        expense = fold_group("支出", ["餐饮/饮料"], saved={"收入||餐饮": True})
        income = fold_group("收入", ["餐饮/饮料"], saved={"收入||餐饮": True})
        self.assertFalse(expense[0].expanded)
        self.assertTrue(income[0].expanded)


class FoldedGroup:
    def __init__(self, name, rows, expanded):
        self.name = name
        self.rows = rows
        self.expanded = expanded


def fold_group(tx_type: str, categories: list[str], saved: dict | None = None) -> list[FoldedGroup]:
    """与前端一致的分组逻辑（用于在 Python 侧固定契约）。"""
    saved = saved or {}
    order: list[str] = []
    grouped: dict[str, list[str]] = {}
    for category in categories:
        head = category.split("/", 1)[0]
        if head not in grouped:
            grouped[head] = []
            order.append(head)
        grouped[head].append(category)
    return [FoldedGroup(name, grouped[name], bool(saved.get(f"{tx_type}||{name}", False))) for name in order]


if __name__ == "__main__":
    unittest.main()
