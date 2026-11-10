---
description: Dashboard 静态资源：单页 HTML、样式与图表脚本
kind: module
---

# app/bookkeeping_app/static/

## 职责

- `index.html`：Dashboard 单页结构。
- `dashboard.css`：样式。
- `dashboard.js`：取 `/api/*` 并渲染图表与列表。

## 不负责

- 数据计算与持久化。
- 鉴权（应用仅监听回环地址）。

## 对外接口

- 通过 HTTP 路径 `/static/*` 对外提供。

## 依赖

- 浏览器原生 API；无打包器、无外部依赖。

## 已知限制

- 图表与表格渲染逻辑集中在单个 JS 文件里，改一处需回归整个看板。
