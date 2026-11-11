# 索引

本文件是**文件级索引**：每个文件/目录一句话说清职责，以及改动它时要同步谁。新增、删除、改名文件必须同时改这里。

## 根目录

| 路径 | 类型 | 职责 | 改动时同步 |
|---|---|---|---|
| `README.md` | 文档 | 项目定位、边界、当前状态 | `CHANGELOG.md` |
| `AGENTS.md` | 文档 | 协作与文档规则（提问、提交、数据、约束） | — |
| `INDEX.md` | 文档 | 本索引 | — |
| `CHANGELOG.md` | 文档 | 用户可见变更记录 | `README.md` |
| `package.json` | 配置 | 仅保留文档门禁脚本 | `AGENTS.md` |
| `.gitignore` | 配置 | 排除真实数据与生成物 | `AGENTS.md` |
| `THIRD_PARTY_LICENSES-Bookkeeping.txt` | 许可 | 上游 Bookkeeping 的 MIT 许可与版权 | `app/README.md` |

## 应用

| 路径 | 类型 | 职责 | 改动时同步 |
|---|---|---|---|
| `app/__main__.py` | 模块 | 统一入口：`python -m app`、`init` | `docs/使用说明.md` |
| `app/bookkeeping.py` | 模块 | 入库、去重、规则库、聚合、Dashboard（fork 上游） | `app/README.md`、`docs/architecture/架构.md` |
| `app/importers.py` | 模块 | 解析门面：统一 `amount_cents` 与归一化 `type` | `app/README.md`、`tests/test_importers.py` |
| `app/upload.py` | 模块 | 网页上传：来源识别、解析、临时 CSV 入库 | `tests/test_upload.py` |
| `app/multipart.py` | 模块 | 最小 multipart 解析（替代已移除的 `cgi`） | `app/upload.py` |
| `app/config.py` | 模块 | TOML 配置读取（唯一配置来源，不读环境变量） | `tests/test_config.py`、`docs/部署说明.md` |
| `app/archive.py` | 模块 | zip 解包：加密检测、密码校验、唯一账单文件提取 | `tests/test_archive.py` |
| `app/auth.py` | 模块 | 密码 scrypt、会话（30 天滑动）、登录限流、用户增删改 | `tests/test_auth.py` |
| `app/scope.py` | 模块 | 可见范围对象：普通用户限本人，admin 可全量 | `app/bookkeeping.py` |
| `app/bootstrap.py` | 模块 | 首启动建管理员并打印初始密码 | `tests/test_bootstrap.py` |
| `app/backup.py` | 模块 | SQLite 在线备份、保留最近 N 份、校验可读 | `tests/test_backup.py` |
| `app/mailbox.py` | 模块 | IMAP 拉未读邮件：zip 附件落盘、账单下载链接返回 | `tests/test_mailbox.py`、`tests/test_mail_links.py` |
| `app/mailcreds.py` | 模块 | 每用户邮箱凭据，AES-GCM 加密存库 | `tests/test_mailcreds.py` |
| `pyproject.toml` | 配置 | 包声明、依赖、`myledger` 控制台入口 | `docs/部署说明.md` |
| `app/import_wechat_bill.py` | 模块 | 微信 xlsx 解析（含中性交易映射） | `app/README.md` |
| `app/import_alipay_bill.py` | 模块 | 支付宝 GB18030 csv 解析（含中性交易保留） | `app/README.md` |
| `app/import_bill.py` | 模块 | 上游的通用导入薄封装 | `app/README.md` |
| `app/init_db.py` | 模块 | 上游的建库薄封装 | `app/README.md` |
| `app/classify.py` | 模块 | 模型分类的预留实现，当前未启用；`ModelUnavailable` 降级契约 | `tests/test_classify.py` |
| `app/config.yaml` | 配置 | 类目树与账户口径 | `docs/specs/产品规格-我的账本.md` |
| `app/bookkeeping_app/static/` | 资源 | Dashboard 的 HTML/CSS/JS（上游）+ 登录页 + PWA 资源 | `app/README.md` |
| `app/bookkeeping_app/static/login.html` | 资源 | 登录页 | `tests/test_http_auth.py` |
| `app/bookkeeping_app/static/demo/` | 资源 | 导入页功能演示：舞台/积木/场景/样式 + 内置 GSAP | `.github/workflows/build.yml` |
| `app/bookkeeping_app/static/manifest.json` | 资源 | PWA manifest（图标、全屏、主题色） | `app/README.md` |
| `app/bookkeeping_app/static/service-worker.js` | 资源 | 静态资源缓存；API 一律走网络 | `app/README.md` |
| `app/bookkeeping_app/static/icon-192.png` | 资源 | PWA 图标 192×192 | `manifest.json` |
| `app/bookkeeping_app/static/icon-512.png` | 资源 | PWA 图标 512×512 | `manifest.json` |

