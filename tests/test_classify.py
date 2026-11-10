"""分类兜底测试：只测外部可观测行为 —— 给定模型响应，得到什么分类结果。

不启真模型：用本地 HTTP 桩替身，验证协议契约与降级行为。
"""

from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app.classify import ModelUnavailable, classify_once


class _StubHandler(BaseHTTPRequestHandler):
    response_body = b""
    status = 200
    requests: list[dict] = []

    def log_message(self, *args):  # 静音测试输出
        pass

    def do_POST(self):
        size = int(self.headers.get("content-length", "0"))
        type(self).requests.append(json.loads(self.rfile.read(size).decode("utf-8")))
        self.send_response(type(self).status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(type(self).response_body)))
        self.end_headers()
        self.wfile.write(type(self).response_body)


class StubServer:
    def __enter__(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _StubHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address[:2]
        self.endpoint = f"http://{host}:{port}/v1/chat/completions"
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()


def _completion(content: str) -> bytes:
    return json.dumps({"choices": [{"message": {"content": content}}]}).encode("utf-8")


class ClassifyOnceTest(unittest.TestCase):
    categories = ["餐饮/早午晚餐", "交通/打车", "购物/日用品"]

    def _run(self, body: bytes, transaction_object="肯德基", note="午餐", status=200):
        _StubHandler.requests = []
        _StubHandler.response_body = body
        _StubHandler.status = status
        with StubServer() as stub:
            return classify_once(
                transaction_object,
                note,
                self.categories,
                endpoint=stub.endpoint,
                timeout=5,
            )

    def test_returns_allowed_category(self):
        prediction = self._run(_completion('{"category": "餐饮/早午晚餐", "confidence": 0.82}'))
        self.assertIsNotNone(prediction)
        self.assertEqual(prediction.category, "餐饮/早午晚餐")
        self.assertAlmostEqual(prediction.confidence, 0.82, places=2)

    def test_rejects_category_outside_taxonomy(self):
        self.assertIsNone(self._run(_completion('{"category": "宠物/猫粮", "confidence": 0.99}')))

    def test_rejects_low_confidence(self):
        self.assertIsNone(self._run(_completion('{"category": "餐饮/早午晚餐", "confidence": 0.2}')))

    def test_null_category_means_unjudgeable(self):
        self.assertIsNone(self._run(_completion('{"category": null, "confidence": 0}')))

    def test_tolerates_code_fence_around_json(self):
        prediction = self._run(
            _completion('```json\n{"category": "交通/打车", "confidence": 0.7}\n```')
        )
        self.assertIsNotNone(prediction)
        self.assertEqual(prediction.category, "交通/打车")

    def test_garbage_output_is_unjudgeable_not_crash(self):
        self.assertIsNone(self._run(_completion("我觉得是吃饭吧")))

    def test_unreachable_model_raises(self):
        with self.assertRaises(ModelUnavailable):
            classify_once(
                "肯德基",
                "午餐",
                self.categories,
                endpoint="http://127.0.0.1:9/v1/chat/completions",
                timeout=2,
            )

    def test_prompt_contains_taxonomy_and_no_account_or_amount(self):
        self._run(_completion('{"category": null, "confidence": 0}'))
        prompt = _StubHandler.requests[0]["messages"][0]["content"]
        for category in self.categories:
            self.assertIn(category, prompt)
        self.assertIn("肯德基", prompt)
        self.assertIn("JSON", prompt)


if __name__ == "__main__":
    unittest.main()
