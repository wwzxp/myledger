"""本地 1B 模型分类兜底。

设计约束（来自 docs/specs/产品规格-我的账本工具.md 与 ADR-2026-11-05）：
- 只处理规则未命中的交易，绝不替换已命中的规则结果。
- 模型不可用时抛 ModelUnavailable，由调用方降级为「待确认」，不得静默失败。
- 输出必须落在 config.yaml 的合法类目枚举内；越界或无法解析一律视为未命中。
- 账单内容不离开本机：只请求 127.0.0.1 上的 llama-server。
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Iterable, Sequence

DEFAULT_ENDPOINT = "http://127.0.0.1:8080/v1/chat/completions"
DEFAULT_MODEL = "minicpm-v-4.7-1b"
DEFAULT_TIMEOUT_SECONDS = 30.0
MIN_CONFIDENCE = 0.55


class ModelUnavailable(RuntimeError):
    """本地模型不可达或返回不可用结果。调用方据此降级，不得当作「无类目」。"""


@dataclass(frozen=True)
class Prediction:
    category: str
    confidence: float


def build_prompt(transaction_object: str, note: str, categories: Sequence[str]) -> str:
    """构造受约束的分类提示词。只送交易对象与备注，不送账户、订单号、金额明细。"""
    allowed = "\n".join(f"- {name}" for name in categories)
    return (
        "你是个人消费分类器。只能从下列类目中选择一个，不能创造新类目。\n"
        f"可选类目：\n{allowed}\n\n"
        "只输出一行 JSON，格式为 {\"category\": \"<类目>\", \"confidence\": <0到1的小数>}。\n"
        "如果无法判断，输出 {\"category\": null, \"confidence\": 0}。\n\n"
        f"交易对象：{transaction_object}\n"
        f"备注：{note}\n"
    )


def classify_once(
    transaction_object: str,
    note: str,
    categories: Sequence[str],
    endpoint: str | None = None,
    model: str | None = None,
    timeout: float | None = None,
) -> Prediction | None:
    """调用本地 llama-server 做一次分类。返回 None 表示模型判定为「无法判断」。"""
    if not categories:
        raise ValueError("categories must not be empty")

    if endpoint is None or model is None or timeout is None:
        from app.config import load_config

        config = load_config().model
        endpoint = endpoint or config.endpoint
        model = model or config.name
        timeout = config.timeout_seconds if timeout is None else timeout
    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": 64,
        "messages": [
            {"role": "user", "content": build_prompt(transaction_object, note, categories)}
        ],
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ModelUnavailable(f"本地模型不可用：{exc}") from exc

    try:
        content = json.loads(body)["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ModelUnavailable(f"模型响应结构不符合预期：{exc}") from exc

    parsed = _parse_output(content)
    if parsed is None:
        return None
    category, confidence = parsed
    if category not in categories:
        return None
    if confidence < MIN_CONFIDENCE:
        return None
    return Prediction(category=category, confidence=confidence)


def _parse_output(content: str) -> tuple[str, float] | None:
    """从模型输出里抠出 JSON。模型可能带 ```json 围栏或前后废话。"""
    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(content[start : end + 1])
    except json.JSONDecodeError:
        return None
    category = data.get("category")
    if not isinstance(category, str) or not category.strip():
        return None
    try:
        confidence = float(data.get("confidence", 0))
    except (TypeError, ValueError):
        return None
    return category.strip(), max(0.0, min(1.0, confidence))


def classify_pending(
    rows: Iterable[dict],
    categories: Sequence[str],
    **kwargs,
) -> list[dict]:
    """批量给未分类交易打标。返回 [{id, category, confidence}]，不写库。"""
    results: list[dict] = []
    for row in rows:
        prediction = classify_once(
            transaction_object=str(row.get("transaction_object") or ""),
            note=str(row.get("note") or ""),
            categories=categories,
            **kwargs,
        )
        if prediction is None:
            continue
        results.append(
            {
                "id": row.get("id"),
                "category": prediction.category,
                "confidence": prediction.confidence,
            }
        )
    return results
