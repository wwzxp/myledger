# 2026-11-05 改用 Python 并 fork Bookkeeping

## 背景

原计划是 Node/TS 自研（Hono + Vite/React + `node:sqlite`），理由是不想引入 Python 运行时。调研阶段用真实账单验证后，这个前提被推翻了。

## 证据

在本书的两个真实导出文件上实测 `bingchuH/Bookkeeping`（MIT，Python，commit `138d0f1`）：

| 项目 | 结果 |
|---|---|
| 微信 xlsx | 表头行 18，全部记录解析成功；`收/支` 为空的中性交易识别与账单标注一致 |
| 支付宝 csv（GB18030） | 表头行 24，全部记录解析成功；`不计收支` 识别正确 |
| 运行环境 | 本机 Python 3.13 + `openpyxl`，无需额外依赖；`init-db` 直接可用 |
| 去重实现 | 账户 + 时间差 ≤2 秒 + 金额相等，产出候选供人工确认（`bookkeeping.py:1623`） |

同时确认了它的短板：无内置模型、UI 仅为单文件 Dashboard、`bookkeeping.py` 单文件 2.9k 行。

## 选项

| 选项 | 结论 |
|---|---|
| Node/TS 自研，移植解析规则 | 边际情况（表头缩进、退款行、备注换行、GB18030 四字节）只能靠真实账单撞，DEG 的 issue #236 与 Bean-Sieve 的 Alpha 状态就是前车之鉴 |
| Python fork Bookkeeping | 解析与去重当天可用；代价是推翻已定的 Node 栈 |
| Python 解析子进程 + Node UI | 双运行时，错误跨进程传，部署多一个依赖 |

## 决定

1. 后端改为 **Python 3.13**，fork `bingchuH/Bookkeeping`（MIT），保留其解析、去重、规则库、待确认队列与 Dashboard。
2. 许可证与版权声明保留在 `THIRD_PARTY_LICENSES-Bookkeeping.txt`；上游 commit 记录在本文件与 `app/README.md`。
3. 自研部分只做三件事：本地 1B 兜底分类（`app/classify.py`）、统一入口（`app/__main__.py`）、可测的解析门面（`app/importers.py`）。
4. 与上游的**有意差异**：中性交易保留为 `不计收支` 类型并排除在收支合计外（上游会丢弃未映射的中性行）。

## 后果

- 放弃 Node/TS 技术栈与 `node:sqlite`；`package.json` 仅保留文档门禁脚本，不再承载应用。
- 解析质量继承上游的字段映射；新增数据源仍需写适配器，不是通用列映射。
- 上游若更新，需要手工合并；`app/bookkeeping.py` 已偏离上游（新增类型、路径兼容、bytes 输入），不能直接覆盖。
- 本地模型是可选增强：不可用时应用仍能导入与看板，`classify-pending` 返回码 2 并打印降级原因。
