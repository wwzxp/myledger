# 变更记录

本文件记录用户可见的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [Unreleased]

（暂无）

## [0.1.0] - 2026-11-11

### Added

- **README 加入界面截图与演示动图**：新增 `docs/assets/`（看板截图、微信账单导出
  动图、演示面板目录图），README 的「界面」「内置演示」两节配图，并注明截图与
  演示数据均由 `scripts/make-demo-bills.py` 合成，不含真实账单。

- **演示新增美团账单导出**（`static/demo/scenes/export-meituan.js`，13 屏）：
  我的 → 钱包 → 账单 → ⋯ → 下载账单 → 去下载 → 选日期 → 填邮箱 → 确认 →
  身份验证 → 支付密码 → 申请结果 → 申请记录。
- **演示新增抖音账单导出**（`static/demo/scenes/export-douyin.js`，12 屏）：
  我的 → 横杆菜单 → 钱包 → 账单 → ⋯ → 下载账单 → 同意并申请 → 支付密码 →
  自定义日期 → 填邮箱 → 确认 → 申请已提交。
- **演示光标落点按元素类型修正**（`static/demo/kit.js`）：原来给所有目标都加纵向
  偏移，一行文字（盒高约 31px）会被推下 9px，表现为「点击位置偏下」。
  现在只对 40px 以上的行/按钮偏移，短文字正好居中。

- **演示新增「邮箱授权码怎么拿」**（`static/demo/`）：电脑端的 7 屏教学演示——
  QQ 邮箱设置 → 账号与安全 → 安全设置 → 开启 IMAP 服务 → 扫码拿授权码 →
  回我的账本设置填入。演示目录多出「导入之前」分组，位置在「导入之后」之前，
  因为没拿到授权码时「从邮箱收取附件」点不动。
- **演示节奏整体放慢**：修掉光标补间不在时间线上的问题（`tl.call` 立即返回，
  点击与切页会抢在光标到达之前），教学型场景单屏停留改为 3–5 秒、
  点击目标可见 ≥1 秒。支付宝演示同步受益。

- **演示动画断言式验收**（`docs/reference/assets/verify.js`）：把「界面细节不能偷懒」
  变成机器可判定的失败。读屏清单 JSON，逐项断言文案、图标数量、副标题数量、
  页面叠加、光标位置、JS 错误，任一项失败退出码 1。
  实测对照：只画文字不做图标的实现被判不通过（`iconLike 0 < 3`），
  照录屏做的实现通过（`iconLike 6 ≥ 6`，文案 7 项齐全）。
- **演示说明新增 §0 任务契约**：面向 AI 执行，给出必须产出的文件清单、
  验收命令、不能省的视觉元素、执行顺序、八条禁止事项。

- **演示动画制作说明**（`docs/reference/演示动画制作说明.md`）：从录屏做出演示动画的完整说明书，
  面向零记忆的新项目。含可直接复制的 `stage.js` / `kit.js` / `demo.css` 骨架代码，
  以及抽帧流程、光标十二坑、隐私脱敏、验收清单。已在独立目录照文档逐字复制验证可跑通。

- **Windows 启动脚本**：`scripts/start-windows.cmd`（前台 / `/background`）与
  `scripts/stop-windows.cmd`。脚本固定 `%AI_LEDGER_HOME%\ai-ledger.toml` 与 8765 端口，
  不接受参数覆盖配置——部署实例和开发实例必须分端口，否则会误连测试库。
- **Windows 开机自启**：登录时由「启动」文件夹的 `ai-ledger.lnk` 拉起。
  `Register-ScheduledTask` 在普通用户下报 `Access is denied`，故不用计划任务。
- **Linux 一键部署**：`scripts/install.sh` 一条命令装完（系统依赖、独立 Python 3.11、
  服务账号、systemd、自检、打印初始密码），不碰系统自带 Python。
  用 uv 装预编译 Python，避免小内存机器编译 OOM。
- **合成账单生成器**：`scripts/make-demo-bills.py` 生成结构与真实导出一致的
  支付宝 CSV / 微信 XLSX，用于部署验证，不含任何真实数据。
