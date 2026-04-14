#!/usr/bin/env python3
"""
Build the aerocord_bridge sidecar into a standalone executable using PyInstaller.
Run this on each target platform to produce platform-specific binaries.

Usage:
    python build.py
"""

import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent


def main() -> None:
    name = "aerocord_bridge"
    entry = str(ROOT / "aerocord_bridge" / "__main__.py")
    dist = str(ROOT / "dist")

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name", name,
        "--onedir",
        "--noconfirm",
        "--clean",
        "--distpath", dist,
        "--workpath", str(ROOT / "build"),
        "--specpath", str(ROOT),
        "--hidden-import", "discord",
        "--hidden-import", "discord.ext",
        "--hidden-import", "nacl",
        "--hidden-import", "nacl.bindings",
        "--hidden-import", "opuslib",
        "--hidden-import", "davey",
        "--collect-all", "discord",
        entry,
    ]

    if platform.system() == "Windows":
        cmd.extend(["--console"])

    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)
    print(f"\nBuild complete! Output in {dist}/{name}/")


if __name__ == "__main__":
    main()
