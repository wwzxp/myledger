# AGENTS.md

本文件是本仓库的协作规则。改代码前先读完；与代码冲突时以本文件为准，并立刻修正冲突的一方。

## 1. 提问规则（硬性）

- **所有需要用户决策的问题必须用 `ask` 工具提出**，不要用纯文本在回复里提问。
- 一次只问一个问题；每个问题给 2–5 个互斥选项，并标出推荐项与推荐理由。
- 事实性问题不去问用户：能用工具查（文件、命令、网页、GitHub）就先查，把结论写进回复。
- 用户拍板后立刻执行，不反复确认；用户改主意时以最新一次为准。

## 2. 文档规则（硬性）

- **文档文件名使用中文**（`docs/**/*.md`）。根约定文件保留英文名：`README.md`、`AGENTS.md`、`INDEX.md`、`CHANGELOG.md`。
- **目录名、代码标识符、配置键、脚本名一律英文**。
- **每个目录都必须有 `README.md`**，并以 frontmatter 开头：

  ```markdown
  ---
  description: 一句话说清这个目录负责什么
  kind: module | docs | tests | tooling
  ---
  ```

  正文固定五节：`职责` / `不负责` / `对外接口` / `依赖` / `已知限制`。
- **一事实一出处**：同一个事实只在一份文档里定义，其他文档用链接引用，不复制。
- **代码改动必须同步文档**：
  - 目录职责或对外接口变化 → 改该目录 `README.md`
  - 新增/删除/改名文件 → 改 `INDEX.md`
  - 用户可见行为变化 → 改 `CHANGELOG.md`
  - 架构级决策（选型、分层、数据模型、协议） → 新增 `docs/adr/YYYY-MM-DD-主题.md`
- `npm run doc:check` 必须通过才算完成。它检查：目录缺 README、README 缺 frontmatter、本地链接失效、`INDEX.md` 引用了不存在的路径。

## 3. 提交规则

- 使用 Conventional Commits：`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`。
- 一次提交只做一件事；文档同步随代码同一次提交。
- **绝不提交 `data/` 下的任何文件**（真实账单含姓名、账户、流水号）。

## 3.1 磁盘位置规则（硬性）

- **任何文件都不允许写入 C 盘**，包括依赖缓存、虚拟环境、日志、临时文件与模型权重。
- 工具与缓存统一放在 `E:\ai\tools\`，项目数据放项目内或 `E:\ai\tmp\`。
- 安装任何工具前先确认其默认缓存目录；默认落在 `%LOCALAPPDATA%`、`~/.cache`、`~/.local` 的，必须显式改到 E 盘：
  - Python：`PIP_CACHE_DIR`、venv 建在 E 盘、必要时设 `PYTHONUSERBASE`
  - Node：`npm_config_cache`、`PNPM_HOME`
  - 其他：查阅其配置项或用包装脚本改写路径
- 临时目录优先用 `E:\ai\tmp\`；`tempfile` 相关的系统临时目录在需要时通过 `TMP`/`TEMP` 指向 E 盘。
- 装完必须验证：目标缓存目录确实在 E 盘，且 C 盘对应目录没有新增内容。

## 3.2 配置规则（硬性）

- **禁止用环境变量做配置**。应用只从 TOML 配置文件读取设置。
- 配置读取顺序：`--config` 指定 → 当前目录 `myledger.toml` → `~/.config/myledger/config.toml` → 内置默认值。
- 新增配置项时：先加进 `app/config.py` 的 dataclass（带默认值），再在 `docs/部署说明.md` 的字段表里写一行。
- 测试必须覆盖「环境变量被忽略」这一条（见 `tests/test_config.py`）。

## 4. 数据与技术约束

- 金额一律以**整数分**存储与计算，禁止浮点。
- 幂等键缺失时退化为弱去重，并在导入报告中标注。
- 中性交易标记为 `不计收支`：**保留入库可审计，但不进入收入/支出合计**。
- 退款 v1 不冲销（作为已知偏差展示在看板脚注）。
- 仅监听回环地址；不引入远程字体、CDN、统计脚本或任何第三方上报。
- 邮件扫描必须限定时间窗口（默认 7 天），不允许全量扫描未读。
- 分类只走本地规则库；规则未命中的进待确认队列，人工确认后沉淀为规则。不引入外部模型调用。
- **每条账目/账户/规则必须带 `owner_id`**；新增查询一律用 `Scope.owner_clause()` 过滤，不允许裸查全表。
- 写操作必须先校验归属，越权返回 404（不泄漏资源是否存在），不能只靠前端隐藏按钮。
- 密码只存 scrypt 哈希；会话 token 只存 SHA-256；cookie 为 HttpOnly + SameSite=Lax，`Secure` 仅在 HTTPS 下加（否则明文 HTTP 下浏览器不发送，表现为登录后立刻 401）。

## 5. 目录地图

```
app/                应用源码（fork 自 bingchuH/Bookkeeping，MIT）
  bookkeeping.py    入库/去重/规则/聚合/Dashboard（上游单文件）
  importers.py      解析门面：统一返回 amount_cents 与归一化 type
  import_wechat_bill.py / import_alipay_bill.py   上游解析器
  classify.py       模型分类的预留实现（当前未启用）
  auth.py           密码（scrypt）/会话/限流
  scope.py          可见范围（普通用户限本人，admin 可全量）
  bootstrap.py      首启动建管理员
  archive.py        zip（含加密）取账单
  __main__.py       统一入口：python -m app
  bookkeeping_app/  Dashboard 静态资源（含登录页、PWA）
