#!/usr/bin/env python3
"""Generate the 2.5D Xinyu protagonist texture used by Blender.

The texture is a transparent, game-readable anime character card. Blender uses
it on a plane so the exported GLB keeps a clean silhouette without carrying a
heavy sculpt.
"""
from __future__ import annotations

import math
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "models" / "xy_char_game_protagonist_texture.png"
AI_SOURCE = ROOT / "frontend" / "public" / "models" / "xy_char_game_protagonist_ai_source.png"
W, H = 1024, 1536
SCALE = 3


Point = tuple[float, float]
Color = tuple[int, int, int, int]


def c(hex_value: str, alpha: int = 255) -> Color:
    value = hex_value.strip().lstrip("#")
    return (
        int(value[0:2], 16),
        int(value[2:4], 16),
        int(value[4:6], 16),
        alpha,
    )


def pts(values: list[Point]) -> list[tuple[int, int]]:
    return [(round(x * SCALE), round(y * SCALE)) for x, y in values]


def xy(x: float, y: float) -> tuple[int, int]:
    return round(x * SCALE), round(y * SCALE)


def ellipse(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    fill: Color,
    outline: Color | None = None,
    width: float = 1,
) -> None:
    scaled = tuple(round(v * SCALE) for v in box)
    draw.ellipse(scaled, fill=fill, outline=outline, width=max(1, round(width * SCALE)))


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    radius: float,
    fill: Color,
    outline: Color | None = None,
    width: float = 1,
) -> None:
    scaled = tuple(round(v * SCALE) for v in box)
    draw.rounded_rectangle(
        scaled,
        radius=round(radius * SCALE),
        fill=fill,
        outline=outline,
        width=max(1, round(width * SCALE)),
    )


def line(
    draw: ImageDraw.ImageDraw,
    values: list[Point],
    fill: Color,
    width: float = 2.0,
    joint: str = "curve",
) -> None:
    draw.line(pts(values), fill=fill, width=max(1, round(width * SCALE)), joint=joint)


def poly(
    draw: ImageDraw.ImageDraw,
    values: list[Point],
    fill: Color,
    outline: Color | None = None,
    width: float = 1,
) -> None:
    draw.polygon(pts(values), fill=fill)
    if outline:
        closed = values + [values[0]]
        line(draw, closed, outline, width)


def qbez(p0: Point, p1: Point, p2: Point, steps: int = 18) -> list[Point]:
    points: list[Point] = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1.0 - t
        points.append(
            (
                mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
                mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
            )
        )
    return points


def cbez(p0: Point, p1: Point, p2: Point, p3: Point, steps: int = 24) -> list[Point]:
    points: list[Point] = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1.0 - t
        points.append(
            (
                mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0],
                mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1],
            )
        )
    return points


def curve_poly(
    start: Point,
    segments: list[tuple[Point, Point, Point]],
    *,
    steps: int = 18,
) -> list[Point]:
    points = [start]
    current = start
    for p1, p2, p3 in segments:
        curve = cbez(current, p1, p2, p3, steps)
        points.extend(curve[1:])
        current = p3
    return points


def soft_shadow(layer: Image.Image, offset: tuple[int, int] = (0, 8), radius: int = 10, alpha: int = 90) -> Image.Image:
    mask = layer.getchannel("A")
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(radius * SCALE)).point(lambda p: min(alpha, p)))
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    out.alpha_composite(shadow, (offset[0] * SCALE, offset[1] * SCALE))
    out.alpha_composite(layer)
    return out


def squeeze_center(layer: Image.Image, factor: float) -> Image.Image:
    bbox = layer.getbbox()
    if not bbox:
        return layer
    crop = layer.crop(bbox)
    new_width = round(crop.width * factor)
    resized = crop.resize((new_width, crop.height), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    left = round(layer.size[0] * 0.5 - new_width * 0.5)
    out.alpha_composite(resized, (left, bbox[1]))
    return out


def add_poly_shadow(base: Image.Image, points: list[Point], fill: Color, blur: int = 8, offset: tuple[int, int] = (0, 5)) -> None:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer, "RGBA")
    d.polygon(pts(points), fill=fill)
    layer = layer.filter(ImageFilter.GaussianBlur(blur * SCALE))
    base.alpha_composite(layer, (offset[0] * SCALE, offset[1] * SCALE))


