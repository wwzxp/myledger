"""每用户的邮箱凭据：加密后存在 users 表。

设计（对应 docs/specs/账单邮件导入-产品规格.md）：
- 邮箱凭据属于**用户**，不是应用配置；每个用户配自己的。
- 授权码用对称加密（AES-GCM）后再入库，主密钥来自配置文件，不落库。
- 库文件被单独拿走时，没有主密钥解不出授权码。
- 主密钥丢失则该用户的授权码不可恢复，需重新填写。
"""

from __future__ import annotations

import base64
import hashlib
import os
import sqlite3
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NONCE_BYTES = 12
PREFIX = "v1:"


class CredentialError(RuntimeError):
    """解密失败或缺少主密钥。"""


@dataclass(frozen=True)
class MailCredentials:
    username: str
    password: str
    host: str
    port: int
    mailbox: str


def ensure_schema(conn: sqlite3.Connection) -> None:
    """给 users 表补邮箱列。可重复调用。"""
    existing = {row[1] for row in conn.execute("pragma table_info(users)")}
    columns = {
        "mail_host": "text",
        "mail_port": "integer",
        "mail_username": "text",
        "mail_password": "text",
        "mail_mailbox": "text",
    }
    for name, kind in columns.items():
        if name not in existing:
            conn.execute(f"alter table users add column {name} {kind}")
    conn.commit()


def _derive_key(master_key: str) -> bytes:
    if not master_key:
        raise CredentialError("缺少主密钥，无法加解密邮箱授权码")
    return hashlib.sha256(master_key.encode("utf-8")).digest()


def encrypt(plaintext: str, master_key: str) -> str:
    key = _derive_key(master_key)
    nonce = os.urandom(NONCE_BYTES)
    blob = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return PREFIX + base64.urlsafe_b64encode(nonce + blob).decode("ascii")


def decrypt(ciphertext: str, master_key: str) -> str:
    if not ciphertext:
        return ""
    if not ciphertext.startswith(PREFIX):
        raise CredentialError("授权码格式无法识别")
    key = _derive_key(master_key)
    raw = base64.urlsafe_b64decode(ciphertext[len(PREFIX):].encode("ascii"))
    nonce, blob = raw[:NONCE_BYTES], raw[NONCE_BYTES:]
    try:
        return AESGCM(key).decrypt(nonce, blob, None).decode("utf-8")
    except Exception as exc:
        raise CredentialError("授权码解密失败：主密钥可能已更换") from exc


def save(
    conn: sqlite3.Connection,
    user_id: int,
    username: str,
    password: str,
    key: str,
    host: str = "",
    port: int | None = None,
    mailbox: str = "",
) -> None:
    ensure_schema(conn)
    conn.execute(
        """
        update users set mail_host = ?, mail_port = ?, mail_username = ?, mail_password = ?, mail_mailbox = ?
        where id = ?
        """,
        (
            host or None,
            port,
            username.strip(),
            encrypt(password, key) if password else None,
            mailbox or None,
            user_id,
        ),
    )
    conn.commit()


def load(conn: sqlite3.Connection, user_id: int, key: str) -> MailCredentials | None:
    ensure_schema(conn)
    row = conn.execute(
        "select mail_host, mail_port, mail_username, mail_password, mail_mailbox from users where id = ?",
        (user_id,),
    ).fetchone()
    if not row or not row["mail_username"]:
        return None
    return MailCredentials(
        username=row["mail_username"],
        password=decrypt(row["mail_password"] or "", key),
        host=row["mail_host"] or "",
        port=int(row["mail_port"] or 0),
        mailbox=row["mail_mailbox"] or "",
    )


def describe(conn: sqlite3.Connection, user_id: int) -> dict:
    """给前端的状态，不暴露密码本身。"""
    ensure_schema(conn)
    row = conn.execute(
        "select mail_username, mail_password, mail_host, mail_port from users where id = ?",
        (user_id,),
    ).fetchone()
    if not row:
        return {"username": "", "has_password": False, "configured": False, "host": "", "port": 993}
    return {
        "username": row["mail_username"] or "",
        "has_password": bool(row["mail_password"]),
        "configured": bool(row["mail_username"] and row["mail_password"]),
        "host": row["mail_host"] or "",
        "port": int(row["mail_port"] or 993),
    }


def clear(conn: sqlite3.Connection, user_id: int) -> None:
    ensure_schema(conn)
    conn.execute(
        "update users set mail_host = null, mail_port = null, mail_username = null,"
        " mail_password = null, mail_mailbox = null where id = ?",
        (user_id,),
    )
    conn.commit()
