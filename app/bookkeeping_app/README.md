---
description: Dashboard 的静态资源容器（HTML/CSS/JS），来自上游 Bookkeeping
kind: module
---

# app/bookkeeping_app/

## 职责

- 存放 Dashboard 的前端资源：`static/index.html`、`static/dashboard.css`、`static/dashboard.js`。
- 由 `app/bookkeeping.py` 的 `Handler` 直接托管，无构建步骤。
- 首页的结构写在 `index.html` 里：左侧装订脊（月份 + 导航）、中间连续流水、右侧汇总面板；
  三块分别由 `dashboard.js` 的 `renderSpine` / `renderFlow` / `renderPanel` 填充，
  数据统一来自 `aggregateRange()` 对 `/api/entries-all` 的本地聚合。

## 不负责

- 任何统计计算（数据来自 `/api/*`）。
- 路由与业务逻辑（在 `bookkeeping.py`）。

## 对外接口

- 浏览器访问 `/` 返回 `static/index.html`，`/static/<file>` 返回对应资源。

## 依赖

- 纯静态文件；不引用 CDN、远程字体或第三方脚本。

## 已知限制

- 视觉层已按本项目规范重写，但类名由 `dashboard.js` 直接拼装 HTML，改样式时必须同步改 JS 里的类名。
- 分类色阶用 `--b1`～`--b5` 五个 token；新增分类超过图例上限（5 项）时合并为「其他 N 项」。
- 窄屏（≤860px）下汇总面板移到流水上方，装订脊变成底部导航；月份列表在该断点隐藏。
