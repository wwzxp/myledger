"""备份功能的测试：一致性、保留策略、坏库处理。"""

from __future__ import annotations

import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app import backup


def make_db(path: Path, rows: int = 3) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute("create table entries (id integer primary key, note text)")
        conn.execute("create table accounts (id integer primary key)")
        conn.executemany("insert into entries (note) values (?)", [(f"row{i}",) for i in range(rows)])
        conn.commit()
    finally:
        conn.close()


class BackupTest(unittest.TestCase):
    def test_creates_readable_copy(self):
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            db = tmp_path / "ledger.db"
            make_db(db, rows=5)

            result = backup.backup_database(db, tmp_path / "backups")
            self.assertIsNotNone(result.created)
            self.assertTrue(result.created.is_file())

            conn = sqlite3.connect(result.created)
            try:
                count = conn.execute("select count(*) from entries").fetchone()[0]
            finally:
                conn.close()
            self.assertEqual(count, 5)

    def test_missing_database_is_reported_not_crash(self):
        with TemporaryDirectory() as tmp:
            result = backup.backup_database(Path(tmp) / "nope.db", Path(tmp) / "backups")
            self.assertIsNone(result.created)
            self.assertIn("不存在", result.reason)

    def test_prune_keeps_newest(self):
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            db = tmp_path / "ledger.db"
            make_db(db)
            backup_dir = tmp_path / "backups"
            backup_dir.mkdir()

            # 造 5 份旧备份，文件名可比大小
            for i in range(5):
                (backup_dir / f"ledger-2026010{i + 1}-000000.db").write_bytes(b"x")

            removed = backup.prune_backups(backup_dir, keep=2)
            self.assertEqual(len(removed), 3)
            self.assertEqual(len(backup.list_backups(backup_dir)), 2)
            # 留下的是最新的两份
            remaining = [p.name for p in backup.list_backups(backup_dir)]
            self.assertEqual(remaining, ["ledger-20260104-000000.db", "ledger-20260105-000000.db"])

    def test_prune_noop_when_under_limit(self):
        with TemporaryDirectory() as tmp:
            backup_dir = Path(tmp) / "backups"
            backup_dir.mkdir()
            (backup_dir / "ledger-20260101-000000.db").write_bytes(b"x")
            self.assertEqual(backup.prune_backups(backup_dir, keep=14), [])

    def test_backup_then_prune_keeps_limit(self):
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            db = tmp_path / "ledger.db"
            make_db(db)
            backup_dir = tmp_path / "backups"
            for _ in range(4):
                backup.backup_database(db, backup_dir, keep=2)
            self.assertLessEqual(len(backup.list_backups(backup_dir)), 2)

    def test_corrupt_copy_is_rejected(self):
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            db = tmp_path / "ledger.db"
            # 建一个没有 entries 表的库
            conn = sqlite3.connect(db)
            try:
                conn.execute("create table other (id integer)")
                conn.commit()
            finally:
                conn.close()
            result = backup.backup_database(db, tmp_path / "backups")
            self.assertIsNone(result.created)
            self.assertIn("校验失败", result.reason)
            self.assertEqual(backup.list_backups(tmp_path / "backups"), [])


if __name__ == "__main__":
    unittest.main()
