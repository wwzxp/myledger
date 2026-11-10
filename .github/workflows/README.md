---
description: CI 工作流定义
kind: tooling
---

# .github/workflows/

> 注：这里不再放 `.github/README.md`。GitHub 选仓库首页时
> `.github/README.md` 的优先级高于根目录 `README.md`，
> 放一个目录说明会把真正的项目 README 遮住。

## 职责

- `build.yml` 的作业定义与触发条件。
- 三平台各打一次单文件二进制（PyInstaller 不能交叉编译）。

## 不负责

- 打包逻辑本身（在 `scripts/build-binary.py`）。

## 对外接口

- 三个矩阵项：`linux-x86_64`、`macos-arm64`、`windows-x86_64`。
- 产物名 `ai-ledger-<platform>`（二进制内部名仍为 `ai-ledger`，命令名为 `myledger`）。

## 依赖

- 见上层 `.github/README.md`。

## 已知限制

- macOS 产物的架构取决于 `macos-latest` runner，目前是 arm64；
  要出 Intel 版需显式指定 `macos-13`。
