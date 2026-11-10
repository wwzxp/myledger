---
description: 导入页的功能演示：640×400 舞台 + 可复用积木 + 每个功能一条 GSAP 时间线
kind: module
---

# demo/

## 职责

- 在导入页给出「怎么导出账单」与「导入后发生什么」两段自动播放的程序化演示。
- 不是视频/GIF：界面用 DOM 现场搭，动画由 GSAP 时间线驱动。

## 不负责

- 真实的导入逻辑（在 `dashboard.js` 与 `app/upload.py`）。
- 主界面样式（在 `../dashboard.css`）。本目录的类名统一以 `d-` 前缀隔离。

## 对外接口

| 文件 | 职责 |
|---|---|
| `panel.js` | `createDemoPanel(root, { gsap, onClose })`：左侧清单 + 右侧舞台 + 关闭 |
| `stage.js` | 640×400 缩放、自动播放、切场、暂停、`seek(t)` |
| `kit.js` | UI 积木：手机壳、行、页面、光标、印章、步骤、数字卡 |
| `catalog.js` | 功能清单与步骤文案（改版时只改这里） |
| `scenes/` | 每个功能一个场景脚本 |
| `demo.css` | 暗色 HUD、扫描光、光标、网格 |
| `gsap.min.js` | 内置 GSAP 3.12.5（非 MIT，见 `THIRD_PARTY_LICENSES-GSAP.txt`） |

入口在 `../index.html` 的导入页：「不知道怎么导？看演示」按钮，按需动态加载。

## 依赖

- `window.gsap`：由入口在打开演示前用 `<script>` 注入，不引 CDN。
- 无构建步骤，纯 ESM 模块。

## 已知限制

- **GSAP 里不要把 timeline 嵌进 timeline**：paused 的 child 被 `add` 到父级后
  不会跟随播放，动画停在起始态。所有补间必须直接挂在传入的 `tl` 上，
  积木的 `in(tl, at)` / `result(tl, text, at)` 等接口都按这个约定设计。
- 舞台按 640×400 写死坐标，靠 `transform: scale()` 适配容器；
  读坐标要用 `getBoundingClientRect` 再除以缩放比。
- 演示是 `aria-hidden` 的示意内容，`pointer-events: none`，
  不参与真实交互。
