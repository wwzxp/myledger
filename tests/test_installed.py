"""安装后必须成立的四条行为（在仓库外执行，验证的是已安装的包）。

这些测试只在包被安装后有意义：它们不依赖当前工作目录，也不依赖源码树位置。
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from tempfile import TemporaryDirectory
import unittest
from pathlib import Path

# 这些用例验证的是「已安装」的包；源码树里没装包时应跳过，而不是失败。
_INSTALLED = (Path(sys.executable).parent / "myledger.exe").is_file() or (
    Path(sys.executable).parent / "myledger"
).is_file()


def run(cmd: list[str], cwd: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=cwd)


@unittest.skipUnless(_INSTALLED, "仅在包已安装（存在 myledger 脚本）时运行")
class InstalledPackageTest(unittest.TestCase):
    def test_package_is_importable_outside_source_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run([sys.executable, "-c", "import app; print(app.__file__)"], cwd=tmp)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("app", result.stdout)
            self.assertNotIn("None", result.stdout)

    def test_console_script_exists_and_prints_help(self):
        # 控制台脚本与解释器同目录；用 sys.executable 推导，避免依赖 shell 的 PATH 形态。
        scripts_dir = Path(sys.executable).parent
        executable = next(
            (
                candidate
                for candidate in (scripts_dir / "myledger.exe", scripts_dir / "myledger")
                if candidate.is_file()
            ),
            None,
        )
        self.assertIsNotNone(executable, f"未在 {scripts_dir} 找到 myledger 脚本")
        with tempfile.TemporaryDirectory() as tmp:
            result = run([str(executable), "--help"], cwd=tmp)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("myledger", result.stdout.lower())

    def test_static_assets_shipped_with_package(self):
        import app as app_package

        static = Path(app_package.__file__).parent / "bookkeeping_app" / "static"
        self.assertTrue((static / "index.html").is_file(), f"缺少 {static / 'index.html'}")
        self.assertTrue((static / "dashboard.js").is_file())

    def test_database_path_comes_from_config_file(self):
        # 配置只来自文件：在临时目录放一份 myledger.toml，启动后数据库必须建在指定位置。
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            db = tmp_path / "data" / "ledger.db"
            (tmp_path / "myledger.toml").write_text(
                f'[database]\npath = "{db.as_posix()}"\n', encoding="utf-8"
            )
            code = (
                "import pathlib;"
                "from app.config import load_config;"
                "from app import bookkeeping;"
                "bookkeeping.set_db_path(load_config().database.path);"
                "bookkeeping.init_db();"
                f"print(pathlib.Path(r'{db}').is_file())"
            )
            result = run([sys.executable, "-c", code], cwd=tmp)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("True", result.stdout)


if __name__ == "__main__":
    unittest.main()
