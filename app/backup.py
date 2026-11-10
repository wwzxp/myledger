"""数据库备份：在线安全复制 SQLite 并保留最近 N 份。

为什么不用直接复制文件：SQLite 在 WAL 模式下有未落盘的 -wal/-shm，
直接 cp 可能拿到不一致的快照。这里用 `sqlite3.Connection.backup()`，
它是 SQLite 官方提供的在线备份 API，能在写入进行中取得一致副本。
"""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

DEFAULT_KEEP = 14  # 保留最近 14 份（按文件名日期排序）


@dataclass(frozen=True)
class BackupResult:
    created: Path | None
    removed: list[Path]
    reason: str = ""


def backup_database(
    db_path: str | Path,
    backup_dir: str | Path,
    keep: int = DEFAULT_KEEP,
) -> BackupResult:
    """把数据库备份到 backup_dir，文件名带时间戳，并清理超出 keep 的旧备份。"""
    source = Path(db_path)
    if not source.is_file():
        return BackupResult(created=None, removed=[], reason=f"数据库不存在：{source}")

    target_dir = Path(backup_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    # 备份就是整库拷贝，权限必须和原库一致，别让同机其他账号读到
    try:
        os.chmod(target_dir, 0o700)
    except (OSError, NotImplementedError):
        pass

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = target_dir / f"ledger-{stamp}.db"

    # 显式 close：Windows 上连接不关闭会占住文件，导致临时目录无法清理。
    src = sqlite3.connect(source)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()

    # 校验备份可读且表齐全，避免留下坏文件
    check = sqlite3.connect(target)
    try:
        tables = {row[0] for row in check.execute("select name from sqlite_master where type='table'")}
    finally:
        check.close()
    if "entries" not in tables:
        target.unlink(missing_ok=True)
        return BackupResult(created=None, removed=[], reason="备份校验失败：缺少 entries 表")

    removed = prune_backups(target_dir, keep)
    return BackupResult(created=target, removed=removed, reason="")


def list_backups(backup_dir: str | Path) -> list[Path]:
    target_dir = Path(backup_dir)
    if not target_dir.is_dir():
        return []
    return sorted(target_dir.glob("ledger-*.db"))


def prune_backups(backup_dir: str | Path, keep: int = DEFAULT_KEEP) -> list[Path]:
    """删除最旧的备份，保留最近 keep 份。返回被删除的文件。"""
    if keep <= 0:
        return []
    backups = list_backups(backup_dir)
    if len(backups) <= keep:
        return []

    removed = backups[: len(backups) - keep]
    for path in removed:
        path.unlink(missing_ok=True)
    return removed
