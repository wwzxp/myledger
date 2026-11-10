"""鉴权：用户、密码哈希、会话。

设计约束（见 docs/specs/多用户与公网部署-产品规格.md）：
- 密码用标准库 `hashlib.scrypt` 加盐哈希，不引入第三方密码库。
- 会话 token 只存 SHA-256 摘要，数据库泄漏也拿不到可用的 cookie。
- 会话 30 天滑动续期；登出/禁用用户会删除对应会话行。
- 登录失败按「用户名 + 来源」限流，阈值与窗口写在常量里。
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

# scrypt 参数：n=2^14 在 2026 年的普通服务器上约 50–100ms，足以抵抗离线爆破。
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16
KEY_BYTES = 32

SESSION_DAYS = 30
TOKEN_BYTES = 32

LOGIN_WINDOW_MINUTES = 15
LOGIN_MAX_FAILURES = 5

ROLE_ADMIN = "admin"
ROLE_USER = "user"


@dataclass(frozen=True)
class User:
    id: int
    username: str
    role: str
    disabled: bool

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN


class AuthError(ValueError):
    """鉴权失败。消息可直接展示给用户（不泄漏具体原因）。"""


class RateLimited(AuthError):
    """登录尝试过于频繁。"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def hash_password(password: str) -> str:
    """返回 `scrypt$n$r$p$salt_hex$hash_hex`，参数随哈希一起存，便于将来调参。"""
    if not password:
        raise AuthError("密码不能为空")
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=KEY_BYTES
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    try:
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(bytes.fromhex(hash_hex)),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), hash_hex)


def new_session_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def ensure_schema(conn: sqlite3.Connection) -> None:
    """建用户与会话表。可重复调用。"""
    conn.executescript(
        """
        create table if not exists users (
            id integer primary key autoincrement,
            username text not null unique,
            password_hash text not null,
            role text not null default 'user',
            disabled integer not null default 0,
            created_at text not null
        );

        create table if not exists sessions (
            token_hash text primary key,
            user_id integer not null references users(id) on delete cascade,
            created_at text not null,
            last_seen_at text not null,
            expires_at text not null,
            user_agent text
        );

        create table if not exists login_failures (
            id integer primary key autoincrement,
            username text not null,
            source text not null,
            created_at text not null
        );

        create index if not exists idx_login_failures_lookup
            on login_failures (username, source, created_at);
        """
    )
    conn.commit()


def create_user(
    conn: sqlite3.Connection, username: str, password: str, role: str = ROLE_USER
) -> User:
    username = (username or "").strip()
    if not username:
        raise AuthError("用户名不能为空")
    if role not in (ROLE_ADMIN, ROLE_USER):
        raise AuthError("角色无效")
    try:
        cursor = conn.execute(
            "insert into users (username, password_hash, role, disabled, created_at) values (?, ?, ?, 0, ?)",
            (username, hash_password(password), role, _iso(_now())),
        )
    except sqlite3.IntegrityError as exc:
        raise AuthError(f"用户名已存在：{username}") from exc
    conn.commit()
    return User(id=int(cursor.lastrowid), username=username, role=role, disabled=False)


