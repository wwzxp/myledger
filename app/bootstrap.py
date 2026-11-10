"""首次启动引导：库里没有任何用户时创建一个管理员，并打印初始密码。

设计约束（见 docs/specs/多用户与公网部署-产品规格.md）：
- 只在 users 表为空时执行，绝不覆盖已有账号。
- 初始密码随机生成（URL 安全字符），只打印到日志一次；不写入配置文件。
- 允许用配置文件固定初始密码，便于自建部署时复现（可选）。
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

from app import auth

DEFAULT_ADMIN = "admin"
PASSWORD_LENGTH = 16


@dataclass(frozen=True)
class BootstrapResult:
    created: bool
    username: str
    password: str | None

    def log_lines(self) -> list[str]:
        if not self.created:
            return []
        return [
            "",
            "=" * 62,
            f"  已创建管理员账号：{self.username}",
            f"  初始密码：{self.password}",
            "  请登录后立刻修改密码（设置 → 修改密码）",
            "=" * 62,
            "",
        ]


def _random_password() -> str:
    alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(PASSWORD_LENGTH))


def ensure_admin(
    conn,
    username: str = DEFAULT_ADMIN,
    password: str | None = None,
) -> BootstrapResult:
    """如果没有用户，创建管理员。返回是否创建与明文密码。"""
    auth.ensure_schema(conn)
    existing = conn.execute("select count(*) as n from users").fetchone()["n"]
    if existing:
        return BootstrapResult(created=False, username=username, password=None)

    chosen = password or _random_password()
    auth.create_user(conn, username, chosen, role=auth.ROLE_ADMIN)
    return BootstrapResult(created=True, username=username, password=chosen)