- `docs/跨平台部署.md`：Linux / macOS 手动部署、nginx + TLS、systemd / launchd 自启。

### Fixed

- **`--config` 指定的配置文件在运行时被丢弃**：`_apply_config()` 只取了里面的数据库路径，
  路径本身没保存，之后 HTTP 处理与子命令里的无参 `load_config()` 重新做目录发现，
  在配置文件名不是 `myledger.toml` 的部署上读到内置默认值。表现为设置页保存邮箱
  报「缺少主密钥」，而配置文件里其实已经有 `[mail].secret_key`；
  同一个原因还让 `[mail].mailbox_dir`、`[backup]`、`[admin]`、`[import].account_map`
  在部署实例上全部失效。现在 `--config` 一旦给出就固化为进程级配置
  （`config.set_config_path()`），不再退回目录发现；缺主密钥的提示直接给出实际配置文件路径。
- **设置页保存邮箱会把授权码抹掉**：前端把占位符 `********` 改成空串再提交，
  后端约定空串表示「清空」。只改邮箱账号就会删掉已保存的授权码。现在原样回传。

- **链接型邮件下载永远 501「点下载没反应」**：`Handler` 用 HTTP/1.1 keep-alive，
  但 `POST /api/mail-fetch` 从不读请求体，残留的 `{}` 变成了下一条请求的请求行
  （服务端日志里是 `"{}POST /api/mail-download HTTP/1.1" 501`）。
  浏览器复用连接，于是「从邮箱收取附件」扫出的链接一个都下载不下来。
  现在所有 POST 在分发前统一读完请求体并缓存，`parse_request()` 每个请求清零，
  `/api/import-upload` 的早退分支显式断开连接。
- **下载失败没有任何提示**：前端 `await fetch(...)` 不看返回值，失败被静默吞掉，
  状态栏仍显示「发现 1 个下载链接」，看起来像成功了。现在逐个检查响应，
  把失败原因与建议拼进状态栏并标红（`.error-text`）。
- **下载失败后邮件仍是已读，下次再也扫不到**：收取阶段解析出下载链接就标已读，
  下载失败却没有回滚。新增 `mailbox.unmark_seen()`，失败时用 `UID STORE -FLAGS \Seen`
  撤回到未读；撤回失败会在提示里要求用户到邮箱网页端手动处理。
- **IMAP 用序列号而非 UID**：`search` / `fetch` / `store` 都走非 UID 命令，
  序列号只在本会话内有效，跨连接回滚未读会改错邮件。统一改成
  `UID SEARCH` / `UID FETCH` / `UID STORE`。
- **`handle_mail_download` 定义了两遍**：后一个覆盖前一个，且只允许管理员，
  普通用户点了会被 403。删掉死代码，保留按当前用户 inbox 目录保存的版本。

- **启动脚本加重复检测**：8765 已被占用时 `start-windows.cmd` 直接退出并提示
  `already running on 8765`，不再起第二个实例（第二个绑不上端口，只留下孤儿进程）。

- **生产部署改用 editable 安装**：此前生产 venv 里装的是源码的普通副本，
  每次改代码都要 `pip install --force-reinstall`，而该命令会先删除
  `site-packages/app/` 再复制，中途失败会让服务直接挂掉
  （`ModuleNotFoundError: No module named 'app.bookkeeping'`）。
  现改为 `pip install -e`，`app` 直接指向源码目录，重启即生效。
- **venv 里的重名包**：`ai-ledger`（旧名）与 `myledger`（`pyproject.toml` 里的现名）
  同时装着、都提供 `app/`，谁被导入取决于 `sys.path` 顺序。
  旧包已卸载，只留 `myledger`。

- **打包成单文件后导入账单必失败**：`app/importers.py` 用
  `spec_from_file_location` 按路径加载 `bookkeeping.py` 等上游脚本，
  而 PyInstaller 把源码编译进归档、磁盘上并没有这些 `.py`。
  结果是 `/api/import-upload` 一律 400：
  `No such file or directory: '_MEI.../app/bookkeeping.py'`。
  改为：源文件存在才按路径加载，否则走包内常规 import；
  同时补上 `app.bookkeeping` / `app.import_bill` 的 hiddenimports。

