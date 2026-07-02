# -*- coding: utf-8 -*-
"""
Xinyu protagonist turnaround replica.

Builds a non-destructive reference-focused variant of the existing procedural
protagonist. The output keeps the same rig-friendly object hierarchy as
xy_protagonist.py, then adds extra visible modeling details from the provided
turnaround sheet: layered hair locks, cream hooded cape with blue wave trim,
rope shell pendant, cross cords, satchel charms, trouser decals, boot laces,
and pearl/gold sea details.

Run:
  blender --background --python blender/xy_turnaround_replica.py

Outputs:
  frontend/public/models/xy_char_turnaround_replica.glb
  frontend/public/models/xy_char_turnaround_replica.blend
  docs/screenshots/xy_char_turnaround_replica.png
"""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "frontend" / "public" / "models"
SHOT = ROOT / "docs" / "screenshots"
NAME = "xy_char_turnaround_replica"
OFF = 0.40
HEAD_Z = 1.54 + OFF


def srgb_channel(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def hex_color(value: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    value = value.strip().lstrip("#")
    return (
        srgb_channel(int(value[0:2], 16) / 255.0),
        srgb_channel(int(value[2:4], 16) / 255.0),
        srgb_channel(int(value[4:6], 16) / 255.0),
        alpha,
    )


def make_mat(
    name: str,
    color: str,
    *,
    alpha: float = 1.0,
    roughness: float = 0.82,
    metallic: float = 0.0,
    emission: str | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = hex_color(color, alpha)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = hex_color(color, alpha)
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if emission and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = hex_color(emission, 1.0)
        if emission and "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        mat.blend_method = "BLEND"
        mat.use_screen_refraction = True
        mat.show_transparent_back = True
    return mat


def get_palette() -> dict[str, bpy.types.Material]:
    return {
        "cream": make_mat("XYTR_ivory_cloak_highlight", "#f8f0de", roughness=0.9),
        "cream_shadow": make_mat("XYTR_warm_cloak_shadow", "#dfd3b8", roughness=0.92),
        "blue_trim": make_mat("XYTR_sea_blue_wave_trim", "#6aaec1", roughness=0.78),
        "blue_dark": make_mat("XYTR_deep_teal_trim_shadow", "#355f70", roughness=0.84),
        "teal": make_mat("XYTR_hair_teal_streak", "#2c91a3", roughness=0.7),
        "hair": make_mat("XYTR_extra_inky_hair", "#2f3445", roughness=0.76),
        "hair_hi": make_mat("XYTR_extra_hair_highlight", "#4a566a", roughness=0.72),
        "gold": make_mat("XYTR_brushed_shell_gold", "#c79a52", roughness=0.42, metallic=0.22),
        "leather": make_mat("XYTR_sandy_leather", "#8b765d", roughness=0.72),
        "leather_dark": make_mat("XYTR_dark_leather_edges", "#574637", roughness=0.74),
        "shell": make_mat("XYTR_warm_shell", "#f0d9aa", roughness=0.67),
        "shell_line": make_mat("XYTR_shell_rib_gold", "#c49350", roughness=0.48, metallic=0.18),
        "pearl": make_mat("XYTR_moon_pearl", "#eaf1ec", roughness=0.36),
        "water": make_mat("XYTR_blue_glass_drop", "#42a6bd", alpha=0.78, roughness=0.25),
        "ink": make_mat("XYTR_faded_lighthouse_ink", "#557083", alpha=0.78, roughness=0.9),
        "lace": make_mat("XYTR_boot_lace_bluegray", "#5f8794", roughness=0.74),
    }


def assign(obj: bpy.types.Object, mat: bpy.types.Material) -> bpy.types.Object:
    obj.data.materials.append(mat)
    return obj


def shade_smooth(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth()
    finally:
        obj.select_set(False)


def parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> bpy.types.Object:
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.matrix_world = world
    return obj


def add_curve(
    name: str,
    points: list[tuple[float, float, float]],
    mat: bpy.types.Material,
    *,
    bevel: float = 0.008,
    resolution: int = 3,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (co[0], co[1], co[2], 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def add_cylinder_between(
    name: str,
    p0: tuple[float, float, float],
    p1: tuple[float, float, float],
    radius: float,
    mat: bpy.types.Material,
    *,
    vertices: int = 12,
) -> bpy.types.Object:
    a = Vector(p0)
    b = Vector(p1)
    axis = b - a
    length = axis.length
    if length < 1e-5:
        raise ValueError(f"{name} has zero length")
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=length, location=(a + b) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
    assign(obj, mat)
    shade_smooth(obj)
    return obj


def add_tapered_between(
    name: str,
    p0: tuple[float, float, float],
    p1: tuple[float, float, float],
    radius0: float,
    radius1: float,
    mat: bpy.types.Material,
    *,
    vertices: int = 10,
) -> bpy.types.Object:
    a = Vector(p0)
    b = Vector(p1)
    axis = b - a
    length = axis.length
    if length < 1e-5:
        raise ValueError(f"{name} has zero length")
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius0,
        radius2=radius1,
        depth=length,
        location=(a + b) * 0.5,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
    assign(obj, mat)
    shade_smooth(obj)
    return obj


def add_sphere(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    segments: int = 24,
    rings: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    assign(obj, mat)
    shade_smooth(obj)
    return obj


def add_box(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    if bevel > 0:
        mod = obj.modifiers.new(name="soft bevel", type="BEVEL")
        mod.width = bevel
        mod.segments = 3
        obj.modifiers.new(name="weighted normals", type="WEIGHTED_NORMAL")
    return obj


def add_panel(
    name: str,
    verts: list[tuple[float, float, float]],
    mat: bpy.types.Material,
    *,
    two_sided: bool = False,
) -> bpy.types.Object:
    faces = [(0, 1, 2, 3)]
    if two_sided:
        faces.append((3, 2, 1, 0))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def add_shell(
    name: str,
    loc: tuple[float, float, float],
    width: float,
    height: float,
    mats: dict[str, bpy.types.Material],
    *,
    forward_y: float = 0.0,
) -> list[bpy.types.Object]:
    x0, y0, z0 = loc
    half = width * 0.5
    verts = [(x0, y0 + forward_y, z0 + height * 0.44)]
    for i in range(13):
        t = -1.0 + 2.0 * i / 12.0
        x = x0 + t * half
        z = z0 - height * (0.30 + 0.12 * abs(t)) + height * 0.08 * math.cos(t * math.pi)
        verts.append((x, y0 + forward_y, z))
    faces = []
    for i in range(1, 13):
        faces.append((0, i, i + 1))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    shell = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(shell)
    shell.data.materials.append(mats["shell"])

    rib_objs = [shell]
    for t in (-0.72, -0.45, -0.22, 0.0, 0.22, 0.45, 0.72):
        rib_objs.append(
            add_cylinder_between(
                f"{name}_rib_{t:+.2f}",
                (x0, y0 + forward_y + 0.006, z0 + height * 0.39),
                (x0 + t * half * 0.92, y0 + forward_y + 0.008, z0 - height * 0.33),
                0.0038,
                mats["shell_line"],
                vertices=6,
            )
        )
    rib_objs.append(add_sphere(f"{name}_drop", (x0, y0 + forward_y + 0.012, z0 - height * 0.52), (0.014, 0.009, 0.026), mats["water"], segments=16, rings=8))
    return rib_objs


def add_lighthouse_mark(
    prefix: str,
    x: float,
    y: float,
    z: float,
    scale: float,
    mats: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objs: list[bpy.types.Object] = []
    ink = mats["ink"]
    objs.append(add_box(f"{prefix}_tower", (x, y, z), (0.030 * scale, 0.006, 0.130 * scale), ink, bevel=0.002 * scale))
    objs.append(add_box(f"{prefix}_tower_top", (x, y, z + 0.077 * scale), (0.068 * scale, 0.006, 0.026 * scale), ink, bevel=0.002 * scale))
    objs.append(add_box(f"{prefix}_tower_base", (x, y, z - 0.073 * scale), (0.094 * scale, 0.006, 0.018 * scale), ink, bevel=0.002 * scale))
    for dz in (-0.035, 0.006, 0.045):
        objs.append(add_box(f"{prefix}_stripe_{dz:+.2f}", (x, y + 0.002, z + dz * scale), (0.058 * scale, 0.006, 0.009 * scale), ink))
    for side in (-1, 1):
        objs.append(
            add_curve(
                f"{prefix}_ray_{side}",
                [
                    (x + 0.05 * side * scale, y, z + 0.055 * scale),
                    (x + 0.12 * side * scale, y, z + 0.070 * scale),
                ],
                ink,
                bevel=0.0025 * scale,
            )
        )
    for row, dz in enumerate((-0.105, -0.125)):
        pts = []
        for i in range(9):
            t = -1.0 + i / 4.0
            pts.append((x + t * 0.11 * scale, y, z + dz * scale + math.sin((t + row) * math.pi) * 0.012 * scale))
        objs.append(add_curve(f"{prefix}_wave_{row}", pts, ink, bevel=0.0035 * scale))
    return objs


def set_expression(name: str) -> None:
    for face in ("Face_Cheerful", "Face_Calm", "Face_Determined", "Face_Curious"):
        obj = bpy.data.objects.get(face)
        if not obj:
            continue
        hidden = face != name
        obj.hide_render = hidden
        obj.hide_viewport = hidden


def tune_existing_materials() -> None:
    overrides = {
        "Hair": "#303546",
        "HairHi": "#4a566a",
        "Cape": "#f7efdf",
        "CapeShade": "#dfd4ba",
        "Hood": "#f1e6cf",
        "Pants": "#81969a",
        "Satchel": "#90765a",
        "SatchelFlap": "#e8dcc4",
        "Boot": "#e8dcc7",
        "TrimBlue": "#6aaec1",
        "RopeCord": "#b6a58e",
    }
    for mat in bpy.data.materials:
        color = overrides.get(mat.name)
        if not color:
            continue
        mat.diffuse_color = hex_color(color, mat.diffuse_color[3] if mat.diffuse_color else 1.0)
        if mat.use_nodes:
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf and "Base Color" in bsdf.inputs:
                bsdf.inputs["Base Color"].default_value = mat.diffuse_color


def add_hair_polish(body: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    locks = [
        ("front_mid", (0.000, 0.205, HEAD_Z + 0.225), (0.012, 0.258, HEAD_Z - 0.018), 0.030, mats["hair"]),
        ("front_l", (-0.082, 0.205, HEAD_Z + 0.205), (-0.128, 0.255, HEAD_Z - 0.018), 0.027, mats["hair_hi"]),
        ("front_r", (0.082, 0.205, HEAD_Z + 0.205), (0.128, 0.255, HEAD_Z - 0.018), 0.027, mats["hair"]),
        ("cheek_l", (-0.215, 0.118, HEAD_Z + 0.060), (-0.270, 0.165, HEAD_Z - 0.165), 0.030, mats["hair"]),
        ("cheek_r", (0.215, 0.118, HEAD_Z + 0.060), (0.270, 0.165, HEAD_Z - 0.165), 0.030, mats["hair"]),
        ("back_l", (-0.180, -0.170, HEAD_Z + 0.035), (-0.292, -0.225, HEAD_Z - 0.145), 0.038, mats["hair"]),
        ("back_r", (0.180, -0.170, HEAD_Z + 0.035), (0.292, -0.225, HEAD_Z - 0.145), 0.038, mats["hair"]),
        ("side_flip_l", (-0.242, -0.025, HEAD_Z + 0.075), (-0.350, -0.035, HEAD_Z + 0.142), 0.028, mats["hair_hi"]),
        ("side_flip_r", (0.242, -0.025, HEAD_Z + 0.075), (0.350, -0.035, HEAD_Z + 0.142), 0.028, mats["hair_hi"]),
    ]
    for name, p0, p1, radius, mat in locks:
        obj = add_tapered_between(f"XYTR_hair_lock_{name}", p0, p1, radius, max(0.006, radius * 0.22), mat, vertices=9)
        parent_keep_world(obj, body)

    streaks = [
        [(-0.215, 0.160, HEAD_Z + 0.050), (-0.235, 0.185, HEAD_Z - 0.055), (-0.225, 0.172, HEAD_Z - 0.175)],
        [(0.220, -0.060, HEAD_Z + 0.080), (0.300, -0.070, HEAD_Z + 0.115), (0.335, -0.055, HEAD_Z + 0.080)],
    ]
    for i, pts in enumerate(streaks):
        parent_keep_world(add_curve(f"XYTR_teal_hair_streak_{i}", pts, mats["teal"], bevel=0.010), body)

    for obj in (
        add_sphere("XYTR_gold_hair_pin", (0.175, 0.145, HEAD_Z + 0.120), (0.026, 0.012, 0.026), mats["gold"], segments=16, rings=8),
        add_sphere("XYTR_blue_hair_bead", (0.196, 0.152, HEAD_Z + 0.100), (0.017, 0.010, 0.022), mats["water"], segments=16, rings=8),
    ):
        parent_keep_world(obj, body)


def add_cape_polish(body: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    # Extra folded hood lip and front drape seams.
    curves = [
        ("hood_lip", [(-0.225, -0.040, 1.730), (-0.080, -0.100, 1.805), (0.080, -0.100, 1.805), (0.225, -0.040, 1.730)], mats["cream_shadow"], 0.016),
        ("front_wave_l", [(-0.340, 0.205, 1.420), (-0.220, 0.235, 1.365), (-0.080, 0.228, 1.405)], mats["blue_trim"], 0.010),
        ("front_wave_r", [(0.340, 0.205, 1.420), (0.220, 0.235, 1.365), (0.080, 0.228, 1.405)], mats["blue_trim"], 0.010),
        ("back_wave_0", [(-0.340, -0.390, 1.270), (-0.160, -0.420, 1.225), (0.030, -0.420, 1.255), (0.280, -0.390, 1.215)], mats["blue_trim"], 0.012),
        ("back_wave_1", [(-0.330, -0.392, 1.205), (-0.120, -0.425, 1.170), (0.100, -0.425, 1.195), (0.330, -0.392, 1.150)], mats["blue_dark"], 0.010),
    ]
    for name, pts, mat, bevel in curves:
        parent_keep_world(add_curve(f"XYTR_cape_{name}", pts, mat, bevel=bevel), body)

    for sx in (-1, 1):
        panel = add_panel(
            f"XYTR_translucent_side_cape_{'L' if sx < 0 else 'R'}",
            [
                (0.285 * sx, -0.050, 1.595),
                (0.475 * sx, -0.100, 1.455),
                (0.525 * sx, -0.125, 0.910),
                (0.310 * sx, -0.090, 1.060),
            ],
            make_mat(f"XYTR_side_cape_blue_{sx}", "#6aaec1", alpha=0.42, roughness=0.65),
        )
        parent_keep_world(panel, body)
        parent_keep_world(add_curve(f"XYTR_side_cape_edge_{sx}", [(0.475 * sx, -0.101, 1.455), (0.525 * sx, -0.126, 0.910)], mats["blue_trim"], bevel=0.007), body)

    for obj in add_lighthouse_mark("XYTR_back_cape_lighthouse", 0.0, -0.432, 1.435, 1.00, mats):
        parent_keep_world(obj, body)


def add_front_accessories(body: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    cords = [
        ("cross_l", [(-0.165, 0.255, 1.625), (-0.060, 0.275, 1.520), (0.010, 0.278, 1.430)], mats["blue_dark"], 0.010),
        ("cross_r", [(0.165, 0.255, 1.625), (0.060, 0.275, 1.520), (-0.010, 0.278, 1.430)], mats["blue_trim"], 0.010),
        ("rope_l", [(-0.130, 0.245, 1.690), (-0.050, 0.265, 1.585), (0.000, 0.270, 1.510)], mats["leather"], 0.007),
        ("rope_r", [(0.130, 0.245, 1.690), (0.050, 0.265, 1.585), (0.000, 0.270, 1.510)], mats["leather"], 0.007),
    ]
    for name, pts, mat, bevel in cords:
        parent_keep_world(add_curve(f"XYTR_chest_{name}", pts, mat, bevel=bevel), body)

    for obj in (
        add_sphere("XYTR_chest_pearl", (0.0, 0.287, 1.535), (0.024, 0.016, 0.024), mats["pearl"], segments=18, rings=9),
        add_sphere("XYTR_chest_gold_cap", (0.0, 0.292, 1.505), (0.017, 0.011, 0.017), mats["gold"], segments=16, rings=8),
    ):
        parent_keep_world(obj, body)

    for obj in add_shell("XYTR_large_shell_pendant", (0.0, 0.300, 1.455), 0.145, 0.160, mats, forward_y=0.0):
        parent_keep_world(obj, body)

    for sx in (-1, 1):
        parent_keep_world(add_curve(f"XYTR_tassel_cord_{sx}", [(0.080 * sx, 0.265, 1.565), (0.160 * sx, 0.270, 1.345), (0.150 * sx, 0.272, 1.235)], mats["leather"], bevel=0.006), body)
        parent_keep_world(add_sphere(f"XYTR_tassel_gold_{sx}", (0.150 * sx, 0.282, 1.235), (0.016, 0.010, 0.016), mats["gold"], segments=14, rings=7), body)
        parent_keep_world(add_cylinder_between(f"XYTR_blue_tassel_{sx}", (0.150 * sx, 0.286, 1.220), (0.150 * sx, 0.292, 1.125), 0.016, mats["blue_dark"], vertices=8), body)


def add_satchel_polish(body: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    x = -0.285
    # Flap overlay and stitched border on the front satchel.
    flap = add_panel(
        "XYTR_satchel_front_flap_overlay",
        [
            (x - 0.135, 0.303, 1.315),
            (x + 0.135, 0.303, 1.300),
            (x + 0.122, 0.308, 1.170),
            (x - 0.125, 0.308, 1.150),
        ],
        mats["cream_shadow"],
    )
    parent_keep_world(flap, body)
    for pts, nm in (
        ([(x - 0.132, 0.314, 1.305), (x + 0.132, 0.314, 1.292)], "top"),
        ([(x - 0.125, 0.314, 1.155), (x + 0.118, 0.314, 1.175)], "bottom"),
        ([(x - 0.132, 0.314, 1.305), (x - 0.125, 0.314, 1.155)], "left"),
        ([(x + 0.132, 0.314, 1.292), (x + 0.118, 0.314, 1.175)], "right"),
    ):
        parent_keep_world(add_curve(f"XYTR_satchel_stitch_{nm}", pts, mats["leather_dark"], bevel=0.0045), body)

    for obj in add_lighthouse_mark("XYTR_satchel_lighthouse", x, 0.321, 1.237, 0.62, mats):
        parent_keep_world(obj, body)

    for obj in add_shell("XYTR_satchel_side_shell", (x - 0.165, 0.332, 1.170), 0.082, 0.098, mats):
        parent_keep_world(obj, body)
    parent_keep_world(add_sphere("XYTR_satchel_blue_drop", (x - 0.165, 0.348, 1.080), (0.012, 0.008, 0.024), mats["water"], segments=14, rings=7), body)

    for i, z in enumerate((1.075, 1.020, 0.965)):
        parent_keep_world(add_box(f"XYTR_belt_pouch_{i}", (0.195 + i * 0.030, 0.250, z), (0.050, 0.030, 0.095), mats["leather"], bevel=0.008), body)
        parent_keep_world(add_sphere(f"XYTR_pouch_gold_button_{i}", (0.195 + i * 0.030, 0.271, z + 0.020), (0.007, 0.004, 0.007), mats["gold"], segments=10, rings=5), body)


def add_lower_body_polish(body: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    for sx in (-1, 1):
        x = 0.135 * sx
        for obj in add_lighthouse_mark(f"XYTR_pant_lighthouse_{sx}", x, 0.188, 0.735, 0.50, mats):
            parent_keep_world(obj, body)
        parent_keep_world(add_curve(f"XYTR_pant_wave_{sx}_0", [(x - 0.085, 0.190, 0.505), (x, 0.196, 0.480), (x + 0.085, 0.190, 0.505)], mats["ink"], bevel=0.0035), body)
        parent_keep_world(add_curve(f"XYTR_pant_wave_{sx}_1", [(x - 0.075, 0.190, 0.455), (x, 0.196, 0.435), (x + 0.075, 0.190, 0.455)], mats["ink"], bevel=0.0035), body)

        boot_x = 0.155 * sx
        for i in range(4):
            z = 0.145 + i * 0.042
            parent_keep_world(add_curve(f"XYTR_boot_lace_{sx}_{i}", [(boot_x - 0.040 * sx, 0.194, z), (boot_x + 0.040 * sx, 0.197, z + 0.020)], mats["lace"], bevel=0.0045), body)
        parent_keep_world(add_box(f"XYTR_boot_gold_eyelet_top_{sx}", (boot_x, 0.204, 0.315), (0.080, 0.010, 0.016), mats["gold"], bevel=0.003), body)
        parent_keep_world(add_curve(f"XYTR_cuff_blue_wave_{sx}", [(boot_x - 0.080 * sx, 0.155, 0.410), (boot_x, 0.175, 0.390), (boot_x + 0.080 * sx, 0.155, 0.410)], mats["blue_trim"], bevel=0.006), body)


def add_all_reference_details() -> None:
    body = bpy.data.objects["Body"]
    mats = get_palette()
    tune_existing_materials()
    add_hair_polish(body, mats)
    add_cape_polish(body, mats)
    add_front_accessories(body, mats)
    add_satchel_polish(body, mats)
    add_lower_body_polish(body, mats)
    set_expression("Face_Calm")


def reference_proportion_point(point: Vector) -> Vector:
    """Map the chibi base toward the taller turnaround-sheet proportion."""
    z = point.z
    if z < 0.0:
        nz = z * 1.00
    elif z < 0.42:
        nz = z * 1.05
    elif z < 0.95:
        nz = 0.42 + (z - 0.42) * 1.68
    elif z < 1.44:
        nz = 0.42 + 0.53 * 1.68 + (z - 0.95) * 1.38
    else:
        nz = 0.42 + 0.53 * 1.68 + 0.49 * 1.38 + (z - 1.44) * 0.58

    if z >= 1.44:
        sx, sy = 0.60, 0.72
    elif z >= 0.95:
        sx, sy = 0.72, 0.82
    elif z >= 0.42:
        sx, sy = 0.68, 0.78
    else:
        sx, sy = 0.64, 0.72
    return Vector((point.x * sx, point.y * sy, nz))


def apply_reference_proportions() -> None:
    bpy.context.view_layer.update()
    body = bpy.data.objects["Body"]
    targets = [body, *body.children_recursive]
    for obj in targets:
        inv = obj.matrix_world.inverted()
        if obj.type == "MESH":
            for vert in obj.data.vertices:
                world = obj.matrix_world @ vert.co
                vert.co = inv @ reference_proportion_point(world)
            obj.data.update()
        elif obj.type == "CURVE":
            for spline in obj.data.splines:
                points = getattr(spline, "points", None)
                if not points:
                    continue
                for point in points:
                    world = obj.matrix_world @ Vector((point.co.x, point.co.y, point.co.z))
                    local = inv @ reference_proportion_point(world)
                    point.co = (local.x, local.y, local.z, point.co.w)
    bpy.context.view_layer.update()


def select_model() -> None:
    body = bpy.data.objects["Body"]
    for obj in bpy.data.objects:
        obj.select_set(False)
    body.select_set(True)
    for child in body.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = body


def export_assets() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    blend_path = OUT / f"{NAME}.blend"
    glb_path = OUT / f"{NAME}.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    select_model()
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
    )
    print(f"saved blend -> {blend_path} ({blend_path.stat().st_size} bytes)")
    print(f"exported glb -> {glb_path} ({glb_path.stat().st_size} bytes)")


def point_camera_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_preview() -> None:
    SHOT.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("XYTR_preview_camera")
    cam_data.lens = 70
    camera = bpy.data.objects.new("XYTR_preview_camera", cam_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    sun_data = bpy.data.lights.new("XYTR_key_sun", "SUN")
    sun_data.energy = 3.4
    sun = bpy.data.objects.new("XYTR_key_sun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(55), math.radians(8), math.radians(145))

    fill_data = bpy.data.lights.new("XYTR_soft_fill", "AREA")
    fill_data.energy = 220
    fill_data.size = 4
    fill = bpy.data.objects.new("XYTR_soft_fill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.location = (-2.0, 3.0, 3.2)

    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = 980
    scene.render.resolution_y = 1400
    scene.render.film_transparent = False
    scene.world = scene.world or bpy.data.worlds.new("XYTR_preview_world")
    scene.world.color = (0.78, 0.75, 0.70)
    camera.location = (2.50, 5.35, 1.92)
    point_camera_at(camera, (0.0, 0.04, 1.45))
    scene.render.filepath = str(SHOT / f"{NAME}.png")
    bpy.ops.render.render(write_still=True)
    print(f"preview -> {scene.render.filepath}")


def main() -> None:
    sys.path.insert(0, str(HERE))
    import xy_protagonist as base

    base.reset()
    base.build()
    add_all_reference_details()
    apply_reference_proportions()
    render_preview()
    export_assets()
    print("TURNAROUND REPLICA DONE")


if __name__ == "__main__":
    main()
