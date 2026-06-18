"""Generate the 24 local Xinyu scene preset images.

These are deterministic illustrated placeholders, not online AI-generated
assets. They keep the demo fully offline while giving every scene palette a
real PNG background.
"""

from __future__ import annotations

import math
import random
from pathlib import Path
from typing import Dict, Iterable, Tuple

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "scenes"
SIZE = (1600, 1000)
Color = Tuple[int, int, int]


SCENES: Dict[str, Dict] = {
    "sad_low": {
        "file": "sad-low-blue-hour.png",
        "sky": ("#506783", "#8795aa", "#b7bcc7"),
        "sea": "#53687d",
        "island": "#2e3a4b",
        "light": "#f2e6ca",
        "weather": "light_rain",
        "time": "dusk",
        "motifs": ["lighthouse"],
    },
    "sad_mid": {
        "file": "sad-mid-slate-blue.png",
        "sky": ("#3a4a6b", "#5a6b8c", "#8a93ad"),
        "sea": "#3c4a66",
        "island": "#222a3d",
        "light": "#e8e4d8",
        "weather": "light_rain",
        "time": "dusk",
        "motifs": ["lighthouse", "waves"],
    },
    "sad_high": {
        "file": "sad-high-midnight-rain.png",
        "sky": ("#162238", "#26354d", "#4b576e"),
        "sea": "#17253a",
        "island": "#111827",
        "light": "#d8e2ee",
        "weather": "rain",
        "time": "night",
        "motifs": ["lighthouse", "distant_light"],
    },
    "anxious_low": {
        "file": "anxious-low-morning-haze.png",
        "sky": ("#7a8794", "#aeb6c1", "#d5d9df"),
        "sea": "#6d7b88",
        "island": "#46515c",
        "light": "#eef2f4",
        "weather": "fog",
        "time": "day",
        "motifs": ["rocks"],
    },
    "anxious_mid": {
        "file": "anxious-mid-mist-gray.png",
        "sky": ("#6b7280", "#9ca3af", "#c7cdd6"),
        "sea": "#5b6573",
        "island": "#3a4150",
        "light": "#e5e7eb",
        "weather": "fog",
        "time": "day",
        "motifs": ["rocks", "distant_ship"],
    },
    "anxious_high": {
        "file": "anxious-high-pressure-fog.png",
        "sky": ("#4c5565", "#748092", "#a8afba"),
        "sea": "#465367",
        "island": "#303744",
        "light": "#dfe5eb",
        "weather": "storm",
        "time": "dusk",
        "motifs": ["rocks", "clouds"],
    },
    "tired_low": {
        "file": "tired-low-evening-indigo.png",
        "sky": ("#24345d", "#4a5d8a", "#7e8fb5"),
        "sea": "#26365f",
        "island": "#17203b",
        "light": "#f2e9c8",
        "weather": "clear",
        "time": "dusk",
        "motifs": ["hammock"],
    },
    "tired_mid": {
        "file": "tired-mid-deep-indigo.png",
        "sky": ("#0a1330", "#162046", "#243066"),
        "sea": "#0e1638",
        "island": "#070c1c",
        "light": "#f4f1d0",
        "weather": "clear",
        "time": "night",
        "motifs": ["hammock", "fireflies"],
    },
    "tired_high": {
        "file": "tired-high-starry-hush.png",
        "sky": ("#071021", "#111a38", "#242c55"),
        "sea": "#090f24",
        "island": "#050917",
        "light": "#e8e4c8",
        "weather": "fog",
        "time": "night",
        "motifs": ["hammock", "stars"],
    },
    "lonely_low": {
        "file": "lonely-low-lavender-dawn.png",
        "sky": ("#a89dc4", "#cbc2dc", "#e9e0ef"),
        "sea": "#968db0",
        "island": "#625977",
        "light": "#fff3e0",
        "weather": "fog",
        "time": "dawn",
        "motifs": ["single_tree"],
    },
    "lonely_mid": {
        "file": "lonely-mid-pale-lavender.png",
        "sky": ("#9a8fb5", "#c3b9d6", "#e0d8ec"),
        "sea": "#8a82a6",
        "island": "#5a526e",
        "light": "#fff3e0",
        "weather": "fog",
        "time": "dawn",
        "motifs": ["single_tree", "shore"],
    },
    "lonely_high": {
        "file": "lonely-high-moonlit-shore.png",
        "sky": ("#35314f", "#5f5a7e", "#9690b0"),
        "sea": "#34314f",
        "island": "#25233a",
        "light": "#f1e7d2",
        "weather": "clear",
        "time": "night",
        "motifs": ["single_tree", "moon_path"],
    },
    "calm_low": {
        "file": "calm-low-soft-aqua-dawn.png",
        "sky": ("#71cbd1", "#a4e1e4", "#daf5f2"),
        "sea": "#54b9c2",
        "island": "#2b8791",
        "light": "#fff6cf",
        "weather": "clear",
        "time": "dawn",
        "motifs": ["sailboat"],
    },
    "calm_mid": {
        "file": "calm-mid-soft-aqua.png",
        "sky": ("#3fb6c4", "#7fd3dd", "#c4eef2"),
        "sea": "#2fa6b8",
        "island": "#1f7d8c",
        "light": "#fff6cf",
        "weather": "clear",
        "time": "day",
        "motifs": ["sailboat", "gentle_waves"],
    },
    "calm_high": {
        "file": "calm-high-glass-tide.png",
        "sky": ("#2f8ea0", "#75c5cf", "#bee6e8"),
        "sea": "#277f91",
        "island": "#1a6470",
        "light": "#fff1c0",
        "weather": "clear",
        "time": "dusk",
        "motifs": ["sailboat", "reflection"],
    },
    "happy_low": {
        "file": "happy-low-warm-morning.png",
        "sky": ("#f5bd54", "#f8d27b", "#ffe9b3"),
        "sea": "#eab25a",
        "island": "#c88434",
        "light": "#fff4b8",
        "weather": "clear",
        "time": "day",
        "motifs": ["flowers"],
    },
    "happy_mid": {
        "file": "happy-mid-warm-gold.png",
        "sky": ("#f0a93b", "#f8c96b", "#fde4a6"),
        "sea": "#e6a14a",
        "island": "#c87f2a",
        "light": "#fff3b0",
        "weather": "clear",
        "time": "day",
        "motifs": ["flowers", "butterflies"],
    },
    "happy_high": {
        "file": "happy-high-sunburst-gold.png",
        "sky": ("#ef8f36", "#f7bb51", "#ffe69a"),
        "sea": "#df9340",
        "island": "#b96d25",
        "light": "#fff0a6",
        "weather": "clear",
        "time": "dusk",
        "motifs": ["flowers", "butterflies", "sunburst"],
    },
    "angry_low": {
        "file": "angry-low-crimson-wind.png",
        "sky": ("#6b2b35", "#98404a", "#c46a62"),
        "sea": "#5b222d",
        "island": "#35151d",
        "light": "#efc27b",
        "weather": "light_rain",
        "time": "dusk",
        "motifs": ["cliffs"],
    },
    "angry_mid": {
        "file": "angry-mid-deep-crimson.png",
        "sky": ("#5a1f2a", "#8a2f3a", "#b04a4a"),
        "sea": "#4a1820",
        "island": "#2a0f14",
        "light": "#f0c987",
        "weather": "storm",
        "time": "dusk",
        "motifs": ["cliffs", "crashing_waves"],
    },
    "angry_high": {
        "file": "angry-high-black-storm.png",
        "sky": ("#210b13", "#4b1722", "#7a2a32"),
        "sea": "#220b12",
        "island": "#120609",
        "light": "#e2a65f",
        "weather": "storm",
        "time": "night",
        "motifs": ["cliffs", "lightning"],
    },
    "helpless_low": {
        "file": "helpless-low-dim-rain.png",
        "sky": ("#263544", "#465567", "#748294"),
        "sea": "#1f2d3b",
        "island": "#151d28",
        "light": "#dfe8ef",
        "weather": "light_rain",
        "time": "dusk",
        "motifs": ["distant_light"],
    },
    "helpless_mid": {
        "file": "helpless-mid-dark-slate.png",
        "sky": ("#0f1620", "#1a2733", "#2a3a48"),
        "sea": "#0c121b",
        "island": "#070b11",
        "light": "#d8e2ee",
        "weather": "rain",
        "time": "night",
        "motifs": ["distant_light", "still_water"],
    },
    "helpless_high": {
        "file": "helpless-high-faint-light.png",
        "sky": ("#050910", "#101923", "#20303f"),
        "sea": "#050911",
        "island": "#03060b",
        "light": "#cddaea",
        "weather": "rain",
        "time": "night",
        "motifs": ["distant_light", "heavy_rain"],
    },
}


