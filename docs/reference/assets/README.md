---
description: 演示动画的可执行验收脚本，把「界面细节不能偷懒」变成机器判定的失败
kind: tooling
---

# docs/reference/assets/

## 职责

- 存放 `演示动画制作说明.md` 里引用的**可执行脚本**。
- `verify.js`：断言式验收。读屏清单 JSON，逐项检查文案、图标数量、副标题数量、
  页面叠加、光标位置、JS 错误，任一项失败退出码 1。

## 不负责

- 不生成演示代码（骨架在说明文档里，直接复制）。
- 不判断视觉好坏（颜色、间距、图标形状像不像，只能人眼比对截图）。

## 对外接口

### `frame-crop.py`：切图 + 数结构

不做 OCR。把录屏帧切成能看清的小图，交给视觉模型读文字。

```bash
python frame-crop.py 基准帧.png --outdir crops/ --scale 3
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--outdir` | `crops` | 切出的图放哪 |
| `--scale` | `5` | 放大倍数。320px 宽的手机截图里汉字只有 8–13px，3 倍仍是模糊块 |
| | | 字明显更大的帧可以降为 3 省时间 |

**脚本负责数**（像素分析，有确定答案）：卡片数、行数、箭头数、图标颜色。
**视觉模型负责认**（read 裁图）：文字、图标形状、颜色深浅。

产出：

| 文件 | 内容 |
|---|---|
| `rowNN.png` | 每行一张，放大 5 倍 |
| `groupNN.png` | 每 3 行合成一张，读图次数从 10 降到 4 |
| `summary.json` | 卡片/行/箭头/颜色的结构化数据 |
| `index.md` | 给视觉模型看的清单 |

**合成图最多 3 行**：再多，渲染时每行会被缩回原尺寸，放大就白做了。

实测：10 行的帧，3 秒切完。同等工作量靠 AI 逐帧读图要 24 分钟。

### `verify.js`：断言验收

```bash
# 方式一：自动阈值（推荐）。读 frame-crop.py 的 summary.json
node verify.js \
  --url http://127.0.0.1:8899/index.html \
  --from-scan crops/summary.json \
  --report-only           # 开发中只看差异；定稿时去掉

# 方式二：手写 screens.json（需要精确控制文案与选择器时）
node verify.js \
  --url http://127.0.0.1:8899/index.html \
  --spec ./screens.json \
  --scene 场景key \
  --seconds 8
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--url` | `http://127.0.0.1:8899/index.html` | 演示页地址 |
| `--spec` | `./screens.json` | 屏清单，缺省时只跑基础三项 |
| `--from-scan` | 无 | 读 `frame-crop.py` 的 `summary.json`，自动推导阈值 |
| `--report-only` | 关 | 只报差异不判失败，退出码恒为 0 |
| `--scene` | 无 | 有左侧清单时，先点这项再验 |
| `--seconds` | `20` | 逐秒采样时长 |
| `--chrome` | Chrome 默认路径 | 浏览器可执行文件 |
| `--puppeteer` | 本机 puppeteer-core | 用于 `import` |

退出码：`0` 全部通过，`1` 有失败项。

## 依赖

- Node 18+（用 ESM 顶层 await）。
- `puppeteer-core` 与本机 Chrome。不依赖 `puppeteer` 完整包（不下载浏览器）。

## 内置的通用度量

只用几何尺寸与计算样式判断，**不依赖任何类名**，换项目不用改脚本：

| 指标 | 判据 | 查什么 |
|---|---|---|
| `iconLike` | 16–64px 且有非透明背景色 | 有没有图标 |
| `mutedText` | 字号 ≤12px 的文字叶子 | 有没有副标题 |
| `chevrons` | 文字为 `›` `>` `»` `→` | 有没有右侧箭头 |
| `clickables` | button / role=button / cursor:pointer | 有几处可点 |
| `dividersH` | 高 ≤2px 且宽 >100px | 有没有分隔线 |
| `rails` | 宽 ≤6px 且高 >20px 且有底色 | 有没有左侧竖条 |
| `colored` | 背景饱和度 >0.25 | 有几个彩色元素 |
| `rows` | 按 y 聚类文字 | 一共几行 |

**阈值由 `screens.json` 给，脚本只负责数。**

## 项目自定义

| 字段 | 用法 |
|---|---|
| `minStats` | 对内置度量设下限 |
| `minCount` | CSS 选择器精确计数，如 `{ ".row": 5 }` |
| `assert` | JS 表达式数组，每条必须为真 |

## 已知限制

- **只能判定「有没有」，判定不了「像不像」**。颜色偏差、间距不对、图标形状不同，脚本查不出来。
- `iconLike` 的判据是「16–64px 且有非透明背景色的元素」，圆形纯色徽标也会计入，
  不完全等于「图标」。必要时用 `minCount` 指定精确选择器。