tests/              解析器与分类器测试（合成 fixture，不含真实账单）
scripts/            文档门禁与 PDF 预处理
docs/               产品规格、架构、ADR、调研
data/               本地真实数据，gitignored
```

## 6. 命令

```sh
npm run doc:check                       # 文档门禁；提交前必跑
python -m unittest discover -s tests    # 单元测试
python -m app                           # 启动本地 Web（127.0.0.1:8765）
python -m app --config myledger.toml   # 显式指定配置文件
python -m app backup                    # 立即备份一次数据库
```

部署：

**Linux 服务器**用 `scripts/install.sh` 一键安装，systemd 托管、开机自启：

```sh
sudo bash scripts/install.sh
systemctl status myledger
systemctl restart myledger
journalctl -u myledger -f
```

**Windows 本机**用 `scripts/start-windows.cmd`：

```bat
scripts\start-windows.cmd               :: 前台（看日志）
scripts\start-windows.cmd /background   :: 后台
scripts\stop-windows.cmd                :: 按端口停掉 8765 上的实例
```

脚本固定 `%AI_LEDGER_HOME%\ai-ledger.toml`（默认 `E:\ai\apps\ai-ledger`），
**不接受配置参数覆盖**——部署实例和开发实例必须用不同端口，否则会误连测试库。

生产 venv 用 **editable 安装**指向源码，改代码后重启即生效，不要 `--force-reinstall`：

```bat
%AI_LEDGER_HOME%\.venv\Scripts\python.exe -m pip install -e E:\ai\code\ai_ledger
```

`--force-reinstall` 会先删掉 site-packages 里的 `app/` 再复制，中途失败会让服务
直接挂掉（`ModuleNotFoundError: No module named 'app.bookkeeping'`）。
安装完用 `python -c "import app; print(app.__file__)"` 确认路径指向源码目录。

开机自启靠「启动」文件夹里的 `ai-ledger.lnk`（无需管理员权限）。
`Register-ScheduledTask` 需要提权，普通用户下会 `Access is denied`。
该 .lnk 落在 C 盘用户目录，是 Windows 启动文件夹的固定位置，属已知例外。

首次启动会在日志打印管理员初始密码。公网暴露必须放在 TLS 反代之后，
见 `docs/跨平台部署.md`。

应用本体是 Python；Node 只用于文档门禁与 PDF 预处理，不要往 `package.json` 里加应用依赖。

### 工程纪律工具（ub-mode 配套，均在 E 盘）

```bat
E:\ai\tools\bin\crapper.cmd app        :: CRAP 复杂度与覆盖率
E:\ai\tools\bin\dryer.cmd app          :: 结构重复检测（阈值 0.82）
E:\ai\tools\bin\mutator.cmd --scan app :: 变异点扫描；带 --test-command 才真跑测试
```

它们输出 `.metrics\`（已在 `.gitignore` 中排除）。详见 `E:\ai\tools\README.md`。

真实账单的操作流程见 `docs/使用说明.md`；尚未实现的命令不要写进文档。

## 7. 上游与许可

- 上游：`bingchuH/Bookkeeping`（MIT），fork 基线 commit 见 `docs/adr/2026-11-05-改用Python并fork-Bookkeeping.md`。
- 许可全文：`THIRD_PARTY_LICENSES-Bookkeeping.txt`。
- `app/bookkeeping.py` 已偏离上游（新增 `不计收支` 类型、路径兼容、bytes 输入），**不要用上游文件直接覆盖**。

## 8. 未决事项

- 类目体系：当前沿用上游 `app/config.yaml` 的三级结构，尚未按调研结论裁剪。
- 去重：上游为「时间 ±2 秒 + 金额 + 账户」精确匹配，跨平台延迟到账的重复仍抓不到。
