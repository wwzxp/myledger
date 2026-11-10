"""首启动引导测试：只在库为空时创建管理员。"""

from __future__ import annotations

import sqlite3
import unittest

from app import auth, bootstrap


def memory_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    auth.ensure_schema(conn)
    return conn


class BootstrapTest(unittest.TestCase):
    def test_creates_admin_when_empty(self):
        conn = memory_db()
        result = bootstrap.ensure_admin(conn)
        self.assertTrue(result.created)
        self.assertEqual(result.username, "admin")
        self.assertIsNotNone(result.password)
        self.assertGreaterEqual(len(result.password), 16)

        row = conn.execute("select * from users where username = 'admin'").fetchone()
        self.assertEqual(row["role"], auth.ROLE_ADMIN)
        self.assertTrue(auth.verify_password(result.password, row["password_hash"]))

    def test_does_nothing_when_users_exist(self):
        conn = memory_db()
        auth.create_user(conn, "alice", "alicepass")
        result = bootstrap.ensure_admin(conn)
        self.assertFalse(result.created)
        self.assertIsNone(result.password)
        self.assertEqual(conn.execute("select count(*) n from users").fetchone()["n"], 1)

    def test_explicit_password_is_used(self):
        conn = memory_db()
        result = bootstrap.ensure_admin(conn, username="root", password="fixed-pass-123")
        self.assertEqual(result.username, "root")
        self.assertEqual(result.password, "fixed-pass-123")
        row = conn.execute("select password_hash from users where username = 'root'").fetchone()
        self.assertTrue(auth.verify_password("fixed-pass-123", row["password_hash"]))

    def test_log_lines_only_when_created(self):
        conn = memory_db()
        self.assertEqual(bootstrap.ensure_admin(conn).log_lines()[0], "")
        self.assertEqual(bootstrap.ensure_admin(conn).log_lines(), [])

    def test_random_passwords_differ(self):
        a = bootstrap.ensure_admin(memory_db()).password
        b = bootstrap.ensure_admin(memory_db()).password
        self.assertNotEqual(a, b)

    def test_can_login_with_generated_password(self):
        conn = memory_db()
        result = bootstrap.ensure_admin(conn)
        user, token = auth.login(conn, result.username, result.password)
        self.assertEqual(user.role, auth.ROLE_ADMIN)
        self.assertTrue(token)


if __name__ == "__main__":
    unittest.main()