- **Linux 产物在旧发行版上起不来**：CI 的 `ubuntu-latest` 已是 24.04（glibc 2.39），
  打出的包在 Ubuntu 22.04（glibc 2.35）上直接
  `libm.so.6: version 'GLIBC_2.38' not found`。改用 `ubuntu-22.04` 构建
  （老 glibc 构建的包向上兼容），并加了一步校验：解包后检查内嵌动态库的
  GLIBC 需求不超过 2.35，超了就 fail，避免再次发布坏包。
  注意 `objdump` 只看主程序会漏判——PyInstaller 把 libpython 内嵌在归档里。

- **`--help` 在非 UTF-8 控制台上崩溃**：Windows 控制台默认 cp1252/cp936，
  帮助文本全是中文，`myledger --help` 直接 `UnicodeEncodeError`。
  入口统一把 stdout/stderr 重配置为 UTF-8（带 errors="replace" 兜底）。
  CI 的 Windows runner 就是这么挂掉的。

- **上传会吃掉文件末尾的换行**：`parse_multipart` 用 `strip(b"\r\n")` 剥协议分隔符，
  连文件自身的结尾字节一起剥掉。GB18030 的 CSV 少一个字节就整份解码失败，
  二进制文件同样可能损坏。改为只剥协议自带的那一个 CRLF。
- **配置文件路径不可读时启动崩溃**：以服务账号运行、当前目录是 `/root` 时，
  `load_config` 对候选路径调 `is_file()` 抛 `PermissionError`，整条启动链路失败。
  现在跳过够不到的候选，退回默认值。
- **POST 异常只回一句话**：`do_POST` 的外层 `except` 把任何异常压成
  `{"error": str(exc)}`，不写日志，线上排查全靠猜。现在同时打印堆栈。

- **部署后出现「新页面 + 旧脚本」**：service worker 把静态资源当缓存优先，
  而且预缓存列表里写死了旧版本号（`?v=20261106-auth`），
  导致升级后环形图、流水等由 JS 渲染的区域一直是空的。
  现在静态资源改为网络优先、失败才回落缓存，缓存名升到 `myledger-v2`，
  预缓存只保留不带版本号的稳定地址；新 SW 接管后页面自动刷新一次。
- **左侧月份只列有支出的月份**（外加当前正在看的月份），
  不再摆一排「—」。库里只有一个月数据时，剩下五个月点进去只会是空页面。
- 空区间的环形图中心显示「—」而不是 `0.00`，
  图例写明「这段区间没有支出记录」，避免被当成加载失败。
- **整页无法滚动**：`.app` 用 `height:100dvh` + `overflow:hidden` 锁死了视口，
  但 `.main` 是 flex 子项且默认 `min-height:auto`，被内容撑到 3113px，
  下游 `.content` 拿不到可滚动空间，账单页下半截既看不到也滚不到。
  给 `.main` 与 `.content` 补 `min-height:0` 后恢复。
- **环形图补回悬停提示**：重写时把 canvas 版的 `bindPieHover` 一并删了，
  换成 CSS 环形图后没有补，鼠标放上去看不到分类名、占比、金额。
  现在按指针角度反算扇区，气泡显示「分类 / 占比 / 金额」，对应图例行同步高亮；
  图例行悬停也会反向点亮扇区。触控下点一下同样出提示。

### Changed

- **首页改为「连续流水 + 汇总面板」**：去掉四宫格 KPI、趋势折线图和两张分类饼图。
  账目按日分组连续排布，跨月处插入当月合计；右侧常驻本期结余、收支笔数、支出结构
  与待确认入口。顶部可切换「仅流水 / 流水 + 汇总」，收起面板时流水区自动变宽，不重排、不丢滚动位置。
- **左侧装订脊同时是月份导航与 6 个月趋势**：每月一行，行背景的宽度就是该月支出，
  点击直接跳到那个月；没有数据的月份显示「—」，不画零高度条。
- **中性交易在流水里单独标注**：金额不带正负号，副标题写「不计收支」，
  避免被读成收入。
