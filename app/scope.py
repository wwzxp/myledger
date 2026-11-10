"""归属范围：把「当前用户能看到什么」变成一个显式对象，传给查询层。

设计（对应 docs/specs/多用户与公网部署-产品规格.md）：
- 普通用户：只能看到 `owner_id = 自己`。
- 管理员：默认同样是自己的；显式切到「全部账本」时不过滤。
- 所有查询都必须接收 Scope，由调用方传入，**不允许有默认值**，
  这样新增查询时编译器/审阅者能立刻发现漏传。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Scope:
    """一次查询的可见范围。"""

    user_id: int
    include_all: bool = False

    @property
    def is_global(self) -> bool:
        return self.include_all

    def owner_clause(self, column: str = "owner_id", prefix: str = "and") -> tuple[str, tuple]:
        """返回 (SQL 片段, 参数)。全局视图返回空条件。"""
        if self.include_all:
            return "", ()
        return f" {prefix} {column} = ?", (self.user_id,)

    def where(self, column: str = "owner_id") -> tuple[str, tuple]:
        """用于没有其他 where 条件的场景。"""
        if self.include_all:
            return "", ()
        return f" where {column} = ?", (self.user_id,)


def scope_for(user_id: int, include_all: bool = False) -> Scope:
    return Scope(user_id=int(user_id), include_all=bool(include_all))
