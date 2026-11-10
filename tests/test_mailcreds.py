"""每用户邮箱凭据的测试：加密存储、按用户隔离、互不可见。"""

from __future__ import annotations

import sqlite3
import unittest

from app import auth, mailcreds


def memory_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    auth.ensure_schema(conn)
    mailcreds.ensure_schema(conn)
    return conn


class CredentialTest(unittest.TestCase):
    def setUp(self):
        self.conn = memory_db()
        self.alice = auth.create_user(self.conn, "alice", "alicepass")
        self.bob = auth.create_user(self.conn, "bob", "bobpass")
        self.key = "test-master-key-0123456789abcdef"

    def test_save_and_read_back(self):
        mailcreds.save(self.conn, self.alice.id, "alice@qq.com", "authcode123", key=self.key)
        creds = mailcreds.load(self.conn, self.alice.id, key=self.key)
        self.assertEqual(creds.username, "alice@qq.com")
        self.assertEqual(creds.password, "authcode123")

    def test_password_is_not_stored_in_plaintext(self):
        mailcreds.save(self.conn, self.alice.id, "alice@qq.com", "secret-authcode", key=self.key)
        row = self.conn.execute(
            "select mail_password from users where id = ?", (self.alice.id,)
        ).fetchone()
        self.assertNotIn("secret-authcode", row["mail_password"])
        self.assertTrue(row["mail_password"])

    def test_users_are_isolated(self):
        mailcreds.save(self.conn, self.alice.id, "alice@qq.com", "code-a", key=self.key)
        mailcreds.save(self.conn, self.bob.id, "bob@qq.com", "code-b", key=self.key)
        self.assertEqual(mailcreds.load(self.conn, self.alice.id, key=self.key).username, "alice@qq.com")
        self.assertEqual(mailcreds.load(self.conn, self.bob.id, key=self.key).username, "bob@qq.com")

    def test_missing_returns_none(self):
        self.assertIsNone(mailcreds.load(self.conn, self.alice.id, key=self.key))

    def test_wrong_key_cannot_decrypt(self):
        mailcreds.save(self.conn, self.alice.id, "alice@qq.com", "secret", key=self.key)
        with self.assertRaises(mailcreds.CredentialError):
            mailcreds.load(self.conn, self.alice.id, key="a-different-key-000000000000")

    def test_clear_removes_credentials(self):
        mailcreds.save(self.conn, self.alice.id, "alice@qq.com", "secret", key=self.key)
        mailcreds.clear(self.conn, self.alice.id)
        self.assertIsNone(mailcreds.load(self.conn, self.alice.id, key=self.key))

    def test_has_password_flag_without_exposing(self):
        mailcreds.save(self.conn, self.alice.id, "alice@qq.com", "secret", key=self.key)
        info = mailcreds.describe(self.conn, self.alice.id)
        self.assertTrue(info["configured"])
        self.assertTrue(info["has_password"])
        self.assertEqual(info["username"], "alice@qq.com")
        self.assertNotIn("password", info)


if __name__ == "__main__":
    unittest.main()