- 分类占比保留大类/小类切换，改用一张环形图加图例（百分比与金额同列），
  不再画引线标签。
- 移除收入分类占比环形图：收入笔数很少时它几乎不传递信息，需要时可在「账单」按类型筛选。

### Fixed

- `migrate_category_only_unconfirmed` 把 `unconfirmed_entries` 搬到 `entries` 时
  没有带上 `owner_id`，迁移后的记录变成无主（`owner_id=0`），用户看不到。

- **修复微信账单下载链接被丢弃**：微信邮件的真实下载域名是
  `tenpay.wechatpay.cn`（`.cn` 而非 `.com`），之前白名单收窄时只留了
  `wx.tenpay.com` / `tenpay.com`，导致微信账单邮件命中关键词却既无附件也无链接，
  静默丢弃。现在补上 `tenpay.wechatpay.cn` / `wechatpay.cn`，
  并加测试覆盖仿冒域名 `evil-wechatpay.cn.attacker.com` 被拒。
- **「跳过」不再静默无反应**：`skipPending` 在只剩一条时直接 `return`，
  用户点按钮看不到任何变化。现在会提示「这是最后一条待确认」；
  多条时提示「已跳过，当前还有 N 条」。提示显示在卡片正上方，不必去顶部工具栏找。
- **待确认卡片确认不再卡顿**：原先每次确认都调 `refresh()`，串行打 9 个接口
  （经隧道每个约 1s）并重渲染账单、分类规则、账户下拉。现在先本地移除卡片立即重渲染，
  再只请求 `summary` + `unconfirmed` 两个接口。确认响应从约 2s 降到毫秒级。
- **修复 `add_rule` 缺 `owner_id` 参数**：SQL 里引用了该变量但函数签名没有，
  调用即 `TypeError`，导致手动加分类关键词、以及「学到的规则」全部不可用。
  同时补齐三处调用点（`auto_learn`、`confirm_entry`、`confirm_unconfirmed`）的 owner 传递。
- **修复导入数据归属**：`upload.import_upload` 与 `bookkeeping.import_file` 之前不接收 `owner_id`，
  所有条目落到 `owner_id=0`，用户登录后在界面上看不到自己导入的数据。现在按当前登录用户归属。
- **导入结果新增 `deduped`**：同一份账单重复导入时全部被去重，但返回里没有该字段，
  前端只显示「新增 0 笔」，看起来像失败。现在会明确提示「重复跳过 N 笔」。
- **去重不再跨用户**：`dedupe_imported_entries_by_time` 的候选查询没有按 `owner_id` 过滤，
  别人的同金额记录会把当前用户的导入误删；现已按用户隔离。
- 伪装成 `.zip` 的追踪像素（如 1x1 GIF）不再落盘：附件按文件头 `PK` 校验，不是真 zip 就跳过并记入 skipped。
- 正文里的埋点链接（如支付宝 `kcart.alipay.com/web/bi.do`）不再被当成账单下载链接：
  白名单收窄到真正提供账单文件的域名，并排除 `/bi.do` `/analytics` `/track` 等埋点路径。
- 链接下载的内容同样按文件头校验，不是 zip 就报错而不是写成 `.zip`。
- 待导入列表的密码栏默认收起（此前 CSS 的 `display:flex` 覆盖了 `.hidden`，导致全部展开）。
- 邮件不再因主题关键词不匹配而整体跳过：只要带真 zip 附件或白名单下载链接就收，关键词只用于统计「像账单」的封数。

- 邮件扫描范围可配：默认只扫**最近 7 天**的未读邮件（`[mail].scan_days`），不再把几百封历史未读全翻一遍。
- 待导入压缩包支持**行内导入**：点「导入」展开密码栏，填密码后直接入库，成功后自动删除该压缩包。
- 待导入压缩包支持**删除**：每行带删除按钮，带二次确认；服务端拒绝路径穿越与绝对路径。
- 分类规则支持**两级折叠**：整块「分类规则」默认收起；展开后按一级类目分组，每组也可折叠。状态记在 localStorage。

