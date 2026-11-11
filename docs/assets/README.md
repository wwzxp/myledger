---
description: README 与文档引用的截图、演示动图
kind: docs
---

# docs/assets/

## 职责

- 存放**文档引用的静态图片**：README 看板截图、内置演示的动图。
- 只放已被某份文档引用的文件；没有引用就不在这里堆积。

## 不负责

- 应用运行时资源（图标、PWA 清单）——那些在 `app/bookkeeping_app/static/`。
- 演示本身的代码（场景脚本、样式）——那些在 `app/bookkeeping_app/static/demo/`。
- 切图产物与录屏原件（帧序列、mp4）——不入库。

## 对外接口

| 文件 | 被谁引用 | 说明 |
|---|---|---|
| `dashboard.png` | `README.md`「界面」 | 看板三栏结构 |
| `demo-export.gif` | `README.md`「内置演示」 | 微信账单导出流程（约 13 秒）|
| `demo-panel.png` | `README.md`「内置演示」 | 演示面板：六个可播放演示的目录 |

## 依赖

- 图片由本地实例 + 无头 Chrome 截图，再用 ffmpeg 压成 1600px 宽 / 动图调色板。

## 已知限制

- **截图与动图全部使用合成账单**（`scripts/make-demo-bills.py` 生成），
  不含任何真实姓名、商户、金额。换截图时必须保持这一条。
- 动图为 GIF（GitHub 不播放动画 WebP），体积控制在 400 KB 内。
- 截图是静态的：界面改版后不会自动更新，需要重新拍。
