#!/usr/bin/env python3
"""Verify the game-ready Xinyu protagonist asset exists and is structured."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "blender" / "xy_game_protagonist.py"
GLB = ROOT / "frontend" / "public" / "models" / "xy_char_game_protagonist.glb"
BLEND = ROOT / "frontend" / "public" / "models" / "xy_char_game_protagonist.blend"
TEXTURE = ROOT / "frontend" / "public" / "models" / "xy_char_game_protagonist_texture.png"
AI_SOURCE = ROOT / "frontend" / "public" / "models" / "xy_char_game_protagonist_ai_source.png"
SHOT = ROOT / "docs" / "screenshots" / "xy_char_game_protagonist.png"


REQUIRED_SCRIPT_TOKENS = [
    "XYGAME_Root",
    "XYGAME_Head",
    "XYGAME_Body",
    "XYGAME_ArmL",
    "XYGAME_ArmR",
    "XYGAME_LegL",
    "XYGAME_LegR",
    "XYGAME_Cape",
    "XYGAME_Satchel",
    "XYGAME_APose",
    "XYGAME_GameReadable",
    "XYGAME_TextureCard_Main",
    "xy_char_game_protagonist_texture.png",
    "xy_char_game_protagonist.glb",
]


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def assert_file(path: Path, minimum_bytes: int, maximum_bytes: int | None = None) -> None:
    if not path.exists():
        fail(f"missing {path}")
    size = path.stat().st_size
    if size < minimum_bytes:
        fail(f"{path} is too small: {size} bytes")
    if maximum_bytes is not None and size > maximum_bytes:
        fail(f"{path} is too large for a lightweight game asset: {size} bytes")
    print(f"ok file {path.name}: {size} bytes")


def main() -> None:
    assert_file(SCRIPT, 14_000)
    source = SCRIPT.read_text(encoding="utf-8")
    for token in REQUIRED_SCRIPT_TOKENS:
        if token not in source:
            fail(f"missing script token {token}")
    print("ok script contains game-ready markers")

    assert_file(GLB, 90_000, 8_000_000)
    assert_file(BLEND, 80_000, 1_500_000)
    assert_file(TEXTURE, 80_000, 8_000_000)
    assert_file(AI_SOURCE, 500_000, 8_000_000)
    assert_file(SHOT, 70_000)

    with Image.open(SHOT) as image:
        if image.size[0] < 900 or image.size[1] < 1100:
            fail(f"preview too small: {image.size}")
        extrema = image.convert("RGB").getextrema()
        if all(high - low < 8 for low, high in extrema):
            fail("preview appears blank or flat")
        if max(high - low for low, high in extrema) < 40:
            fail("preview lacks enough visible character contrast")
        print(f"ok preview {image.size}, channel ranges {extrema}")

    with Image.open(TEXTURE) as image:
        if image.size[0] < 900 or image.size[1] < 1300:
            fail(f"texture too small: {image.size}")
        alpha = image.convert("RGBA").getchannel("A").getextrema()
        if alpha[0] >= 250:
            fail("texture has no transparent background")
        print(f"ok texture {image.size}, alpha range {alpha}")

    print("XY game protagonist asset verification passed")


if __name__ == "__main__":
    main()