### Fixed

- 待导入列表为空时未清空旧 DOM，删除后仍显示上一次的内容。

- **邮箱收账单附件**：IMAP 拉未读邮件，两种形态都支持——zip 附件直接落盘；微信这类「点击下载」链接按域名白名单识别并下载。
- **每用户独立邮箱**：凭据存在 `users` 表，每人配自己的；授权码用 AES-GCM 加密，主密钥在 `myledger.toml` 的 `[mail].secret_key`。
- 附件目录按用户隔离：`data/mail-inbox/<user_id>/`。
- 设置页新增「邮箱收取」区块；导入页只有「从邮箱收取附件」按钮和待导入压缩包列表。
- 新增 18 个测试：附件型 6、链接型 5、凭据 7。

### Fixed

- `dashboard.js` 重复声明 `initImportView` / `pendingZipFile` 导致整份脚本解析失败（表现为所有按钮失灵）。已用 `node --check` 纳入验证。

- **自动备份**：服务启动即备份一次，之后每 60 分钟一次；用 `sqlite3.Backup` 在线复制，保留最近 14 份并校验可读。命令 `myledger backup` 可手动触发。
- **空态引导**：没有账目时，总览页显示三步导入指引与「去导入账单」按钮。
- 备份配置 `[backup]`：`enabled` / `directory` / `keep` / `interval_minutes`。
- 测试 6 个：备份一致性、保留策略、缺库与坏库处理。

### Fixed

- `delete_keyword_rule` 补归属校验，越权删除不再可能。
- `correct_balance` 按 `owner_id` 隔离账户与写回，避免跨用户改余额。
- `/api/keyword-rule-delete`、`/api/correct-balance` 路由传 `scope`。

- **多用户与鉴权**：`users` / `sessions` / `login_failures` 三表；密码用标准库 `scrypt` 加盐哈希；会话 30 天滑动续期，token 只存 SHA-256；登录失败按「用户名 + 来源」限流（5 次 / 15 分钟）。
- **按人隔离**：`entries` / `accounts` / `merchant_category_rules` 增加 `owner_id`；所有查询按 `Scope` 过滤；管理员可切换「全部账本」。
- **越权防护**：`update_entry` / `delete_entry` 的归属条件写进 `WHERE`，越权表现为「记录不存在」，不泄漏存在性。
- **用户管理**：管理员可建号、重置密码、启用禁用、改角色、删除；硬规则保护「不能动自己、不能动最后一个管理员」。
- **登录页与账号设置**：`/login`、修改自己密码、退出登录。
- **PWA**：`manifest.json` + `service-worker.js` + 192/512 图标；静态资源缓存，API 一律走网络。
- **移动端布局**：`<=768px` 时侧栏变底部导航、账单表格变卡片、触控区 44px、KPI 两列。
- **首启动引导**：库里没有用户时创建 `admin`，初始密码打印到日志；也可在配置 `[admin]` 段固定。
- 公网部署链路：Cloudflare Tunnel（`myledger` 隧道）→ `<你的域名>`，服务器不开放入站端口，HTTPS 由 Cloudflare 提供。
- 新增测试 44 个：鉴权 18、用户管理 11、HTTP 隔离 15。

### Changed

- **配置改为 TOML 文件**，不再读取任何环境变量；新增 `[admin]` 段。
- 数据库路径、模型端点、账户映射、初始管理员全部来自 `myledger.toml`。
- 迁移逻辑：旧表数据补 `owner_id = 0`，避免 `NOT NULL` 导致启动失败。

- **压缩包导入**：直接上传微信导出的加密 `.zip`。四类错误分开提示：需要密码、密码错误、包内多个账单、包内没有账单。
- 解压在内存完成，不落盘；单文件解压上限 60 MB。
- 9 个压缩包测试：AES 加密、错密码、多账单、非账单文件、端到端导入。
- 界面：选到 zip 时弹出密码框，密码错误可原地重试（不丢已选文件）。