## 测试与工具

| 路径 | 类型 | 职责 | 改动时同步 |
|---|---|---|---|
| `tests/test_importers.py` | 测试 | 解析器：编码、表头识别、中性交易、金额分 | `app/importers.py` |
| `tests/test_classify.py` | 测试 | 分类器：枚举校验、置信度、降级、JSON 容错 | `app/classify.py` |
| `tests/test_upload.py` | 测试 | 上传：来源识别、拒绝提示、金额分、multipart | `app/upload.py` |
| `tests/test_auth.py` | 测试 | 密码 scrypt、会话、限流、禁用即失效 | `app/auth.py` |
| `tests/test_bootstrap.py` | 测试 | 首启动建管理员、不覆盖已有用户 | `app/bootstrap.py` |
| `tests/test_http_auth.py` | 测试 | HTTP 层：未登录拦截、跨用户隔离、越权 4xx、admin 全量 | `app/bookkeeping.py` |
| `tests/test_user_admin.py` | 测试 | 用户管理：建号、重置、禁用、最后管理员保护 | `app/bookkeeping.py` |
| `tests/test_backup.py` | 测试 | 备份一致性、保留策略、坏库拒绝 | `app/backup.py` |
| `tests/test_mailbox.py` | 测试 | 附件型邮件：只取 zip、标记已读、重复不覆盖 | `app/mailbox.py` |
| `tests/test_mail_links.py` | 测试 | 链接型邮件：白名单域名、下载落盘 | `app/mailbox.py` |
| `tests/test_mail_window.py` | 测试 | 扫描时间窗（默认 7 天、含 SINCE）、附件删除防穿越 | `app/mailbox.py` |
| `tests/test_mail_attachment_sniff.py` | 测试 | zip 文件头校验：GIF 伪装、空/短载荷 | `app/mailbox.py` |
| `tests/test_import_owner.py` | 测试 | 导入归属用户、重复导入有 deduped 反馈、去重不跨用户 | `app/upload.py` |
| `tests/test_meituan.py` | 测试 | 美团账单：表头定位、成功时间、实付金额、不计收支 | `app/importers.py` |
| `tests/test_douyin.py` | 测试 | 抖音 PDF：列边界还原、折行拼接、页脚截断、类型映射 | `app/importers.py` |
| `tests/test_category_fold.py` | 测试 | 分类规则按一级类目分组、折叠顺序稳定 | `app/bookkeeping_app/static/dashboard.js` |
| `tests/test_mailcreds.py` | 测试 | 凭据加密、按用户隔离、错密钥拒绝 | `app/mailcreds.py` |
| `tests/test_config.py` | 测试 | 配置：默认值、字段解析、环境变量被忽略 | `app/config.py` |
| `tests/test_installed.py` | 测试 | 安装后验收：包可导入、脚本存在、静态资源随包、数据库路径无关 cwd | `pyproject.toml` |
| `scripts/doc-check.mjs` | 工具 | 文档门禁：README、frontmatter、链接、索引 | `AGENTS.md` |
| `scripts/prepare-pdf.mjs` | 工具 | 调研报告 PDF 预处理：mermaid → PNG、绝对路径 | `docs/research/我的账本-横纵分析报告.md` |
| `docs/reference/动态功能演示实现指南.md` | 文档 | 外部技术参考：DOM+GSAP 编排功能演示弹窗的做法，与记账业务无关 | `--` |
| `docs/reference/assets/verify.js` | 脚本 | 演示动画的断言式验收：读屏清单 JSON，检查文案/图标/副标题/切页/光标/JS 错误 | `docs/reference/演示动画制作说明.md` |
| `docs/reference/assets/README.md` | 文档 | 验收脚本的用法、接口与已知限制 | `docs/reference/演示动画制作说明.md` |
| `docs/reference/演示动画制作说明.md` | 文档 | 从录屏做出演示动画的完整说明书：可直接复制的骨架代码、抽帧流程、光标十二坑、隐私脱敏、验收清单。面向零记忆的新项目 | `AGENTS.md` |

## 文档

