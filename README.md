# myledger · 我的账本

把微信、支付宝导出的账单文件变成可信的月度结论。数据留在你自己的机器上。

它不是又一个记账 App，而是**账单分析的最后一公里**：你已经有账单，缺的是结论。

```
导出账单 → 拖进浏览器 → 自动解析入库 → 规则分类 → 月度看板
```

## 它解决什么

导出一份账单，你会得到一个几百行的表格。想知道「这个月到底花了多少、花在哪」，还得自己透视、分类、剔除转账。

myledger 把这一步做掉，并处理几件容易被算错的事：

| 问题 | 处理 |
|---|---|
| 提现、充值、理财赎回混在流水里 | 标记为**中性交易**，保留入库可审计，但不计入收支合计 |
| 微信、支付宝字段不同、编码不同 | 微信 XLSX、支付宝 GB18030 CSV，统一归一化 |
| 同一笔重复导入 | 按「时间 ±2 秒 + 金额 + 账户」去重 |
| 分类靠猜 | 规则优先；规则未命中的进待确认队列，人工确认后沉淀为规则 |
| 数据敏感 | 只落本机 SQLite，不发任何外部请求 |

## 支持的账单来源

| 来源 | 格式 | 说明 |
|---|---|---|
| 微信支付 | `.xlsx` | 含加密 `.zip`（微信下发的密码解包） |
| 支付宝 | `.csv` | GB18030 / UTF-8 |
| 美团 | `.csv` | |
| 抖音支付 | `.pdf` | |

## 快速开始

### 方式一：下载可执行文件（不需要安装 Python）

从 [最新构建](https://github.com/wwzxp/myledger/actions) 的 Artifacts 下载对应平台：

| 平台 | 文件 |
|---|---|
| Windows x86_64 | `myledger-windows-x86_64.exe` |
| Linux x86_64 | `myledger-linux-x86_64` |
| macOS Apple Silicon | `myledger-macos-arm64` |

```sh
# Linux / macOS
chmod +x myledger-linux-x86_64
./myledger-linux-x86_64
```

然后打开 `http://127.0.0.1:8765`。

> macOS 未签名，首次打开可能被 Gatekeeper 拦：右键 → 打开，
> 或 `xattr -d com.apple.quarantine myledger`。
> Intel Mac 暂无预编译包，请用源码方式。

### 方式二：从源码运行

需要 Python 3.10+。

```sh
git clone https://github.com/wwzxp/myledger.git
cd myledger
pip install .
myledger
```

首次启动会在日志打印管理员初始密码。

## 界面

三块结构，不是仪表盘式的四宫格：

- **左侧装订脊**：账本名、最近几个月（每行背景宽度就是该月支出，点击跳转）、功能入口
- **中间流水**：按日分组连续排布，跨月处插入当月合计
- **右侧汇总**：本期结余、收支笔数、支出结构环形图、待确认入口

顶部可在「仅流水 / 流水 + 汇总」之间切换。窄屏下汇总移到上方，装订脊变成底部导航。

## 部署到服务器

```sh
sudo bash scripts/install.sh
```

自动完成：系统依赖、独立 Python（不碰系统自带版本）、服务账号、数据目录（700 权限）、
systemd 服务、自检、打印访问地址与初始密码。

详见 [docs/跨平台部署.md](docs/跨平台部署.md)，包含 nginx + TLS 与开机自启配置。

> 公网暴露前请务必配 TLS。应用自身不处理 HTTPS，明文下密码与会话 token 会裸传。

## 数据与隐私

- 账单只写入本机 SQLite，路径由 `myledger.toml` 决定。
- 不引入远程字体、CDN、统计脚本或任何第三方上报。
- 分类完全靠本地规则库，不调用任何模型或外部服务。规则未命中的条目进入待确认队列，
  人工确认后可沉淀为规则，越用越准。
- 数据库、备份、邮件附件目录默认 `0700`，只有服务账号可读。
- 仓库内不含任何真实账单；测试用 `scripts/make-demo-bills.py` 生成合成数据。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/使用说明.md](docs/使用说明.md) | 完整操作流程 |
| [docs/跨平台部署.md](docs/跨平台部署.md) | 三平台部署、TLS、自启 |
| [docs/architecture/架构.md](docs/architecture/架构.md) | 分层与数据流 |
| [docs/specs/产品规格-我的账本.md](docs/specs/产品规格-我的账本.md) | 产品规格与用户故事 |
| [docs/research/我的账本-横纵分析报告.md](docs/research/我的账本-横纵分析报告.md) | 同类项目横纵对比 |
| [INDEX.md](INDEX.md) | 目录与文件索引 |
| [CHANGELOG.md](CHANGELOG.md) | 变更记录 |

## 命令

```sh
myledger                              # 启动 Web（默认 127.0.0.1:8765）
myledger --config path/to.toml        # 指定配置文件
myledger init                         # 初始化数据库
myledger backup                       # 立即备份一次
myledger dashboard --host 0.0.0.0 --port 8080   # 改监听地址（公网请配 TLS 反代）

npm run doc:check                     # 文档门禁
python -m unittest discover -s tests  # 单元测试
```

## 开发

```sh
pip install .
python scripts/make-demo-bills.py /tmp/demo    # 生成合成账单
python -m unittest discover -s tests           # 184 个测试
python scripts/build-binary.py                 # 打成单文件（不可交叉编译）
```

配置只从 TOML 文件读取，**不读环境变量**。查找顺序：
`--config` → 当前目录 `myledger.toml` → `~/.config/myledger/myledger.toml` → 内置默认值。

`--config` 给出后即成为本次进程的**固定配置**：之后的子命令与 HTTP 处理都用它，
不再退回目录发现。因此配置文件可以叫任意名字（部署脚本用的是 `ai-ledger.toml`）。

## 许可

MIT。

界面动画使用 [GSAP](https://gsap.com)（Standard No Charge License，非 MIT），
许可说明见 `THIRD_PARTY_LICENSES-GSAP.txt`。

`app/bookkeeping.py` 及部分解析逻辑 fork 自
[bingchuH/Bookkeeping](https://github.com/bingchuH/Bookkeeping)（MIT），
许可全文见 [THIRD_PARTY_LICENSES-Bookkeeping.txt](THIRD_PARTY_LICENSES-Bookkeeping.txt)。
