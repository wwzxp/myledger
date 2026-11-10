"""HTTP 层鉴权与隔离测试：真实请求，验证「谁能看到/改到什么」。

这一层测的是容易出事的地方：cookie、重定向、越权、admin 全量视图。
"""

from __future__ import annotations

import gc
import http.cookiejar
import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory

from app import auth, bookkeeping


class ServerFixture:
    """起一个真实服务，指向临时数据库。"""

    def __init__(self):
        self.tmp = TemporaryDirectory()
        bookkeeping.set_db_path(Path(self.tmp.name) / "test.db")
        bookkeeping.init_db()
        conn = bookkeeping.connect()
        auth.ensure_schema(conn)
        self.admin = auth.create_user(conn, "admin", "adminpass", role=auth.ROLE_ADMIN)
        self.alice = auth.create_user(conn, "alice", "alicepass")
        self.bob = auth.create_user(conn, "bob", "bobpass")
        conn.close()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), bookkeeping.Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def url(self, path: str) -> str:
        return f"http://127.0.0.1:{self.port}{path}"

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        gc.collect()
        try:
            self.tmp.cleanup()
        except PermissionError:
            # Windows 上 sqlite 句柄可能还没释放，留待系统清理，不影响测试结论。
            pass


class Client:
    def __init__(self, fixture: ServerFixture):
        self.fixture = fixture
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar), NoRedirect()
        )

    def request(self, path: str, method="GET", body=None):
        data = json.dumps(body).encode() if body is not None else None
        headers = {"content-type": "application/json"} if data else {}
        request = urllib.request.Request(
            self.fixture.url(path), data=data, headers=headers, method=method
        )
        try:
            with self.opener.open(request, timeout=15) as response:
                raw = response.read()
                return response.status, dict(response.headers), raw
        except urllib.error.HTTPError as exc:
            return exc.code, dict(exc.headers), exc.read()

    def get_json(self, path: str):
        status, _headers, raw = self.request(path)
        return status, json.loads(raw or b"{}")

    def login(self, username: str, password: str):
        return self.request("/api/login", "POST", {"username": username, "password": password})


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class AuthGateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fx = ServerFixture()

    @classmethod
    def tearDownClass(cls):
        cls.fx.stop()

    def test_anonymous_api_is_401(self):
        client = Client(self.fx)
        status, payload = client.get_json("/api/summary")
        self.assertEqual(status, 401)
        self.assertIn("未登录", payload.get("error", ""))

    def test_anonymous_page_redirects_to_login(self):
        client = Client(self.fx)
        status, headers, _ = client.request("/")
        self.assertEqual(status, 303)
        self.assertEqual(headers.get("location"), "/login")

    def test_login_page_is_public(self):
        client = Client(self.fx)
        status, _headers, raw = client.request("/login")
        self.assertEqual(status, 200)
        # 断言登录页真的渲染出来了（登录表单），而不是依赖品牌字符串
        self.assertIn(b'login-form', raw)
        self.assertIn('我的账本'.encode('utf-8'), raw)

    def test_wrong_password_401(self):
        client = Client(self.fx)
        status, _headers, _raw = client.login("alice", "nope")
        self.assertEqual(status, 401)

    def test_login_sets_httponly_cookie(self):
        client = Client(self.fx)
        status, headers, _ = client.login("alice", "alicepass")
        self.assertEqual(status, 200)
        cookie = headers.get("set-cookie", "")
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Lax", cookie)
        # Secure 只在 HTTPS 下加；明文 HTTP 加上会导致浏览器根本不发 cookie。
        self.assertNotIn("Secure", cookie)

    def test_https_request_gets_secure_cookie(self):
        client = Client(self.fx)
        request = urllib.request.Request(
            self.fx.url("/api/login"),
            data=json.dumps({"username": "alice", "password": "alicepass"}).encode(),
            headers={"content-type": "application/json", "x-forwarded-proto": "https"},
            method="POST",
        )
        with client.opener.open(request, timeout=15) as response:
            cookie = response.headers.get("set-cookie", "")
        self.assertIn("Secure", cookie)

    def test_logged_in_user_can_read_summary(self):
        client = Client(self.fx)
        client.login("alice", "alicepass")
        status, payload = client.get_json("/api/summary")
        self.assertEqual(status, 200)
        self.assertIn("income", payload)

    def test_logout_invalidates_session(self):
        client = Client(self.fx)
        client.login("alice", "alicepass")
        self.assertEqual(client.get_json("/api/summary")[0], 200)
        client.request("/api/logout", "POST", {})
        self.assertEqual(client.get_json("/api/summary")[0], 401)