def find_user(conn: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    return conn.execute("select * from users where username = ?", ((username or "").strip(),)).fetchone()


def user_by_id(conn: sqlite3.Connection, user_id: int) -> User | None:
    row = conn.execute("select * from users where id = ?", (user_id,)).fetchone()
    if not row:
        return None
    return User(id=row["id"], username=row["username"], role=row["role"], disabled=bool(row["disabled"]))


def list_users(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "select id, username, role, disabled, created_at from users order by id"
    ).fetchall()
    return [dict(row) for row in rows]


def count_admins(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "select count(*) as n from users where role = ? and disabled = 0", (ROLE_ADMIN,)
    ).fetchone()
    return int(row["n"])


def record_failure(conn: sqlite3.Connection, username: str, source: str) -> None:
    conn.execute(
        "insert into login_failures (username, source, created_at) values (?, ?, ?)",
        (username, source, _iso(_now())),
    )
    conn.commit()


def failure_count(conn: sqlite3.Connection, username: str, source: str) -> int:
    cutoff = _iso(_now() - timedelta(minutes=LOGIN_WINDOW_MINUTES))
    row = conn.execute(
        "select count(*) as n from login_failures where username = ? and source = ? and created_at >= ?",
        (username, source, cutoff),
    ).fetchone()
    return int(row["n"])


def clear_failures(conn: sqlite3.Connection, username: str, source: str) -> None:
    conn.execute(
        "delete from login_failures where username = ? and source = ?", (username, source)
    )
    conn.commit()


def login(
    conn: sqlite3.Connection,
    username: str,
    password: str,
    source: str = "",
    user_agent: str = "",
) -> tuple[User, str]:
    """校验凭据并创建会话。返回 (用户, 明文 token)。失败抛 AuthError。"""
    username = (username or "").strip()
    if failure_count(conn, username, source) >= LOGIN_MAX_FAILURES:
        raise RateLimited("登录尝试过于频繁，请稍后再试")

    row = find_user(conn, username)
    # 用户不存在与密码错误给同一条消息，避免枚举用户名。
    if not row or not verify_password(password, row["password_hash"]):
        record_failure(conn, username, source)
        raise AuthError("用户名或密码不正确")
    if row["disabled"]:
        record_failure(conn, username, source)
        raise AuthError("用户名或密码不正确")

    clear_failures(conn, username, source)
    token = new_session_token()
    now = _now()
    conn.execute(
        "insert into sessions (token_hash, user_id, created_at, last_seen_at, expires_at, user_agent)"
        " values (?, ?, ?, ?, ?, ?)",
        (
            token_digest(token),
            row["id"],
            _iso(now),
            _iso(now),
            _iso(now + timedelta(days=SESSION_DAYS)),
            user_agent[:200],
        ),
    )
    conn.commit()
    return (
        User(id=row["id"], username=row["username"], role=row["role"], disabled=False),
        token,
    )


def resolve_session(conn: sqlite3.Connection, token: str) -> User | None:
    """校验会话并滑动续期。无效/过期/用户被禁用返回 None。"""
    if not token:
        return None
    row = conn.execute(
        """
        select s.token_hash, s.expires_at, u.id, u.username, u.role, u.disabled
        from sessions s join users u on u.id = s.user_id
        where s.token_hash = ?
        """,
        (token_digest(token),),
    ).fetchone()
    if not row:
        return None

    now = _now()
    expires_at = datetime.strptime(row["expires_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    if expires_at <= now or row["disabled"]:
        conn.execute("delete from sessions where token_hash = ?", (row["token_hash"],))
        conn.commit()
        return None

    conn.execute(
        "update sessions set last_seen_at = ?, expires_at = ? where token_hash = ?",
        (_iso(now), _iso(now + timedelta(days=SESSION_DAYS)), row["token_hash"]),
    )
    conn.commit()
    return User(id=row["id"], username=row["username"], role=row["role"], disabled=False)


def logout(conn: sqlite3.Connection, token: str) -> None:
    conn.execute("delete from sessions where token_hash = ?", (token_digest(token),))
    conn.commit()


def revoke_user_sessions(conn: sqlite3.Connection, user_id: int) -> None:
    conn.execute("delete from sessions where user_id = ?", (user_id,))
    conn.commit()


def set_password(conn: sqlite3.Connection, user_id: int, password: str) -> None:
    conn.execute(
        "update users set password_hash = ? where id = ?", (hash_password(password), user_id)
    )
    conn.commit()


def set_disabled(conn: sqlite3.Connection, user_id: int, disabled: bool) -> None:
    conn.execute("update users set disabled = ? where id = ?", (1 if disabled else 0, user_id))
    conn.commit()
    if disabled:
        revoke_user_sessions(conn, user_id)


def set_role(conn: sqlite3.Connection, user_id: int, role: str) -> None:
    if role not in (ROLE_ADMIN, ROLE_USER):
        raise AuthError("角色无效")
    conn.execute("update users set role = ? where id = ?", (role, user_id))
    conn.commit()
