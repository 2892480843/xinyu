#!/usr/bin/env python3
"""Verify the manga/anime protagonist Blender asset exists and has key parts."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "blender" / "xy_anime_protagonist.py"
GLB = ROOT / "frontend" / "public" / "models" / "xy_char_anime_protagonist.glb"
BLEND = ROOT / "frontend" / "public" / "models" / "xy_char_anime_protagonist.blend"
SHOT = ROOT / "docs" / "screenshots" / "xy_char_anime_protagonist.png"


REQUIRED_SCRIPT_TOKENS = [
    "XYAN_Body",
    "XYAN_FacePlane",
    "XYAN_HairLock_",
    "XYAN_FaceRefine_",
    "XYAN_HairRefine_",
    "XYAN_CapePanel_",
    "XYAN_CapeFold_",
    "XYAN_SleeveFold_",
    "XYAN_Outline",
    "XYAN_ShellPendant",
    "XYAN_Satchel",
    "XYAN_LighthouseMark",
    "xy_char_anime_protagonist.glb",
]


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def assert_file(path: Path, minimum_bytes: int) -> None:
    if not path.exists():
        fail(f"missing {path}")
    size = path.stat().st_size
    if size < minimum_bytes:
        fail(f"{path} is too small: {size} bytes")
    print(f"ok file {path.name}: {size} bytes")


def main() -> None:
    assert_file(SCRIPT, 12_000)
    source = SCRIPT.read_text(encoding="utf-8")
    for token in REQUIRED_SCRIPT_TOKENS:
        if token not in source:
            fail(f"missing script token {token}")
    print("ok script contains manga asset markers")

    assert_file(GLB, 120_000)
    assert_file(BLEND, 140_000)
    assert_file(SHOT, 80_000)

    with Image.open(SHOT) as image:
        if image.size[0] < 900 or image.size[1] < 1100:
            fail(f"preview too small: {image.size}")
        extrema = image.convert("RGB").getextrema()
        if all(high - low < 8 for low, high in extrema):
            fail("preview appears blank or flat")
        print(f"ok preview {image.size}, channel ranges {extrema}")

    print("XY anime protagonist asset verification passed")


if __name__ == "__main__":
    main()
