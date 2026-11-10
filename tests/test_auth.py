"""鉴权纯函数与表结构测试（不启 HTTP，验证密码哈希与会话契约）。"""

from __future__ import annotations

import sqlite3
import unittest

from app import auth


def memory_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    auth.ensure_schema(conn)
    return conn


class PasswordTest(unittest.TestCase):
    def test_hash_is_salted_and_verifiable(self):
        stored = auth.hash_password("correct horse")
        self.assertTrue(stored.startswith("scrypt$"))
        self.assertTrue(auth.verify_password("correct horse", stored))

    def test_same_password_gets_different_hash(self):
        self.assertNotEqual(auth.hash_password("abc"), auth.hash_password("abc"))

    def test_wrong_password_rejected(self):
        stored = auth.hash_password("abc")
        self.assertFalse(auth.verify_password("abd", stored))

    def test_malformed_hash_is_rejected_not_crash(self):
        self.assertFalse(auth.verify_password("abc", "bcrypt$whatever"))
        self.assertFalse(auth.verify_password("abc", ""))

    def test_empty_password_rejected_at_creation(self):
        with self.assertRaises(auth.AuthError):
            auth.hash_password("")


class SessionTest(unittest.TestCase):
    def setUp(self):
        self.conn = memory_db()
        self.user = auth.create_user(self.conn, "alice", "secret123")

    def test_login_returns_token_and_resolves_user(self):
        user, token = auth.login(self.conn, "alice", "secret123", source="1.2.3.4")
        self.assertEqual(user.username, "alice")
        resolved = auth.resolve_session(self.conn, token)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.id, self.user.id)

    def test_token_not_stored_in_plaintext(self):
        _user, token = auth.login(self.conn, "alice", "secret123")
        row = self.conn.execute("select token_hash from sessions").fetchone()
        self.assertNotEqual(row["token_hash"], token)
        self.assertEqual(row["token_hash"], auth.token_digest(token))

    def test_logout_invalidates_token(self):
        _user, token = auth.login(self.conn, "alice", "secret123")
        auth.logout(self.conn, token)
        self.assertIsNone(auth.resolve_session(self.conn, token))

    def test_wrong_password_raises_generic_error(self):
        with self.assertRaises(auth.AuthError) as ctx:
            auth.login(self.conn, "alice", "wrong")
        self.assertIn("用户名或密码不正确", str(ctx.exception))

    def test_unknown_user_gives_same_message(self):
        with self.assertRaises(auth.AuthError) as ctx:
            auth.login(self.conn, "nobody", "whatever")
        self.assertIn("用户名或密码不正确", str(ctx.exception))

    def test_rate_limit_after_repeated_failures(self):
        for _ in range(auth.LOGIN_MAX_FAILURES):
            with self.assertRaises(auth.AuthError):
                auth.login(self.conn, "alice", "wrong", source="9.9.9.9")
        with self.assertRaises(auth.RateLimited):
            auth.login(self.conn, "alice", "secret123", source="9.9.9.9")

    def test_rate_limit_is_per_source(self):
        for _ in range(auth.LOGIN_MAX_FAILURES):
            with self.assertRaises(auth.AuthError):
                auth.login(self.conn, "alice", "wrong", source="1.1.1.1")
        # 另一来源不受影响
        _user, token = auth.login(self.conn, "alice", "secret123", source="2.2.2.2")
        self.assertTrue(token)

    def test_disabled_user_cannot_login_and_sessions_revoked(self):
        _user, token = auth.login(self.conn, "alice", "secret123")
        auth.set_disabled(self.conn, self.user.id, True)
        self.assertIsNone(auth.resolve_session(self.conn, token))
        with self.assertRaises(auth.AuthError):
            auth.login(self.conn, "alice", "secret123")

    def test_password_change_keeps_existing_session(self):
        _user, token = auth.login(self.conn, "alice", "secret123")
        auth.set_password(self.conn, self.user.id, "newpass456")
        self.assertIsNotNone(auth.resolve_session(self.conn, token))
        auth.login(self.conn, "alice", "newpass456")


class UserAdminTest(unittest.TestCase):
    def setUp(self):
        self.conn = memory_db()
        self.admin = auth.create_user(self.conn, "root", "rootpass", role=auth.ROLE_ADMIN)

    def test_duplicate_username_rejected(self):
        with self.assertRaises(auth.AuthError):
            auth.create_user(self.conn, "root", "another")

    def test_count_admins_ignores_disabled(self):
        self.assertEqual(auth.count_admins(self.conn), 1)
        auth.set_disabled(self.conn, self.admin.id, True)
        self.assertEqual(auth.count_admins(self.conn), 0)

    def test_set_role_validates_value(self):
        with self.assertRaises(auth.AuthError):
            auth.set_role(self.conn, self.admin.id, "superuser")

    def test_list_users_hides_password_hash(self):
        rows = auth.list_users(self.conn)
        self.assertEqual(len(rows), 1)
        self.assertNotIn("password_hash", rows[0])


if __name__ == "__main__":
    unittest.main()
