"""用户管理 HTTP 测试：权限边界与自我保护的硬规则。"""

from __future__ import annotations

import json
import unittest

from tests.test_http_auth import Client, ServerFixture


class UserAdminTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fx = ServerFixture()

    @classmethod
    def tearDownClass(cls):
        cls.fx.stop()

    def admin(self):
        client = Client(self.fx)
        client.login("admin", "adminpass")
        return client

    def test_me_returns_role(self):
        client = self.admin()
        status, payload = client.get_json("/api/me")
        self.assertEqual(status, 200)
        self.assertEqual(payload["username"], "admin")
        self.assertTrue(payload["is_admin"])

    def test_non_admin_cannot_list_users(self):
        client = Client(self.fx)
        client.login("alice", "alicepass")
        status, _ = client.get_json("/api/users")
        self.assertEqual(status, 403)

    def test_admin_can_create_user(self):
        client = self.admin()
        status, _headers, raw = client.request(
            "/api/users", "POST",
            {"action": "create", "username": "carol", "password": "carolpass", "role": "user"},
        )
        self.assertEqual(status, 200, raw)
        created = Client(self.fx)
        status, _h, _r = created.login("carol", "carolpass")
        self.assertEqual(status, 200)

    def test_duplicate_username_rejected(self):
        client = self.admin()
        status, _h, _r = client.request(
            "/api/users", "POST",
            {"action": "create", "username": "alice", "password": "x12345678", "role": "user"},
        )
        self.assertEqual(status, 400)

    def test_admin_can_reset_password(self):
        client = self.admin()
        status, _h, _r = client.request(
            "/api/users", "POST",
            {"action": "reset-password", "id": self.fx.bob.id, "password": "newbobpass"},
        )
        self.assertEqual(status, 200)
        bob = Client(self.fx)
        self.assertEqual(bob.login("bob", "newbobpass")[0], 200)

    def test_disable_revokes_sessions(self):
        # 前面的用例可能重置过密码；这里显式还原，避免用例间互相影响。
        self.admin().request(
            "/api/users", "POST", {"action": "reset-password", "id": self.fx.bob.id, "password": "bobpass"}
        )
        bob = Client(self.fx)
        bob.login("bob", "bobpass")
        self.assertEqual(bob.get_json("/api/summary")[0], 200)

        client = self.admin()
        status, _h, _r = client.request("/api/users", "POST", {"action": "disable", "id": self.fx.bob.id})
        self.assertEqual(status, 200)
        self.assertEqual(bob.get_json("/api/summary")[0], 401)

        client.request("/api/users", "POST", {"action": "enable", "id": self.fx.bob.id})

    def test_cannot_disable_self(self):
        client = self.admin()
        status, _h, raw = client.request(
            "/api/users", "POST", {"action": "disable", "id": self.fx.admin.id}
        )
        self.assertEqual(status, 400)
        self.assertIn("不能禁用自己", raw.decode("utf-8"))

    def test_cannot_demote_last_admin(self):
        client = self.admin()
        status, _h, raw = client.request(
            "/api/users", "POST", {"action": "set-role", "id": self.fx.admin.id, "role": "user"}
        )
        self.assertEqual(status, 400)

    def test_cannot_delete_self(self):
        client = self.admin()
        status, _h, _r = client.request("/api/users", "POST", {"action": "delete", "id": self.fx.admin.id})
        self.assertEqual(status, 400)

    def test_change_own_password(self):
        client = self.admin()
        status, _h, _r = client.request(
            "/api/password", "POST", {"old_password": "adminpass", "new_password": "newadminpass"}
        )
        self.assertEqual(status, 200)
        fresh = Client(self.fx)
        self.assertEqual(fresh.login("admin", "newadminpass")[0], 200)
        # 还原，避免影响其它用例
        client.request("/api/password", "POST", {"old_password": "newadminpass", "new_password": "adminpass"})

    def test_change_password_requires_old(self):
        client = self.admin()
        status, _h, _r = client.request(
            "/api/password", "POST", {"old_password": "wrong", "new_password": "whatever123"}
        )
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