def add_blush(draw: ImageDraw.ImageDraw, x: float, y: float, rx: float, ry: float, alpha: int = 42) -> None:
    ellipse(draw, (x - rx, y - ry, x + rx, y + ry), c("efa6a0", alpha), None)


def clamp_channel(value: float) -> int:
    return max(0, min(255, int(round(value))))


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def sample_border_key(image: Image.Image) -> tuple[int, int, int]:
    width, height = image.size
    pixels = image.load()
    samples: list[tuple[int, int, int]] = []
    band = max(1, min(width, height) // 128)
    step = max(1, min(width, height) // 256)
    for x in range(0, width, step):
        for y in range(band):
            samples.append(pixels[x, y][:3])
            samples.append(pixels[x, height - 1 - y][:3])
    for y in range(0, height, step):
        for x in range(band):
            samples.append(pixels[x, y][:3])
            samples.append(pixels[width - 1 - x, y][:3])
    return (
        round(median(sample[0] for sample in samples)),
        round(median(sample[1] for sample in samples)),
        round(median(sample[2] for sample in samples)),
    )


def remove_magenta_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    key = sample_border_key(rgba)
    pixels = rgba.load()
    width, height = rgba.size
    transparent_threshold = 18.0
    opaque_threshold = 150.0
    for y in range(height):
        for x in range(width):
            red, green, blue, old_alpha = pixels[x, y]
            rgb = (red, green, blue)
            distance = max(abs(rgb[0] - key[0]), abs(rgb[1] - key[1]), abs(rgb[2] - key[2]))
            magenta_like = red > 140 and blue > 140 and min(red, blue) - green > 42 and abs(red - blue) < 96
            if not magenta_like:
                continue
            if distance <= transparent_threshold:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            alpha = clamp_channel(255 * smoothstep((distance - transparent_threshold) / (opaque_threshold - transparent_threshold)))
            alpha = round(alpha * old_alpha / 255)
            if alpha < 8:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            if alpha < 255:
                amount = alpha / 255.0
                cleaned = tuple(
                    clamp_channel((channel - key_channel * (1.0 - amount)) / max(amount, 0.01))
                    for channel, key_channel in zip(rgb, key)
                )
                pixels[x, y] = (*cleaned, alpha)
            else:
                pixels[x, y] = (red, green, blue, alpha)
    alpha = rgba.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(radius=0.25))
    rgba.putalpha(alpha)
    return rgba


def write_ai_texture() -> bool:
    if not AI_SOURCE.exists():
        return False
    with Image.open(AI_SOURCE) as source:
        texture = remove_magenta_background(source)
    if texture.size != (W, H):
        texture = texture.resize((W, H), Image.Resampling.LANCZOS)
    texture.save(OUT)
    print(f"texture source -> {AI_SOURCE}")
    print(f"texture -> {OUT} ({OUT.stat().st_size} bytes)")
    return True


def draw_lighthouse(draw: ImageDraw.ImageDraw, x: float, y: float, scale: float, ink: Color) -> None:
    line(draw, [(x, y - 34 * scale), (x - 12 * scale, y + 24 * scale)], ink, 1.7 * scale)
    line(draw, [(x, y - 34 * scale), (x + 12 * scale, y + 24 * scale)], ink, 1.7 * scale)
    line(draw, [(x - 18 * scale, y - 20 * scale), (x + 18 * scale, y - 20 * scale)], ink, 1.9 * scale)
    line(draw, [(x - 12 * scale, y - 2 * scale), (x + 12 * scale, y - 2 * scale)], ink, 1.9 * scale)
    line(draw, [(x - 20 * scale, y + 24 * scale), (x + 20 * scale, y + 24 * scale)], ink, 1.9 * scale)
    line(
        draw,
        [
            (x - 42 * scale, y + 45 * scale),
            (x - 18 * scale, y + 39 * scale),
            (x + 10 * scale, y + 45 * scale),
            (x + 42 * scale, y + 38 * scale),
        ],
        ink,
        1.8 * scale,
    )


def draw_shell(draw: ImageDraw.ImageDraw, x: float, y: float, scale: float) -> None:
    shell = c("f3dcad")
    shell_shadow = c("d6b578")
    gold = c("bd8a43")
    outline = c("745e49", 168)
    fan = curve_poly(
        (x, y - 50 * scale),
        [
            ((x - 34 * scale, y - 34 * scale), (x - 55 * scale, y + 18 * scale), (x - 33 * scale, y + 52 * scale)),
            ((x - 18 * scale, y + 68 * scale), (x + 18 * scale, y + 68 * scale), (x + 33 * scale, y + 52 * scale)),
            ((x + 55 * scale, y + 18 * scale), (x + 34 * scale, y - 34 * scale), (x, y - 50 * scale)),
        ],
        steps=15,
    )
    poly(draw, fan, shell, outline, 1.4 * scale)
    poly(
        draw,
        [(x - 30 * scale, y + 42 * scale), (x, y + 60 * scale), (x + 30 * scale, y + 42 * scale), (x + 18 * scale, y + 58 * scale), (x, y + 66 * scale), (x - 18 * scale, y + 58 * scale)],
        c("f7e7c7", 180),
        None,
    )
    for t in (-0.70, -0.42, -0.16, 0.16, 0.42, 0.70):
        line(draw, [(x, y - 40 * scale), (x + 46 * t * scale, y + 48 * scale)], shell_shadow, 1.55 * scale)
    line(draw, [(x - 28 * scale, y + 50 * scale), (x, y + 66 * scale), (x + 28 * scale, y + 50 * scale)], gold, 1.5 * scale)
    ellipse(draw, (x - 9 * scale, y + 64 * scale, x + 9 * scale, y + 88 * scale), c("48aec3"), c("2f7987", 130), 0.8 * scale)


def draw_hand(draw: ImageDraw.ImageDraw, x: float, y: float, side: int, skin: Color, outline: Color) -> None:
    palm = curve_poly(
        (x - side * 14, y - 38),
        [
            ((x + side * 18, y - 46), (x + side * 36, y - 18), (x + side * 28, y + 16)),
            ((x + side * 18, y + 52), (x - side * 26, y + 52), (x - side * 28, y + 12)),
            ((x - side * 30, y - 14), (x - side * 26, y - 30), (x - side * 14, y - 38)),
        ],
        steps=12,
    )
    poly(draw, palm, skin, outline, 0.8)
    for i in range(4):
        fx = x + side * (2 + i * 7)
        line(draw, [(fx, y + 10), (fx + side * 3, y + 37)], c("c98870", 55), 0.8)


def draw_boot(draw: ImageDraw.ImageDraw, cx: float, y: float, side: int, outline: Color) -> None:
    boot = c("efe0c8")
    sole = c("5b4030")
    trim = c("2d8799")
    shadow = c("cfb994")
    upper = curve_poly(
        (cx - 54, y - 92),
        [
            ((cx - 50, y - 124), (cx + 43, y - 124), (cx + 50, y - 92)),
            ((cx + 60, y - 42), (cx + 74, y - 8), (cx + 102 * side, y + 3)),
            ((cx + 50 * side, y + 31), (cx - 54 * side, y + 26), (cx - 70 * side, y + 8)),
            ((cx - 62, y - 20), (cx - 62, y - 62), (cx - 54, y - 92)),
        ],
        steps=10,
    )
    if side < 0:
        upper = [(2 * cx - px, py) for px, py in upper]
    poly(draw, upper, boot, outline, 1.2)
    poly(draw, [(cx - 58, y - 105), (cx + 45, y - 105), (cx + 52, y - 78), (cx - 48, y - 76)], c("f6ead8"), c("988b7b", 80), 0.7)
    line(draw, [(cx - 48, y - 72), (cx + 44, y - 88)], trim, 2.2)
    for i in range(4):
        yy = y - 55 + i * 19
        line(draw, [(cx - 32, yy), (cx + 34, yy + 9)], trim, 2.0)
    poly(draw, [(cx - 82, y + 10), (cx + 86, y + 10), (cx + 98, y + 44), (cx - 92, y + 44)], sole, None)
    line(draw, [(cx - 38, y - 104), (cx - 46, y + 5)], shadow, 2)


def draw_hair_lock(
    draw: ImageDraw.ImageDraw,
    root: Point,
    ctrl_l: Point,
    tip: Point,
    ctrl_r: Point,
    fill: Color,
    outline: Color | None,
    width: float = 1.1,
) -> None:
    left = qbez(root, ctrl_l, tip, 12)
    right = qbez(tip, ctrl_r, root, 12)
    poly(draw, left + right[1:], fill, outline, width)


def draw_character(base: Image.Image) -> None:
    draw = ImageDraw.Draw(base, "RGBA")
    outline = c("27303c", 150)
    ink = c("1b2431", 210)
    soft_ink = c("4d5360", 110)
    hair = c("2c3545")
    hair_dark = c("182131")
    hair_mid = c("4b5667")
    hair_light = c("6d7685", 110)
    teal = c("2aa9bb")
    teal_dark = c("147186")
    skin = c("efc1a5")
    skin_hi = c("f8d0b6")
    skin_shadow = c("c98369", 88)
    ivory = c("f4ead8")
    ivory_hi = c("fff8ec")
    ivory_shadow = c("d6c7ad")
    cloth_shadow = c("b9ad9b", 95)
    shirt = c("fff8ea")
    pants = c("829ba0")
    pants_shadow = c("5e757b")
    pants_hi = c("a5b8ba", 125)
    trim = c("4fb6c8")
    trim_dark = c("2d8799")
    leather = c("9d7954")
    leather_dark = c("503729")
    gold = c("c28e42")

    # Back silhouette: cape, blue lining, and hood. The curves keep the shape
    # readable as a game sprite while avoiding the previous blocky shoulders.
    cape_back = curve_poly(
        (312, 520),
        [
            ((365, 458), (458, 440), (512, 462)),
            ((566, 440), (659, 458), (712, 520)),
            ((750, 654), (738, 908), (642, 1118)),
            ((578, 1208), (446, 1208), (382, 1118)),
            ((286, 908), (274, 654), (312, 520)),
        ],
        steps=18,
    )
    add_poly_shadow(base, cape_back, c("141820", 58), blur=9, offset=(0, 8))
    poly(draw, cape_back, c("efe4d2", 236), c("756b5d", 78), 1.2)
    poly(draw, [(304, 706), (230, 902), (268, 1118), (384, 952), (372, 690)], c("4b9bae", 112), c("164b5a", 82), 1.0)
    poly(draw, [(720, 706), (794, 902), (756, 1118), (640, 952), (652, 690)], c("4b9bae", 112), c("164b5a", 82), 1.0)
    line(draw, qbez((344, 840), (512, 900), (680, 840), 28), trim, 3.4)
    draw_lighthouse(draw, 512, 666, 0.42, c("597484", 78))
    line(draw, [(360, 1042), (470, 1080), (512, 1094), (554, 1080), (664, 1042)], c("b4a996", 74), 1.4)

    # Legs, cropped wide trousers, socks, and boots.
    for side in (-1, 1):
        cx = 440 if side < 0 else 584
        inner = 512 - side * 18
        outer_top = cx + side * 68
        pant = curve_poly(
            (inner, 792),
            [
                ((cx - side * 14, 880), (cx - side * 34, 1050), (cx - side * 42, 1232)),
                ((cx + side * 28, 1260), (cx + side * 96, 1228), (outer_top + side * 10, 1172)),
                ((outer_top + side * 18, 1020), (outer_top + side * 18, 892), (outer_top, 794)),
                ((cx + side * 20, 810), (cx - side * 12, 810), (inner, 792)),
            ],
            steps=15,
        )
        poly(draw, pant, pants, c("334955", 90), 1.0)
        shade = [(outer_top, 808), (outer_top + side * 8, 1168), (cx + side * 42, 1222), (cx + side * 4, 832)]
        poly(draw, shade, pants_shadow, None)
        poly(draw, [(cx - 38, 800), (cx + 46, 812), (cx + 26, 1228), (cx - 50, 1218)], pants_hi, None)
        line(draw, [(cx + side * 34, 850), (cx + side * 26, 1052), (cx + side * 18, 1210)], c("2c5964", 150), 1.6)
        line(draw, qbez((cx - 66, 1206), (cx, 1234), (cx + 72, 1207), 16), trim_dark, 2.6)
        rounded_rect(draw, (cx - 62, 1214, cx + 62, 1264), 6, ivory, c("8d8173", 80), 0.8)
        line(draw, [(cx - 50, 1234), (cx + 44, 1228)], c("d7cab7"), 2)
        poly(draw, [(cx - 25, 1252), (cx + 25, 1252), (cx + 21, 1376), (cx - 21, 1376)], skin, None)
        line(draw, [(cx - 14, 1260), (cx - 18, 1364)], c("d28f72", 95), 1.2)
        line(draw, [(cx + 15, 1260), (cx + 16, 1362)], c("f7d0b6", 110), 1.2)
        draw_boot(draw, cx, 1466, side, outline)

    # Arms and loose sleeves sit behind the cape front.
    for side in (-1, 1):
        sx = -1 if side < 0 else 1
        sleeve = curve_poly(
            (512 + sx * 164, 588),
            [
                ((512 + sx * 230, 632), (512 + sx * 280, 730), (512 + sx * 274, 838)),
                ((512 + sx * 258, 894), (512 + sx * 220, 922), (512 + sx * 192, 904)),
                ((512 + sx * 170, 800), (512 + sx * 136, 674), (512 + sx * 164, 588)),
            ],
            steps=14,
        )
        poly(draw, sleeve, ivory, c("7a7166", 70), 1.0)
        line(draw, [(512 + sx * 194, 860), (512 + sx * 248, 894), (512 + sx * 292, 866)], trim, 2.8)
        forearm = curve_poly(
            (512 + sx * 250, 890),
            [
                ((512 + sx * 292, 946), (512 + sx * 312, 1058), (512 + sx * 302, 1162)),
                ((512 + sx * 282, 1180), (512 + sx * 254, 1166), (512 + sx * 240, 1132)),
                ((512 + sx * 252, 1038), (512 + sx * 222, 940), (512 + sx * 250, 890)),
            ],
            steps=11,
        )
        poly(draw, forearm, skin, c("b37a62", 62), 0.8)
        draw_hand(draw, 512 + sx * 288, 1202, sx, skin_hi, c("9b6958", 62))

    # Torso, shirt, poncho front panels, collar, belt, and accessories.
    torso = curve_poly(
        (412, 492),
        [
            ((458, 458), (564, 458), (612, 494)),
            ((664, 636), (666, 808), (604, 980)),
            ((565, 1050), (460, 1050), (420, 980)),
            ((358, 808), (360, 636), (412, 492)),
        ],
        steps=14,
    )
    poly(draw, torso, shirt, None)
    left_panel = curve_poly(
        (342, 492),
        [
            ((394, 474), (460, 496), (506, 548)),
            ((482, 702), (470, 868), (434, 1028)),
            ((374, 1038), (326, 966), (312, 788)),
            ((306, 638), (318, 536), (342, 492)),
        ],
        steps=16,
    )
    right_panel = [(1024 - x, y) for x, y in left_panel]
    poly(draw, left_panel, ivory, c("786f62", 78), 1.0)
    poly(draw, right_panel, ivory, c("786f62", 78), 1.0)
    poly(draw, [(452, 520), (512, 596), (572, 520), (552, 790), (512, 842), (472, 790)], shirt, c("b8aa98", 80), 0.8)
    line(draw, [(512, 576), (512, 990)], c("c0b19c", 105), 1.4)
    line(draw, [(366, 736), (444, 788), (512, 842), (580, 788), (658, 736)], trim, 4.0)
    line(draw, [(342, 894), (432, 938), (492, 918)], trim, 3.0)
    line(draw, [(682, 894), (592, 938), (532, 918)], trim, 3.0)
    for x in (454, 512, 570):
        ellipse(draw, (x - 11, 802, x + 11, 824), gold, c("76552d", 80), 0.7)
    rounded_rect(draw, (386, 966, 638, 1010), 3, leather_dark, None)
    line(draw, [(628, 560), (578, 748), (510, 988), (438, 1230)], leather, 9.0)
    line(draw, [(636, 558), (584, 748), (516, 990), (446, 1230)], c("583c28", 140), 1.8)
    line(draw, [(416, 584), (486, 720), (512, 838)], leather, 3.8)
    line(draw, [(608, 584), (538, 720), (512, 838)], leather, 3.8)
    ellipse(draw, (497, 804, 527, 834), gold, c("76552d", 80), 0.7)
    draw_shell(draw, 512, 884, 0.56)

    # Hood/collar on top of the torso.
    hood = curve_poly(
        (330, 452),
        [
            ((386, 402), (462, 408), (512, 436)),
            ((562, 408), (638, 402), (694, 452)),
            ((672, 512), (598, 548), (512, 550)),
            ((426, 548), (352, 512), (330, 452)),
        ],
        steps=18,
    )
    poly(draw, hood, ivory_shadow, c("8a8071", 66), 0.9)
    line(draw, qbez((330, 502), (512, 570), (694, 502), 25), c("908675", 115), 3.0)
    poly(draw, [(474, 538), (550, 538), (544, 678), (480, 678)], skin, None)
    line(draw, [(492, 562), (488, 666)], c("d29274", 95), 1.4)
    line(draw, [(532, 562), (536, 666)], c("f8d5bf", 115), 1.4)

    # Satchel, placed with the same shell/lighthouse motif as the reference.
    rounded_rect(draw, (286, 1000, 436, 1216), 8, leather, c("5d422f", 150), 1.3)
    flap = curve_poly(
        (300, 1018),
        [
            ((334, 1008), (390, 1010), (424, 1028)),
            ((418, 1104), (386, 1154), (356, 1186)),
            ((326, 1154), (304, 1118), (300, 1018)),
        ],
        steps=12,
    )
    poly(draw, flap, c("ded0b8"), None)
    line(draw, [(306, 1134), (356, 1186), (418, 1128)], trim, 3.0)
    draw_lighthouse(draw, 356, 1080, 0.34, c("4c6d7c", 150))
    ellipse(draw, (344, 1168, 368, 1192), gold, c("76552d", 70), 0.6)

    # Head and face: smaller, softer, and less toy-like.
    face = curve_poly(
        (410, 204),
        [
            ((430, 150), (482, 128), (512, 132)),
            ((548, 128), (600, 150), (620, 204)),
            ((650, 286), (628, 392), (578, 444)),
            ((548, 476), (476, 476), (446, 444)),
            ((396, 392), (374, 286), (410, 204)),
        ],
        steps=18,
    )
    poly(draw, face, skin, None)
    poly(draw, [(420, 238), (384, 336), (420, 426), (446, 444), (416, 344)], c("e7b395", 115), None)
    add_blush(draw, 446, 354, 21, 7, 44)
    add_blush(draw, 578, 354, 21, 7, 44)

    # Hair cap and layered locks.
    hair_back = curve_poly(
        (356, 232),
        [
            ((382, 128), (474, 82), (512, 116)),
            ((566, 76), (658, 138), (688, 238)),
            ((668, 302), (640, 336), (612, 354)),
            ((586, 270), (552, 244), (512, 246)),
            ((472, 244), (438, 270), (412, 354)),
            ((384, 336), (356, 302), (356, 232)),
        ],
        steps=16,
    )
    poly(draw, hair_back, hair, None)
    line(draw, qbez((414, 150), (512, 94), (610, 154), 24), hair_light, 2.0)
    locks = [
        ((450, 136), (410, 214), (392, 334), (438, 292), hair),
        ((486, 118), (462, 216), (476, 382), (522, 260), hair_mid),
        ((526, 118), (552, 218), (532, 370), (490, 260), hair),
        ((572, 136), (616, 214), (624, 334), (584, 288), hair_mid),
        ((410, 188), (378, 268), (386, 410), (430, 350), hair_dark),
        ((616, 188), (646, 270), (638, 410), (592, 350), hair_dark),
        ((374, 286), (320, 344), (354, 410), (402, 342), hair),
        ((650, 286), (704, 344), (670, 410), (622, 342), hair),
        ((398, 376), (360, 462), (388, 538), (420, 448), hair_dark),
        ((626, 376), (664, 462), (636, 538), (604, 448), hair_dark),
    ]
    for root, ctrl_l, tip, ctrl_r, fill in locks:
        draw_hair_lock(draw, root, ctrl_l, tip, ctrl_r, fill, c("121a27", 84), 0.8)
    for root, ctrl_l, tip, ctrl_r in [
        ((430, 188), (408, 248), (418, 340), (448, 270)),
        ((510, 136), (500, 238), (496, 360), (528, 246)),
        ((584, 184), (610, 250), (594, 346), (564, 270)),
    ]:
        draw_hair_lock(draw, root, ctrl_l, tip, ctrl_r, c("5c6675", 88), None)
    draw_hair_lock(draw, (390, 342), (354, 430), (366, 518), (398, 454), teal, c("0e5665", 88), 0.7)
    draw_hair_lock(draw, (634, 342), (670, 430), (658, 518), (626, 454), teal, c("0e5665", 88), 0.7)
    line(draw, [(512, 112), (500, 58), (546, 76), (520, 106)], hair_dark, 4.4)
    ellipse(draw, (629, 240, 650, 262), gold, c("735322", 100), 0.7)

    # Eyes: lower height, cleaner eyelids, smaller pupils.
    for side in (-1, 1):
        ex = 468 if side < 0 else 556
        eye_shape = curve_poly(
            (ex - 32, 298),
            [
                ((ex - 15, 281), (ex + 16, 281), (ex + 33, 298)),
                ((ex + 16, 316), (ex - 15, 316), (ex - 32, 298)),
            ],
            steps=10,
        )
        poly(draw, eye_shape, c("f9fbfb"), c("2b3340", 138), 0.8)
        ellipse(draw, (ex - 11, 287, ex + 11, 316), c("7597aa"), None)
        ellipse(draw, (ex - 5, 292, ex + 5, 316), c("172030"), None)
        ellipse(draw, (ex - 9, 291, ex - 4, 297), c("ffffff", 230), None)
        line(draw, [(ex - 35, 297), (ex - 12, 285), (ex + 34, 297)], ink, 2.0)
        line(draw, [(ex - 24, 324), (ex - 2, 330), (ex + 24, 323)], c("8c6557", 56), 0.8)
        line(draw, [(ex - 30, 266), (ex + 3, 255), (ex + 36, 263)], hair_dark, 1.6)
    line(draw, [(512, 332), (506, 362), (512, 372)], c("bf8069", 105), 1.0)
    line(draw, qbez((492, 410), (512, 424), (534, 410), 12), ink, 1.5)
    line(draw, qbez((492, 411), (512, 431), (534, 411), 12), c("d38b82", 50), 1.0)
    for root, ctrl_l, tip, ctrl_r, fill in [
        ((486, 118), (464, 214), (478, 360), (520, 254), hair_mid),
        ((526, 118), (552, 214), (534, 352), (492, 254), hair),
        ((450, 136), (412, 212), (400, 322), (438, 290), hair),
        ((572, 136), (612, 212), (616, 322), (584, 290), hair_mid),
    ]:
        draw_hair_lock(draw, root, ctrl_l, tip, ctrl_r, fill, c("121a27", 68), 0.6)
    line(draw, qbez((442, 158), (512, 112), (582, 158), 18), c("718092", 88), 1.2)

    # Small front garment details after head pass.
    for x in (424, 600):
        line(draw, [(x, 544), (x - 18 if x < 512 else x + 18, 710), (x - 10 if x < 512 else x + 10, 932)], cloth_shadow, 1.2)
    for x in (392, 632):
        line(draw, [(x, 650), (x + (30 if x < 512 else -30), 900)], c("786f62", 62), 1.1)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if write_ai_texture():
        return

    canvas = Image.new("RGBA", (W * SCALE, H * SCALE), (0, 0, 0, 0))
    char_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw_character(char_layer)
    char_layer = squeeze_center(char_layer, 0.86)
    canvas.alpha_composite(soft_shadow(char_layer, offset=(0, 10), radius=10, alpha=72))
    canvas = canvas.resize((W, H), Image.Resampling.LANCZOS)
    canvas.save(OUT)
    print(f"texture -> {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
