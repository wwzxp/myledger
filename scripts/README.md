---
description: 仓库脚本：文档门禁与后续的生成工具
kind: tooling
---

# scripts/

## 职责

- `doc-check.mjs`：文档门禁，`npm run doc:check` 的入口。

## 不负责

- 应用运行时代码；不引用 `src/` 里的任何模块。
- 构建产物生成（尚未引入构建）。

## 对外接口

- `node scripts/doc-check.mjs`：通过退出码 0，失败退出码 1 并逐条打印问题。
- `scripts/start-windows.cmd [ /background ]`：Windows 启动，固定 `%AI_LEDGER_HOME%\ai-ledger.toml` 与 8765。
- `scripts/stop-windows.cmd`：按端口停掉 8765 上的实例。
- `scripts/install.sh` / `scripts/deploy-linux.sh`：Linux 部署。

## 依赖

- 仅 Node 内置模块（`node:fs`、`node:path`）。门禁不能依赖构建产物或第三方包。

## 已知限制

- 链接检查只覆盖 markdown 相对路径；不检查图片是否损坏、不校验锚点是否存在。