def hex_to_rgb(value: str) -> Color:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def mix(c1: Color, c2: Color, t: float) -> Color:
    return (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t))


def add_alpha(color: Color, alpha: int) -> Tuple[int, int, int, int]:
    return (*color, alpha)


def vertical_gradient(size: Tuple[int, int], stops: Iterable[Color]) -> Image.Image:
    colors = list(stops)
    w, h = size
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        pos = y / max(h - 1, 1)
        segment = min(int(pos * (len(colors) - 1)), len(colors) - 2)
        local_t = (pos - segment / (len(colors) - 1)) * (len(colors) - 1)
        draw.line([(0, y), (w, y)], fill=mix(colors[segment], colors[segment + 1], local_t))
    return img


def ellipse_blur(base: Image.Image, box, color, blur=50):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.ellipse(box, fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(layer)


def polygon_blur(base: Image.Image, points, color, blur=0):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.polygon(points, fill=color)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(layer)


def draw_scene(key: str, spec: Dict) -> None:
    random.seed(key)
    w, h = SIZE
    sky = [hex_to_rgb(c) for c in spec["sky"]]
    sea = hex_to_rgb(spec["sea"])
    island = hex_to_rgb(spec["island"])
    light = hex_to_rgb(spec["light"])
    img = vertical_gradient(SIZE, sky).convert("RGBA")
    draw = ImageDraw.Draw(img, "RGBA")

    is_night = spec["time"] == "night"
    light_x = 1180 if spec["time"] != "dawn" else 1080
    light_y = 165 if spec["time"] != "dusk" else 230
    light_r = 76 if spec["time"] != "night" else 58
    ellipse_blur(img, (light_x - 190, light_y - 190, light_x + 190, light_y + 190), add_alpha(light, 80), 70)
    draw.ellipse((light_x - light_r, light_y - light_r, light_x + light_r, light_y + light_r), fill=add_alpha(light, 230))

    if "sunburst" in spec["motifs"]:
        for i in range(18):
            angle = i * math.tau / 18
            draw.line(
                [
                    (light_x, light_y),
                    (light_x + math.cos(angle) * 330, light_y + math.sin(angle) * 330),
                ],
                fill=add_alpha(light, 34),
                width=4,
            )

    if is_night or "stars" in spec["motifs"]:
        for i in range(95):
            x = random.randint(30, w - 30)
            y = random.randint(30, 430)
            r = random.choice([1, 1, 2])
            alpha = random.randint(75, 185)
            draw.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 245, alpha))

    horizon = 585
    sea_layer = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    sea_draw = ImageDraw.Draw(sea_layer)
    for y in range(horizon, h):
        t = (y - horizon) / (h - horizon)
        c = mix(mix(sea, sky[-1], 0.18), sea, min(1, t * 1.15))
        sea_draw.line([(0, y), (w, y)], fill=(*c, 238))
    img.alpha_composite(sea_layer)

    for i in range(12):
        y = horizon + 22 + i * 30
        amp = 10 + i * 1.2
        points = []
        for x in range(-40, w + 80, 40):
            points.append((x, y + math.sin(x / 120 + i) * amp))
        draw.line(points, fill=(*mix(sea, light, 0.42), 34), width=2)

    reflection_alpha = 55 if spec["time"] != "day" else 34
    for i in range(12):
        rw = 44 + i * 34
        ry = horizon + 28 + i * 28
        draw.rounded_rectangle(
            (light_x - rw, ry, light_x + rw, ry + 4),
            radius=8,
            fill=add_alpha(light, max(8, reflection_alpha - i * 4)),
        )

    # distant and main island silhouettes
    distant = [
        (0, 650), (130, 617), (270, 635), (420, 604), (590, 626), (735, 594),
        (910, 620), (1080, 590), (1240, 622), (1420, 600), (1600, 615), (1600, 1000), (0, 1000)
    ]
    polygon_blur(img, distant, add_alpha(mix(island, sky[0], 0.25), 145), 2)
    main = [
        (0, 735), (150, 690), (320, 714), (510, 670), (690, 710), (860, 655),
        (1040, 692), (1210, 650), (1390, 690), (1600, 660), (1600, 1000), (0, 1000)
    ]
    polygon_blur(img, main, add_alpha(island, 236), 0)

    # foreground island details
    if "single_tree" in spec["motifs"]:
        tx, ty = 500, 670
        draw.line((tx, ty, tx, ty - 115), fill=add_alpha(mix(island, (0, 0, 0), 0.35), 240), width=12)
        for dx, dy, rr in [(-34, -118, 48), (18, -132, 56), (54, -105, 38)]:
            draw.ellipse((tx + dx - rr, ty + dy - rr, tx + dx + rr, ty + dy + rr), fill=add_alpha(mix(island, light, 0.2), 210))

    if "lighthouse" in spec["motifs"] or "distant_light" in spec["motifs"]:
        lx, ly = 1070, 604
        draw.polygon([(lx - 20, ly), (lx + 20, ly), (lx + 10, ly - 126), (lx - 10, ly - 126)], fill=add_alpha(mix(island, light, 0.28), 230))
        draw.rectangle((lx - 26, ly - 137, lx + 26, ly - 124), fill=add_alpha(mix(light, island, 0.2), 230))
        ellipse_blur(img, (lx - 170, ly - 210, lx + 170, ly - 20), add_alpha(light, 74), 48)
        draw.ellipse((lx - 10, ly - 138, lx + 10, ly - 118), fill=add_alpha(light, 245))

    if "sailboat" in spec["motifs"]:
        bx, by = 980, 560
        draw.polygon([(bx, by - 80), (bx, by + 20), (bx + 72, by + 20)], fill=(245, 250, 248, 185))
        draw.polygon([(bx - 8, by - 58), (bx - 8, by + 20), (bx - 64, by + 20)], fill=(225, 242, 244, 155))
        draw.line((bx, by - 86, bx, by + 26), fill=(255, 255, 255, 180), width=3)
        draw.rounded_rectangle((bx - 76, by + 21, bx + 82, by + 29), radius=8, fill=add_alpha(mix(sea, island, 0.45), 210))

    if "hammock" in spec["motifs"]:
        x1, y1, x2, y2 = 510, 654, 760, 650
        draw.line((x1, y1, x1 - 20, y1 - 100), fill=add_alpha(mix(island, light, 0.18), 220), width=8)
        draw.line((x2, y2, x2 + 24, y2 - 104), fill=add_alpha(mix(island, light, 0.18), 220), width=8)
        draw.arc((x1, y1 - 22, x2, y2 + 88), 5, 175, fill=add_alpha(light, 170), width=5)
        if "fireflies" in spec["motifs"]:
            for i in range(22):
                x = random.randint(390, 840)
                y = random.randint(500, 700)
                ellipse_blur(img, (x - 8, y - 8, x + 8, y + 8), (255, 239, 150, 70), 7)

    if "flowers" in spec["motifs"]:
        for i in range(80):
            x = random.randint(60, w - 60)
            y = random.randint(710, 890)
            c = random.choice([(255, 239, 168, 160), (255, 209, 148, 145), (255, 248, 210, 135)])
            draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=c)
    if "butterflies" in spec["motifs"]:
        for i in range(12):
            x = random.randint(220, 1320)
            y = random.randint(250, 520)
            draw.arc((x - 12, y - 9, x, y + 9), 40, 320, fill=(255, 248, 220, 135), width=2)
            draw.arc((x, y - 9, x + 12, y + 9), 220, 140, fill=(255, 248, 220, 135), width=2)

    if "rocks" in spec["motifs"] or "cliffs" in spec["motifs"]:
        for base_x in ([230, 330, 1220] if "rocks" in spec["motifs"] else [140, 220, 1260, 1380]):
            base_y = random.randint(650, 720)
            draw.polygon(
                [(base_x - 74, base_y + 18), (base_x - 20, base_y - 78), (base_x + 65, base_y + 16)],
                fill=add_alpha(mix(island, (0, 0, 0), 0.22), 230),
            )

    if "lightning" in spec["motifs"]:
        bolt = [(1160, 170), (1118, 296), (1162, 288), (1106, 428), (1210, 258), (1160, 268)]
        draw.line(bolt, fill=(255, 226, 152, 180), width=7)
        ellipse_blur(img, (990, 120, 1310, 440), (255, 205, 140, 54), 42)

    weather = spec["weather"]
    if weather in {"fog", "storm"}:
        fog_alpha = 92 if weather == "fog" else 52
        for i, y in enumerate([360, 445, 540]):
            layer = Image.new("RGBA", SIZE, (0, 0, 0, 0))
            ld = ImageDraw.Draw(layer)
            ld.rectangle((0, y, w, y + 135), fill=(230, 236, 242, fog_alpha - i * 18))
            layer = layer.filter(ImageFilter.GaussianBlur(35))
            img.alpha_composite(layer)

    if weather in {"light_rain", "rain", "storm"}:
        count = {"light_rain": 80, "rain": 150, "storm": 220}[weather]
        for i in range(count):
            x = random.randint(-60, w + 20)
            y = random.randint(0, h)
            length = random.randint(24, 52 if weather == "storm" else 38)
            slant = random.randint(8, 28 if weather == "storm" else 16)
            alpha = random.randint(42, 105)
            draw.line((x, y, x + slant, y + length), fill=(238, 246, 255, alpha), width=2 if weather == "storm" else 1)

    if weather == "storm":
        ellipse_blur(img, (-120, 40, 720, 260), (20, 16, 22, 95), 58)
        ellipse_blur(img, (670, 70, 1720, 300), (20, 16, 22, 90), 64)

    # bottom scrim keeps foreground UI readable over every generated image.
    scrim = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    for y in range(h):
        t = max(0, (y - 520) / 480)
        sd.line((0, y, w, y), fill=(3, 7, 14, int(95 * t)))
    img.alpha_composite(scrim)

    path = OUT_DIR / spec["file"]
    img.convert("RGB").save(path, "PNG", optimize=True)
    print(path.relative_to(ROOT))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for key, spec in SCENES.items():
        draw_scene(key, spec)


if __name__ == "__main__":
    main()
