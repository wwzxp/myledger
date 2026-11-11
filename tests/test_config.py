"""配置读取测试：只认文件，不读环境变量。

这些测试直接断言「环境变量不影响结果」，因为本项目明确禁止用环境变量配置。
"""

from __future__ import annotations

import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from app.config import Config, load_config


class ConfigFileTest(unittest.TestCase):
    def test_defaults_when_no_file(self):
        with TemporaryDirectory() as tmp:
            config = load_config(start=Path(tmp))
            self.assertIsInstance(config, Config)
            self.assertTrue(str(config.database.path).endswith("myledger.db"))
            self.assertEqual(config.model.name, "minicpm-v-4.7-1b")

    def test_reads_database_model_and_account_map(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "myledger.toml"
            path.write_text(
                "[database]\n"
                'path = "E:/data/ledger.db"\n\n'
                "[model]\n"
                'endpoint = "http://127.0.0.1:9999/v1/chat/completions"\n'
                'name = "custom-model"\n'
                "min_confidence = 0.7\n\n"
                "[import.account_map]\n"
                '"招商银行信用卡(1455)" = "招行信用卡"\n',
                encoding="utf-8",
            )
            config = load_config(path)
            self.assertEqual(str(config.database.path).replace("\\", "/"), "E:/data/ledger.db")
            self.assertEqual(config.model.name, "custom-model")
            self.assertAlmostEqual(config.model.min_confidence, 0.7)
            self.assertEqual(config.account_map["招商银行信用卡(1455)"], "招行信用卡")
            self.assertEqual(config.source, path)

    def test_config_in_start_directory_is_discovered(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "myledger.toml"
            path.write_text('[model]\nname = "from-cwd"\n', encoding="utf-8")
            config = load_config(start=Path(tmp))
            self.assertEqual(config.model.name, "from-cwd")

    def test_environment_variables_are_ignored(self):
        with TemporaryDirectory() as tmp:
            os.environ["AI_LEDGER_MODEL_NAME"] = "env-should-be-ignored"
            os.environ["BOOKKEEPING_DB_PATH"] = "E:/env/should/be/ignored.db"
            try:
                config = load_config(start=Path(tmp))
            finally:
                os.environ.pop("AI_LEDGER_MODEL_NAME", None)
                os.environ.pop("BOOKKEEPING_DB_PATH", None)
            self.assertNotEqual(config.model.name, "env-should-be-ignored")
            self.assertNotIn("should/be/ignored", str(config.database.path).replace("\\", "/"))

    def test_missing_explicit_path_raises(self):
        with self.assertRaises(FileNotFoundError):
            load_config("E:/definitely/not/here/myledger.toml")


class ActiveConfigPathTest(unittest.TestCase):
    """`--config` 指定过就要一直用它。

    回归：`_apply_config()` 只用配置里的数据库路径，没保存路径本身，
    之后 HTTP 处理里的无参 `load_config()` 退回目录发现，读到内置默认值
    ——部署文件名是 ai-ledger.toml 时，表现为「已配 secret_key 却报缺少主密钥」。
    """

    def setUp(self):
        from app import config as config_mod

        self.config_mod = config_mod
        self.addCleanup(config_mod.set_config_path, None)

    def test_named_config_is_used_by_later_bare_loads(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "ai-ledger.toml"
            path.write_text(
                '[database]\npath = "E:/data/ledger.db"\n\n'
                f'[mail]\nsecret_key = "{"x" * 43}"\n',
                encoding="utf-8",
            )
            # 当前目录里没有 myledger.toml：只有固化下来的路径能救这一读。
            self.config_mod.set_config_path(path)
            config = self.config_mod.load_config()
            self.assertEqual(config.source, path)
            self.assertEqual(config.mail.secret_key, "x" * 43)
            self.assertEqual(str(config.database.path).replace("\\", "/"), "E:/data/ledger.db")

    def test_cleared_path_falls_back_to_discovery(self):
        with TemporaryDirectory() as tmp:
            named = Path(tmp) / "ai-ledger.toml"
            named.write_text('[model]\nname = "from-named"\n', encoding="utf-8")
            other = Path(tmp) / "discovered"
            other.mkdir()
            (other / "myledger.toml").write_text('[model]\nname = "from-cwd"\n', encoding="utf-8")

            self.config_mod.set_config_path(named)
            self.assertEqual(self.config_mod.load_config().model.name, "from-named")

            self.config_mod.set_config_path(None)
            self.assertEqual(self.config_mod.load_config(start=other).model.name, "from-cwd")

    def test_non_existent_path_is_not_pinned(self):
        self.assertIsNone(self.config_mod.set_config_path("E:/definitely/not/here/x.toml"))
        self.assertIsNone(self.config_mod.active_config_path())


if __name__ == "__main__":
    unittest.main()


class UnreadableCandidateTest(unittest.TestCase):
    """服务账号跑起来时，当前目录可能是它进不去的 /root。

    load_config 不能因为一个够不到的候选路径就抛 PermissionError——
    否则 systemd 里一切正常，手动跑 CLI 却直接崩。
    """

    def test_permission_error_on_candidate_is_ignored(self):
        from unittest import mock
        from app import config as config_mod

        with mock.patch.object(
            config_mod.Path, "is_file", side_effect=PermissionError("denied")
        ):
            cfg = config_mod.load_config()
        self.assertIsNotNone(cfg)  # 退回内置默认值即可


class ConsoleEncodingTest(unittest.TestCase):
    """Windows 控制台默认不是 UTF-8，`--help` 里全是中文，曾直接崩溃。"""

    def test_help_does_not_crash_on_narrow_encoding(self):
        import io
        import sys
        from unittest import mock

        from app.__main__ import main_cli

        # 模拟 cp1252 控制台：未重配置时写中文必抛 UnicodeEncodeError
        raw = io.BytesIO()
        narrow = io.TextIOWrapper(raw, encoding="cp1252", errors="strict",
                                  write_through=True)
        with mock.patch.object(sys, "stdout", narrow), \
             mock.patch.object(sys, "argv", ["myledger", "--help"]):
            code = main_cli()          # 不应该抛异常
        self.assertEqual(code, 0)

        # 输出被重配置成 UTF-8，中文帮助完整写出
        narrow.flush()
        self.assertIn("myledger", raw.getvalue().decode("utf-8"))