- `rows` 按 y 坐标聚类，同一行里的多段文字（图标旁的副标题）会被算成一行，
  但如果两段文字垂直错开超过 8px，会被多算一行。
- 所有度量都基于**可见元素**（宽高 >0、visibility 非 hidden、opacity 非 0）。
  用 `opacity: 0` 隐藏的页会被当成可见，必须用 `display: none`。
- 页面识别依赖「绝对定位 + 与父级同尺寸」的特征。若你的页容器不是这个结构，需要改 `sample()`。
- 只在 Chromium 下验证过，未测 Firefox / Safari。
- `frame-crop.py` 的卡片/行检测依赖固定阈值（灰底 228–242、白底 >250）。
  换配色差异大的截图时需要调这几个数。
- 切图只适合**列表型界面**（行结构清晰）。对于自由布局（图表、卡片流），
  阶梯式切行可能切错，此时整帧读加人工判断更可靠。

## frame-crop.py --emit-spec

直接从基准帧生成 `screens.json` 骨架，阈值来自实测而不是猜：

```bash
python frame-crop.py frame.png --outdir crops --emit-spec screens.json
```

生成后要手填三处：`name`、`expectText`、`mustContain`。

`minStats` 的规则：

| 情况 | 行为 |
|---|---|
| 识别出白卡结构 | 用像素行数 ×0.6 作为下限 |
| 未识别出卡片（表单页等） | **省略 `minStats`**，`_comment` 标「低置信」 |

**为什么 ×0.6**：`frame-crop.py` 的 `rows` 数的是暗区文字块，
`verify.js` 的 `minStats.rows` 数的是渲染后的行元素，两者口径不同，实测比值约 1.5–2.5。

## verify.js 的 scope 解析

屏检测、`minCount`、自定义断言三处共用 `window.__resolveScope()`：

1. 找 `.stage-screen` 下「绝对定位 + 与父容器同尺寸」的层
2. 其中取**文字最多**的（遮罩层也满足几何条件，但没文字）
3. 全都没文字 → 退回「排除 scrim/mask/overlay 后文字最多的后代」

**别在别处另写一份**：实测因为 `minCount` 用了旧逻辑，
屏找到了但计数全是 0，排查了很久。

## 移植到另一个项目：要拷什么

**核心三件**，缺一不可：

| 文件 | 大小 | 作用 |
|---|---|---|
| `演示动画制作说明.md`（在上级目录） | 约 3000 行 | 方法论 + 骨架代码 + 全部实测坑 |
| `frame-crop.py` | 13 KB | 切图 + 数结构 |
| `verify.js` | 22 KB | 断言式验收 |

**外加两样运行时依赖**（不是本仓库的文件）：

| 依赖 | 怎么拿 | 放哪 |
|---|---|---|
| `gsap.min.js` | GSAP 3 官方发行版 | 必须和你的 `index.html` **同目录** |
| `puppeteer-core` | `npm i puppeteer-core` 或全局装一份 | 用 `--puppeteer <绝对路径>` 指过去 |

**没有 puppeteer 也能跑**：`verify.js` 会依次尝试
`--puppeteer` 参数 → `PUPPETEER_CORE` 环境变量 → 当前目录的 `node_modules/puppeteer-core`。
都没有就报错退出。

**Chrome 也不用装 puppeteer 自带的那份**：`findChrome()` 会探测
`C:/Program Files/Google/Chrome/Application/chrome.exe` 等常见位置。

### 最小可跑目录

```text
your-demo/
├── demo/
│   ├── index.html          ← 引用下面的 gsap.min.js
│   ├── gsap.min.js         ← 必须同级
│   ├── stage.js            ← 从文档 §3.2 复制
│   ├── kit.js              ← 从文档 §3.3 复制
│   ├── demo.css            ← 从文档 §3.4 复制
│   └── scenes/
│       ├── index.js
│       └── your-scene.js
├── screens.json            ← frame-crop.py --emit-spec 生成
├── frame-crop.py
└── verify.js
```

### 三个文件都不依赖本仓库

`frame-crop.py` 只依赖 `numpy` + `PIL`；
`verify.js` 只依赖 `node` + 一个 puppeteer 实例；
文档是纯 Markdown，图片和骨架代码全在正文里。

**不需要拷贝的**：本仓库的 `app/`、`tests/`、`docs/reference/demo/` 等。

### 拷过去之后先验证环境

```bash
python frame-crop.py 你的基准帧.png --outdir crops   # 能不能切
node verify.js --url http://127.0.0.1:8899/demo/index.html --seconds 2  # 能不能连上
```

两条都通过再开始做场景，否则后面所有报错都分不清是环境问题还是实现问题。