| 路径 | 类型 | 职责 | 改动时同步 |
|---|---|---|---|
| `docs/README.md` | 文档 | 文档地图，只做索引 | 本文件 |
| `docs/使用说明.md` | 文档 | 从初始化到看板的操作流程与已知偏差 | `AGENTS.md` |
| `docs/部署说明.md` | 文档 | 安装、配置字段表、运行与子命令 | `app/config.py` |
| `docs/跨平台部署.md` | 文档 | Linux / macOS 部署、nginx + TLS、systemd / launchd 自启 | `scripts/install.sh` |
| `scripts/install.sh` | 脚本 | Ubuntu/Debian 一键部署（系统依赖、独立 Python、systemd） | `docs/跨平台部署.md` |
| `scripts/start-windows.cmd` | 脚本 | Windows 本机启动，固定正式配置与 8765 端口 | `AGENTS.md` |
| `scripts/stop-windows.cmd` | 脚本 | 按端口停掉 8765 上的实例，避免误杀其他 python | `AGENTS.md` |
| `scripts/make-demo-bills.py` | 脚本 | 生成合成账单，用于部署验证，不含真实数据 | `--` |
| `scripts/verify-artifacts.py` | 脚本 | 校验三平台打包产物（解压、文件头、大小） | `.github/workflows/build.yml` |
| `docs/specs/` | 文档 | 产品规格（PRD） | `CHANGELOG.md` |
| `docs/assets/README.md` | 文档 | README 引用的截图与演示动图（全部为合成数据） | `README.md` |
| `docs/assets/dashboard.png` | 图片 | 看板三栏结构，README「界面」引用 | `app/bookkeeping_app/static/index.html` |
| `docs/assets/demo-export.gif` | 图片 | 微信账单导出演示（约 13 秒），README「内置演示」引用 | `app/bookkeeping_app/static/demo/` |
| `docs/assets/demo-panel.png` | 图片 | 演示面板目录，README「内置演示」引用 | `app/bookkeeping_app/static/demo/catalog.js` |
| `docs/specs/产品规格-我的账本.md` | 文档 | 问题、用户故事、实现决策、测试决策、范围外 | `CHANGELOG.md`、`docs/architecture/架构.md` |
| `docs/architecture/` | 文档 | 系统架构（分层、数据流、模块边界） | 各模块 `README.md` |
| `docs/architecture/架构.md` | 文档 | mermaid 架构图、边界表、关键不变量 | 本文件、各模块 `README.md` |
| `docs/adr/` | 文档 | 架构决策记录，一决策一文件，文件名带日期 | `docs/architecture/架构.md` |
| `docs/adr/2026-11-05-技术栈与运行边界.md` | 文档 | 最初的 Node/TS 选型（部分结论已被下一篇取代） | 本文件 |
| `docs/adr/2026-11-05-改用Python并fork-Bookkeeping.md` | 文档 | 改用 Python 并 fork 的决策与证据 | `app/README.md` |
| `docs/research/` | 文档 | 竞品调研报告 | `docs/specs/产品规格-我的账本.md` |
| `docs/research/我的账本-横纵分析报告.md` | 文档 | 横纵分析法报告：需求前史、竞争图谱、架构图、fork 结论 | `CHANGELOG.md` |
| `docs/research/我的账本-横纵分析报告.pdf` | 产物 | 由上述 md 渲染的 PDF | 改 md 后重跑 `scripts/prepare-pdf.mjs` |
| `docs/research/assets/README.md` | 资源 | 截图目录说明与命名约定 | — |
| `docs/research/assets/架构-firefly.png` | 资源 | Firefly III 架构图 | 改 md 中 mermaid 源码后重渲染 |
| `docs/research/assets/架构-actual.png` | 资源 | Actual Budget 架构图 | 同上 |
| `docs/research/assets/架构-deg.png` | 资源 | double-entry-generator 管道图 | 同上 |
| `docs/research/assets/架构-bookkeeping.png` | 资源 | Bookkeeping 架构图 | 同上 |
| `docs/research/assets/架构-quadrant.png` | 资源 | 生态位象限图 | 同上 |
| `docs/research/assets/FireflyIII-仓库页.png` | 资源 | Firefly III 取证截图 | `docs/research/README.md` |
| `docs/research/assets/Actual-导入文档.png` | 资源 | Actual 导入文档取证截图 | 同上 |
| `docs/research/assets/DEG-文档首页.png` | 资源 | DEG 文档首页取证截图 | 同上 |
| `docs/research/assets/Bookkeeping-仓库页.png` | 资源 | Bookkeeping 仓库页取证截图 | 同上 |
| `docs/research/assets/钱迹-分类管理.png` | 资源 | 钱迹分类管理取证截图 | 同上 |
| `docs/research/assets/钱迹-账单导入.png` | 资源 | 钱迹账单导入取证截图 | 同上 |
| `docs/research/assets/界面-导入页.png` | 资源 | 本项目导入页实拍 | `docs/使用说明.md` |
| `docs/research/assets/界面-导入结果.png` | 资源 | 上传成功后结果面板实拍 | `docs/使用说明.md` |
| `docs/research/assets/界面-总览看板.png` | 资源 | 总览看板实拍（含 KPI 与图表） | `docs/使用说明.md` |

## 本地数据（不入库）

| 路径 | 类型 | 职责 |
|---|---|---|
| `data/` | 数据 | 本地数据根目录：`ledger.db`、`mail-inbox/`、`backups/`。子目录由配置决定；整目录已 gitignore，永不提交 |