- 端口占用检测：第二个 `myledger` 实例会明确提示「已被占用」并给出换端口的方法，而不是静默抢端口（Windows 的 SO_REUSEADDR 会让两个实例都"启动成功"，请求被内核分流，表现为空响应）。
- 中性交易可直接确认：`不计收支`/`转账` 无需分类即可确认；其他类型缺分类时提示「请先选择分类；若该笔无需分类，请点「跳过」」，不再静默无反应。
- 回归测试 `tests/test_confirm.py`：中性交易无分类可确认、支出无分类仍被拒绝。

- **可安装的包**：`pyproject.toml` 声明 `myledger` 控制台入口与 `openpyxl` 依赖；`pip install` 后可在任意目录运行。
- `app/__init__.py` 让 `app` 成为真正的包（此前是命名空间包）。
- **文件配置**：`app/config.py` 只从 TOML 读取（`--config` → 当前目录 → `~/.config/myledger/` → 默认值），不再读任何环境变量。
- `docs/部署说明.md`：安装、配置字段表、运行与已知限制。
- 测试新增 9 个：配置 5 个（含「环境变量被忽略」）、安装验收 4 个。

- **网页上传导入**：`POST /api/import-upload` + 侧栏「导入」页；拖拽/选择文件即可完成解析与入库，返回来源、笔数、新增/待确认/跳过与按类型合计。
- `app/upload.py`：按文件内容识别微信/支付宝，临时标准 CSV 导入后即删。
- `app/multipart.py`：Python 3.13 移除 `cgi` 后的最小 multipart 实现。
- 上传相关测试 5 个：来源识别、未知格式提示、空文件拒绝、金额分、multipart 解析。

- 产品规格 `docs/specs/产品规格-我的账本工具.md`：问题陈述、35 条用户故事、实现决策、测试决策、范围外、已知偏差。
- 项目骨架与文档规范：根 `README.md`、`AGENTS.md`、`INDEX.md`、每目录 `README.md`。
- 文档门禁 `npm run doc:check`：检查目录 README、frontmatter、本地链接、索引引用。
- 调研报告 `docs/research/我的账本工具-横纵分析报告.md` 与 PDF（32 页）：横纵分析法；含 5 张 mermaid 架构图与 6 张 ego 浏览器取证截图。
- 应用 `app/`：fork 自 `bingchuH/Bookkeeping`（MIT），含微信/支付宝解析、幂等入库、去重候选、关键词规则、待确认队列与本地 Dashboard。
- 本地 1B 兜底分类 `app/classify.py` 与入口 `python -m app classify-pending`；模型不可用时返回码 2 并打印降级原因。
- 统一入口 `python -m app`：默认起 Dashboard，另有 `init` 与 `classify-pending` 子命令。
- 测试 13 个：解析器（GB18030、表头识别、中性交易、金额分）与分类器（枚举校验、置信度、JSON 容错、不可达降级）。
- 使用说明 `docs/使用说明.md`：初始化、转换、导入、补类目、看板与已知偏差。
- ADR `docs/adr/2026-11-05-改用Python并fork-Bookkeeping.md`：记录改栈证据与后果。

### Changed

- 配置方式由环境变量改为配置文件：`BOOKKEEPING_DB_PATH`、`AI_LEDGER_MODEL_ENDPOINT`、`AI_LEDGER_MODEL_NAME`、`AI_LEDGER_ACCOUNT_MAP` 全部移除，改由 `myledger.toml` 提供。

- 真实账单从 `docs/` 迁至 `data/inbox/`，并加入 `.gitignore`。
- **技术栈由 Node/TS 改为 Python**（推翻 ADR `2026-11-05-技术栈与运行边界` 中的框架与存储选择），理由见新 ADR。
- `app/bookkeeping.py` 相对上游的差异：新增 `不计收支` 类型、静态资源/配置路径兼容 `app/` 布局、`read_wechat_xlsx()` 接受 bytes。
- 中性交易从「丢弃」改为「保留入库但不计入收支合计」：真实账单验证下微信 11 笔、支付宝 17 笔全部保留。

### Removed

- `src/`、`web/`、`tests/` 下的 Node/TS 脚手架与 `scripts/prepare-pdf.mjs` 之外的 Node 侧占位文件。
