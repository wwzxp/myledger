---
description: 测试与合成 fixture：解析器的编码/表头/中性交易，分类器的枚举/置信度/降级
kind: tests
---

# tests/

## 职责

- **解析器测试**（`test_importers.py`）：微信 xlsx 与支付宝 GB18030 csv 的编码回退、表头识别、中性交易保留、金额转分。
- **分类器测试**（`test_classify.py`）：类目枚举校验、置信度阈值、JSON 围栏容错、模型不可达时抛 `ModelUnavailable`。
- fixture 在测试内用 `openpyxl`/`csv` 现场生成，**不落盘真实账单**。

## 不负责

- 真实账单（只在 `data/`，gitignored）。
- 端到端浏览器测试。
- 覆盖率指标本身；测试为行为服务。

## 对外接口

```sh
python -m unittest discover -s tests
```

测试通过公开函数进入：`app.importers.read_*`、`app.classify.classify_once`；模型用本地 HTTP 桩替身，不连真模型。

## 依赖

- Python 标准库 `unittest`、`http.server`（桩）、`tempfile`；`openpyxl` 生成 fixture。

## 已知限制

- 未覆盖 `bookkeeping.py` 的入库/去重/聚合（上游单文件，耦合 HTTP 与全局连接）；这部分目前靠真实账单跑通验证。
- 未覆盖 Web 层（Dashboard 由上游提供）。
