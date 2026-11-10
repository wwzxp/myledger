#!/usr/bin/env python3
"""校验三个平台的打包产物：解压、检查文件头、输出清单。

用法：python scripts/verify-artifacts.py <dist目录>

产物来自 CI（.github/workflows/build.yml），每个平台一个 zip。
Linux/macOS 要求 ELF/Mach-O 头，Windows 要求 PE 头。
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

# (zip 名, 内部文件名, 期望的魔数前缀, 说明)
EXPECT = [
    ("linux.zip", "myledger", b"\x7fELF", "Linux x86_64（ELF）"),
    ("macos.zip", "myledger", b"\xcf\xfa\xed\xfe", "macOS arm64（Mach-O 64）"),
    ("windows.zip", "myledger.exe", b"MZ", "Windows x86_64（PE）"),
]


def header_ok(path: Path, magic: bytes) -> tuple[bool, str]:
    head = path.read_bytes()[:4]
    return head.startswith(magic), head.hex()


def main() -> int:
    dist = Path(sys.argv[1] if len(sys.argv) > 1 else ".deploy/dist")
    out = dist / "bin"
    out.mkdir(parents=True, exist_ok=True)

    print(f"{'平台':<28} {'大小':>10}  文件头        结果")
    print("-" * 62)

    failed = 0
    for zip_name, member, magic, label in EXPECT:
        archive = dist / zip_name
        if not archive.is_file():
            print(f"{label:<28} {'--':>10}  {'缺失':<12} ✗ 没有 {zip_name}")
            failed += 1
            continue

        try:
            with zipfile.ZipFile(archive) as z:
                names = z.namelist()
                if member not in names:
                    print(f"{label:<28} {'--':>10}  {'--':<12} ✗ 压缩包里没有 {member}（有 {names}）")
                    failed += 1
                    continue
                target = out / (label.split()[0].lower() + "-" + member)
                target.write_bytes(z.read(member))
                target.chmod(0o755)
        except zipfile.BadZipFile:
            size = archive.stat().st_size
            print(f"{label:<28} {size / 1e6:>9.1f}M  {'--':<12} ✗ 压缩包损坏（下载不完整？）")
            failed += 1
            continue

        size = target.stat().st_size
        ok, head = header_ok(target, magic)
        mark = "✓" if ok else "✗ 文件头不符"
        if not ok:
            failed += 1
        print(f"{label:<28} {size / 1e6:>9.1f}M  {head:<12} {mark}")

    print("-" * 62)
    if failed:
        print(f"{failed} 项失败")
        return 1
    print(f"三个平台全部就绪，已解压到 {out}")
    print("Windows 版可直接双击运行；Linux/macOS 版需 chmod +x。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
