---
description: 应用源码：fork 自 bingchuH/Bookkeeping 的解析、去重、规则库，加上多用户与看板
kind: module
---

# app/

## 职责

- 账单解析：微信 xlsx、支付宝 GB18030 csv（`importers.py` 门面 + 两个上游脚本）。
- 幂等入库、去重候选、关键词规则、待确认队列、汇总聚合（`bookkeeping.py`）。
- 本地 Web：`bookkeeping.py` 内置的 `ThreadingHTTPServer`，只绑 `127.0.0.1`。
- 网页上传导入：`upload.py` + `POST /api/import-upload`，数据源按文件内容识别。
- 压缩包导入：上传 `.zip`（可加密），密码随表单以 `password` 字段提交；解压在内存完成，不落盘。
- 待确认队列：规则未命中的条目留待人工确认，确认后可学习为关键词规则。
- 鉴权与多用户：`auth.py`（密码 scrypt、会话、限流）、`scope.py`（可见范围）、`bootstrap.py`（首启动建管理员）。
- 按人隔离：每条账目、账户、规则都有 `owner_id`；普通用户只读写自己的，管理员可切换「全部账本」。
  导入链路（`import_upload` → `import_file` → `insert_entry_with_conn`）必须透传 `owner_id`，
  缺省的 `0` 会让数据变成无主记录，用户在界面上看不到。
- 邮箱收附件：每个用户在设置页配自己的 IMAP 账号与授权码；授权码加密存库，主密钥在配置文件里。
  扫描只覆盖最近 `[mail].scan_days` 天（默认 7）的未读邮件，不翻历史未读。
- 待导入附件可**行内导入或删除**：`POST /api/mail-import` 直接按文件名入库（成功后自动删包），
  `POST /api/mail-delete` 删除单个附件；两者都拒绝路径穿越与绝对路径，且限定在当前用户的 inbox 目录内。

## 不负责

- 前端资源本身（在 `app/bookkeeping_app/static/`，来自上游）。
- 端到端测试与 fixture（在 `tests/`）。
- 文档门禁（在 `scripts/`）。

## 对外接口

| 文件 | 接口 |
|---|---|
| `__main__.py` | `python -m app` 起 Web；`init`、`classify-pending` 子命令；其余转发给 `bookkeeping.main()` |
| `classify.py` | `classify_once()`、`classify_pending()`、`ModelUnavailable` |
| `importers.py` | `read_wechat_rows()`、`read_alipay_rows()`、`to_cents()`、`alipay_header()` |
| `upload.py` | `import_upload(字节, 文件名)`、`detect_source()`、`ImportRejected`：网页上传的解析与入库 |
| `multipart.py` | `parse_multipart()`、`parse_boundary()`：Python 3.13 无 `cgi` 后的最小实现 |
| `auth.py` | 密码哈希/校验、`login`、`resolve_session`、`logout`、用户增删改、`count_admins` |
| `scope.py` | `Scope.owner_clause()` 返回 SQL 片段与参数；`scope_for(user_id, include_all)` |
| `bootstrap.py` | `ensure_admin()`：库里没有用户时建管理员并返回初始密码 |
| `archive.py` | `extract_bill()`：从 zip（含 AES/ZipCrypto 加密）取出唯一账单文件 |
| `mailbox.py` | IMAP 拉最近 N 天未读：按文件头校验真 zip、下载链接单独返回、按名删除附件 |
| `mailcreds.py` | 每用户邮箱凭据：AES-GCM 加密后存 `users` 表 |
| `archive.py` | `extract_bill()`：从 zip（含 AES/ZipCrypto 加密）取出唯一账单文件 |
| `bookkeeping.py` | 上游全部子命令：`import`、`import-check`、`keyword-candidates`、`import-duplicates`、`confirm`、`summary`、`dashboard` … |

## 依赖

- Python 3.13；`openpyxl`（xlsx）。
- 无外部依赖：不发任何网络请求，分类只依赖本地规则库。

## 已知限制

- **与上游的差异（本 fork 有意为之）**：
  - 新增 `不计收支` 类型：上游遇到未映射的中性交易会直接丢弃，本 fork 改为保留并排除在收支合计外。
  - `read_wechat_xlsx()` 接受 bytes，供 Web 上传路径复用。
  - 静态资源与配置路径同时兼容 `app/` 与上游 `scripts/` 布局。
- 解析规则仍按上游的固定字段映射，**没有**通用列映射器；新数据源需要新增适配。
- `bookkeeping.py` 保持单文件形态（约 3.2k 行），尚未拆分模块。
- 鉴权是进程内 + SQLite 会话表；多实例部署需共享同一数据库。
- 密码只校验非空，没有强度策略；限流按「用户名 + 来源 IP」，无全局限流。
