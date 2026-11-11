"""HTTP keep-alive 下的请求体处理，与链接型邮件下载失败的回滚。

两个真实故障：
1. `POST /api/mail-fetch` 从不读请求体，残留的 `{}` 变成下一条请求的请求行
   （`{}POST /api/mail-download` → 501），表现为「点下载没反应、也没提示」。
2. 收取阶段把带下载链接的邮件标成已读；下载失败后邮件仍是已读，
   下次「从邮箱收取」再也扫不到它。
"""

from __future__ import annotations

import gc
import http.client
import http.cookiejar
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from app import auth, bookkeeping, mailbox


class KeepAliveFixture:
    """同一条 TCP 连接上连发多个 POST，复刻浏览器的 keep-alive 行为。"""

    def __init__(self):
        self.tmp = TemporaryDirectory()
        bookkeeping.set_db_path(Path(self.tmp.name) / "test.db")
        bookkeeping.init_db()
        conn = bookkeeping.connect()
        auth.ensure_schema(conn)
        auth.create_user(conn, "admin", "adminpass", role=auth.ROLE_ADMIN)
        conn.close()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), bookkeeping.Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        self.cookie = ""

    def post(self, path, body=None):
        payload = json.dumps(body).encode() if body is not None else None
        headers = {"content-type": "application/json"} if payload else {}
        if self.cookie:
            headers["cookie"] = self.cookie
        self.conn.request("POST", path, body=payload, headers=headers)
        response = self.conn.getresponse()
        raw = response.read()
        set_cookie = response.getheader("set-cookie") or ""
        if set_cookie:
            self.cookie = set_cookie.split(";")[0]
        try:
            return response.status, json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return response.status, {"raw": raw[:200].decode("utf-8", "replace")}

    def login(self):
        return self.post("/api/login", {"username": "admin", "password": "adminpass"})

    def stop(self):
        try:
            self.conn.close()
        except Exception:
            pass
        self.server.shutdown()
        self.server.server_close()
        gc.collect()
        try:
            self.tmp.cleanup()
        except PermissionError:
            pass


class BodyDrainTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fx = KeepAliveFixture()

    @classmethod
    def tearDownClass(cls):
        cls.fx.stop()

    def test_post_without_body_does_not_desync_connection(self):
        """mail-fetch 之类的空体 POST 之后，下一条 POST 必须仍是正常请求。"""
        fx = self.fx
        self.assertEqual(fx.login()[0], 200)
        # 空体 POST：修复前它会把 `{}` 留在 socket 里
        status, _payload = fx.post("/api/mail-fetch", {})
        self.assertNotEqual(status, 501, "连接已脱同步：残留请求体变成了下一条请求行")

        # 紧接着的请求仍然必须是合法 POST（不能是 501 Unsupported method）
        status, payload = fx.post("/api/mail-download", {"url": "http://127.0.0.1:1/x", "uid": "1"})
        self.assertNotEqual(status, 501, f"连接已脱同步：{payload}")


class UnreadRollbackTest(unittest.TestCase):
    """下载失败要把邮件改回未读，否则这封邮件永远扫不到。"""

    def setUp(self):
        self.tmp = TemporaryDirectory()
        bookkeeping.set_db_path(Path(self.tmp.name) / "test.db")
        bookkeeping.init_db()
        conn = bookkeeping.connect()
        auth.ensure_schema(conn)
        auth.create_user(conn, "admin", "adminpass", role=auth.ROLE_ADMIN)
        self.key = "test-secret-key"
        from app import mailcreds

        mailcreds.ensure_schema(conn)
        mailcreds.save(conn, 1, "me@qq.com", "authcode", self.key)
        conn.close()

    def tearDown(self):
        gc.collect()
        try:
            self.tmp.cleanup()
        except PermissionError:
            pass

    def test_store_uses_uid_not_sequence(self):
        """跨连接改标志位必须靠 UID：STORE 要发 UID STORE。"""
        calls = []

        class Fake:
            def __init__(self, *a, **kw):
                pass

            def login(self, u, p):
                return "OK", [b""]

            def select(self, name, readonly=False):
                return "OK", [b"1"]

            def uid(self, command, *args):
                calls.append((command, args))
                return "OK", [b""]

            def logout(self):
                return "BYE", [b""]

        with mock.patch.object(mailbox.imaplib, "IMAP4_SSL", Fake):
            ok = mailbox.unmark_seen("imap.qq.com", 993, "me@qq.com", "authcode", "2254")
        self.assertTrue(ok)
        self.assertEqual(calls[0][0], "STORE")
        self.assertEqual(calls[0][1][1:], ("-FLAGS", "\\Seen"))

    def test_unmark_seen_blank_uid_is_noop(self):
        self.assertFalse(mailbox.unmark_seen("imap.qq.com", 993, "u", "p", "  "))

    def test_unmark_seen_survives_connection_failure(self):
        class Boom:
            def __init__(self, *a, **kw):
                raise OSError("no route")

        with mock.patch.object(mailbox.imaplib, "IMAP4_SSL", Boom):
            self.assertFalse(mailbox.unmark_seen("imap.qq.com", 993, "u", "p", "1"))


if __name__ == "__main__":
    unittest.main()
