---
description: 功能演示的场景脚本，每个功能一条动画时间线
kind: module
---

# demo/scenes/

## 职责

- 每个场景导出一个函数，接收 `{ root, tl, reduced, item }`，把动画直接编进 `tl`。
- 场景只负责"怎么演"；文案来自 `../catalog.js`。

## 不负责

- 舞台缩放、自动播放、切场（在 `../stage.js`）。
- UI 积木与样式（在 `../kit.js` 与 `../demo.css`）。

## 对外接口

| 文件 | 场景 |
|---|---|
| `export-wechat.js` | 微信支付账单导出路径 |
| `export-alipay.js` | 支付宝交易流水证明开具 |
| `import-flow.js` | 拖入文件后的解析→去重→分类→看板 |
| `index.js` | `SCENES` 注册表，key 与 catalog 的 `item.key` 一致 |

## 依赖

- `../kit.js` 的积木；`window.gsap`（由页面在打开演示前加载）。

## 已知限制

- **不要创建子 timeline 再 `tl.add(child)`**：GSAP 里暂停的 child 嵌进父级后
  不会跟随播放，动画会停在起始态。所有补间必须直接挂在传入的 `tl` 上。
- 场景里的辅助函数 `el(tag, cls, parent)` 与 kit 的 `h()` 同名但独立，别混用。