class IsolationTest(unittest.TestCase):
    """两个用户各自导入，验证互相看不到。"""

    @classmethod
    def setUpClass(cls):
        cls.fx = ServerFixture()
        conn = bookkeeping.connect()
        bookkeeping.insert_entry(
            {"transaction_time": "2026-11-01 10:00:00", "type": "支出", "category": "餐饮/早午晚餐",
             "amount": "30.00", "account": "alice卡", "transaction_object": "ALICE_ONLY"},
            owner_id=cls.fx.alice.id,
        )
        bookkeeping.insert_entry(
            {"transaction_time": "2026-11-01 11:00:00", "type": "支出", "category": "餐饮/早午餐",
             "amount": "50.00", "account": "bob卡", "transaction_object": "BOB_ONLY"},
            owner_id=cls.fx.bob.id,
        )
        conn.close()

    @classmethod
    def tearDownClass(cls):
        cls.fx.stop()

    def test_alice_sees_only_own_entries(self):
        client = Client(self.fx)
        client.login("alice", "alicepass")
        _status, rows = client.get_json("/api/entries-all")
        objects = {row["transaction_object"] for row in rows}
        self.assertIn("ALICE_ONLY", objects)
        self.assertNotIn("BOB_ONLY", objects)

    def test_bob_sees_only_own_entries(self):
        client = Client(self.fx)
        client.login("bob", "bobpass")
        _status, rows = client.get_json("/api/entries-all")
        objects = {row["transaction_object"] for row in rows}
        self.assertIn("BOB_ONLY", objects)
        self.assertNotIn("ALICE_ONLY", objects)

    def test_expense_totals_differ_per_user(self):
        alice = Client(self.fx)
        alice.login("alice", "alicepass")
        bob = Client(self.fx)
        bob.login("bob", "bobpass")
        _s1, a = alice.get_json("/api/summary")
        _s2, b = bob.get_json("/api/summary")
        self.assertNotEqual(a["expense"], b["expense"])

    def test_cannot_confirm_other_users_entry(self):
        conn = bookkeeping.connect()
        bob_entry = conn.execute(
            "select id from entries where transaction_object = 'BOB_ONLY'"
        ).fetchone()["id"]
        conn.close()

        alice = Client(self.fx)
        alice.login("alice", "alicepass")
        status, _headers, _raw = alice.request(
            "/api/entry-update", "POST", {"id": bob_entry, "category": "购物/日用品"}
        )
        self.assertIn(status, (400, 404), "越权修改必须是 4xx")

    def test_cannot_delete_other_users_entry(self):
        conn = bookkeeping.connect()
        alice_entry = conn.execute(
            "select id from entries where transaction_object = 'ALICE_ONLY'"
        ).fetchone()["id"]
        conn.close()

        bob = Client(self.fx)
        bob.login("bob", "bobpass")
        status, _headers, _raw = bob.request("/api/entry-delete", "POST", {"id": alice_entry})
        self.assertIn(status, (400, 404))

    def test_normal_user_cannot_escalate_to_all_scope(self):
        client = Client(self.fx)
        client.login("alice", "alicepass")
        _status, rows = client.get_json("/api/entries-all?scope=all")
        objects = {row["transaction_object"] for row in rows}
        self.assertNotIn("BOB_ONLY", objects, "普通用户传 scope=all 不应看到他人数据")

    def test_admin_can_see_all_with_scope_all(self):
        client = Client(self.fx)
        client.login("admin", "adminpass")
        _status, rows = client.get_json("/api/entries-all?scope=all")
        objects = {row["transaction_object"] for row in rows}
        self.assertIn("ALICE_ONLY", objects)
        self.assertIn("BOB_ONLY", objects)

    def test_admin_default_view_is_own_only(self):
        client = Client(self.fx)
        client.login("admin", "adminpass")
        _status, rows = client.get_json("/api/entries-all")
        objects = {row["transaction_object"] for row in rows}
        self.assertNotIn("ALICE_ONLY", objects)
        self.assertNotIn("BOB_ONLY", objects)


if __name__ == "__main__":
    unittest.main()
