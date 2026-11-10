#!/usr/bin/env python3
"""把 myledger 打包成单个可执行文件。

打出来的二进制**不依赖 Python**：拷到同架构的机器上就能跑，
用 systemd / launchd 托管即为后台服务（见下方示例）。

用法：

    # 在目标平台上各打一次（PyInstaller 不能交叉编译）
    python scripts/build-binary.py

    # 产物
    dist/myledger          # Linux / macOS
    dist/myledger.exe      # Windows

后台服务示例（Linux）：

    sudo cp dist/myledger /usr/local/bin/myledger
    sudo tee /etc/systemd/system/myledger.service <<'EOF'
    [Unit]
    Description=AI Ledger
    After=network.target

    [Service]
    Type=simple
    User=ledger
    WorkingDirectory=/var/lib/myledger
    # --config 必须给：否则会退到 $HOME/.local，服务账号通常没有可写 HOME
    ExecStart=/usr/local/bin/myledger --config /etc/myledger/myledger.toml dashboard --host 0.0.0.0 --port 8765
    Restart=always
    RestartSec=3
    UMask=0077
    NoNewPrivileges=true
    PrivateTmp=true

    [Install]
    WantedBy=multi-user.target
    EOF
    sudo systemctl enable --now myledger

产物说明：
- 体积约 40–60 MB（内含 Python 运行时与全部依赖）。
- 首次启动会解包到临时目录，慢 1–3 秒；之后常驻内存约 30–60 MB。
- 打包态下 `__file__` 指向解包目录，代码里已用 `sys.frozen` 区分
  （见 `app/bookkeeping.py` 的 `_FROZEN`），数据路径仍读配置文件。
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

# Windows 控制台/CI 默认不是 UTF-8，打印中文会直接 UnicodeEncodeError。
# 这里把标准输出改成 UTF-8（Python 3.7+ 支持重配置）。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

ROOT = Path(__file__).resolve().parents[1]

SPEC = '''# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files

datas = collect_data_files('app', includes=['**/*'])

a = Analysis(
    [r'{entry}'],
    pathex=[r'{root}'],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'app.bookkeeping',
        'app.bookkeeping_app',
        'app.import_bill',
        'app.import_alipay_bill',
        'app.import_wechat_bill',
        'app.importers',
        'app.mailbox',
        'app.multipart',
        'app.upload',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter', 'unittest', 'pydoc', 'test'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name='myledger',
    debug=False,
    strip=False,
    upx=False,
    console=True,
)
'''

ENTRY = '''"""打包入口：与 console_scripts 一致，走 main_cli（处理 --config/--help/--version）。"""
import sys

from app.__main__ import main_cli

if __name__ == "__main__":
    sys.exit(main_cli())
'''


def main() -> int:
    try:
        import PyInstaller  # noqa: F401
    except ModuleNotFoundError:
        print("需要先安装 PyInstaller：pip install pyinstaller", file=sys.stderr)
        return 2

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        entry = tmpdir / "entry.py"
        entry.write_text(ENTRY, encoding="utf-8")
        spec = tmpdir / "myledger.spec"
        spec.write_text(SPEC.format(entry=entry, root=ROOT), encoding="utf-8")

        cmd = [
            sys.executable, "-m", "PyInstaller",
            "--clean", "--noconfirm",
            "--distpath", str(ROOT / "dist"),
            "--workpath", str(tmpdir / "build"),
            str(spec),
        ]
        print("执行:", " ".join(cmd))
        result = subprocess.run(cmd, cwd=ROOT)
        if result.returncode != 0:
            print("打包失败", file=sys.stderr)
            return result.returncode

    name = "myledger.exe" if sys.platform == "win32" else "myledger"
    target = ROOT / "dist" / name
    if not target.is_file():
        print(f"没找到产物：{target}", file=sys.stderr)
        return 1

    size_mb = target.stat().st_size / 1024 / 1024
    print(f"\n打包完成：{target}（{size_mb:.1f} MB）")
    print("验证：  ./dist/myledger --version")
    print("部署：  见本脚本开头的 systemd 示例")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
