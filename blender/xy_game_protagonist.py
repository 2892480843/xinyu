# -*- coding: utf-8 -*-
"""Build a game-ready Xinyu protagonist asset.

This version is for runtime use, not a dense display sculpt:
- clear A-pose silhouette for animation
- simple named parts for later rigging or procedural animation
- readable colors and large shapes at gameplay camera distance
- reduced tiny geometry; key identity marks are kept as bold shapes

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/xy_game_protagonist.py

Outputs:
  frontend/public/models/xy_char_game_protagonist.glb
  frontend/public/models/xy_char_game_protagonist.blend
  docs/screenshots/xy_char_game_protagonist.png
"""
from __future__ import annotations

import math
import shutil
import subprocess
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "models"
SHOT = ROOT / "docs" / "screenshots"
NAME = "xy_char_game_protagonist"
TEXTURE_SCRIPT = ROOT / "blender" / "xy_game_protagonist_texture.py"
TEXTURE_PATH = OUT / "xy_char_game_protagonist_texture.png"
AI_TEXTURE_SOURCE = OUT / "xy_char_game_protagonist_ai_source.png"


# XYGAME_APose / XYGAME_GameReadable are intentional verification markers.


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
    roughness: float = 0.82,
    alpha: float = 1.0,
    metallic: float = 0.0,
    emission: str | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = hex_color(color, alpha)
    mat.use_nodes = True
    mat.use_backface_culling = False
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
            bsdf.inputs["Emission Color"].default_value = hex_color(emission)
        if emission and "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        mat.blend_method = "BLEND"
        mat.show_transparent_back = True
        mat.use_screen_refraction = False
    return mat


def make_texture_mat(name: str, image_path: Path) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    mat.blend_method = "BLEND"
    mat.use_screen_refraction = False
    mat.show_transparent_back = True
    mat.diffuse_color = (1, 1, 1, 1)
    nodes = mat.node_tree.nodes
    for node in list(nodes):
        nodes.remove(node)
    output = nodes.new(type="ShaderNodeOutputMaterial")
    emission = nodes.new(type="ShaderNodeEmission")
    transparent = nodes.new(type="ShaderNodeBsdfTransparent")
    mix = nodes.new(type="ShaderNodeMixShader")
    tex = nodes.new(type="ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(image_path), check_existing=True)
    tex.extension = "CLIP"
    mat.node_tree.links.new(tex.outputs["Color"], emission.inputs["Color"])
    emission.inputs["Strength"].default_value = 1.0
    mat.node_tree.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
    mat.node_tree.links.new(transparent.outputs["BSDF"], mix.inputs[1])
    mat.node_tree.links.new(emission.outputs["Emission"], mix.inputs[2])
    mat.node_tree.links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return mat


def palette() -> dict[str, bpy.types.Material]:
    return {
        "skin": make_mat("XYGAME_skin", "#f5c7aa", roughness=0.82),
        "skin_shadow": make_mat("XYGAME_skin_shadow", "#d89979", roughness=0.86),
        "hair": make_mat("XYGAME_hair_deep_blue", "#253146", roughness=0.84),
        "hair_mid": make_mat("XYGAME_hair_mid", "#39455c", roughness=0.84),
        "hair_teal": make_mat("XYGAME_hair_teal", "#2faec2", roughness=0.80),
        "eye": make_mat("XYGAME_eye_blue_gray", "#66889f", roughness=0.54),
        "eye_dark": make_mat("XYGAME_eye_ink", "#172030", roughness=0.65),
        "eye_hi": make_mat("XYGAME_eye_highlight", "#ffffff", roughness=0.22, emission="#ffffff", emission_strength=0.35),
        "cloak": make_mat("XYGAME_cloak_ivory", "#f6ead8", roughness=0.88),
        "cloak_shadow": make_mat("XYGAME_cloak_shadow", "#d4c4ac", roughness=0.90),
        "shirt": make_mat("XYGAME_shirt_warm_white", "#fff7e9", roughness=0.84),
        "trim": make_mat("XYGAME_sea_trim", "#58b8c9", roughness=0.78),
        "trim_dark": make_mat("XYGAME_sea_trim_dark", "#317589", roughness=0.84),
        "pants": make_mat("XYGAME_pants_blue_gray", "#819ba0", roughness=0.86),
        "pants_shadow": make_mat("XYGAME_pants_shadow", "#506c72", roughness=0.90),
        "cape_blue": make_mat("XYGAME_cape_blue_tail", "#5aaec0", roughness=0.82, alpha=0.62),
        "boot": make_mat("XYGAME_boot_ivory", "#eadbc3", roughness=0.82),
        "sole": make_mat("XYGAME_boot_sole", "#6d5239", roughness=0.76),
        "leather": make_mat("XYGAME_leather", "#9b7a58", roughness=0.76),
        "leather_dark": make_mat("XYGAME_leather_dark", "#453529", roughness=0.74),
        "gold": make_mat("XYGAME_gold", "#c39145", roughness=0.48, metallic=0.16),
        "shell": make_mat("XYGAME_shell", "#efd5a4", roughness=0.66),
        "water": make_mat("XYGAME_water_drop", "#43a9c0", roughness=0.38, alpha=0.86),
        "ink": make_mat("XYGAME_line_ink", "#273242", roughness=0.88),
        "decal": make_mat("XYGAME_lighthouse_decal", "#526f7e", roughness=0.90),
    }


def reset() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def add_empty(name: str, loc: tuple[float, float, float]) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.09
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    return obj


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


def add_sphere(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    segments: int = 32,
    rings: int = 16,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    assign(obj, mat)
    shade_smooth(obj)
    obj.modifiers.new(name="XYGAME_weighted_normals", type="WEIGHTED_NORMAL")
    return obj


def add_box(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0, 0, 0),
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    if bevel:
        mod = obj.modifiers.new(name="XYGAME_soft_bevel", type="BEVEL")
        mod.width = bevel
        mod.segments = 3
        obj.modifiers.new(name="XYGAME_weighted_normals", type="WEIGHTED_NORMAL")
    return obj


def add_curve(
    name: str,
    points: list[tuple[float, float, float]],
    mat: bpy.types.Material,
    *,
    bevel: float = 0.006,
    resolution: int = 3,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
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
    vertices: int = 16,
) -> bpy.types.Object:
    a = Vector(p0)
    b = Vector(p1)
    axis = b - a
    if axis.length < 1e-5:
        raise ValueError(f"{name} has zero length")
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=axis.length, location=(a + b) * 0.5)
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
    vertices: int = 18,
) -> bpy.types.Object:
    a = Vector(p0)
    b = Vector(p1)
    axis = b - a
    if axis.length < 1e-5:
        raise ValueError(f"{name} has zero length")
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius0, radius2=radius1, depth=axis.length, location=(a + b) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
    assign(obj, mat)
    shade_smooth(obj)
    return obj


def add_panel(
    name: str,
    verts: list[tuple[float, float, float]],
    mat: bpy.types.Material,
    *,
    solidify: float = 0.012,
) -> bpy.types.Object:
    if len(verts) == 4:
        faces = [(0, 1, 2, 3)]
    elif len(verts) == 6:
        faces = [(0, 1, 2, 3), (0, 3, 4, 5)]
    else:
        raise ValueError(f"{name} needs 4 or 6 verts")
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if solidify:
        mod = obj.modifiers.new(name="XYGAME_panel_thickness", type="SOLIDIFY")
        mod.thickness = solidify
        mod.offset = 0
    obj.modifiers.new(name="XYGAME_weighted_normals", type="WEIGHTED_NORMAL")
    return obj


def add_ellipse(
    name: str,
    loc: tuple[float, float, float],
    rx: float,
    rz: float,
    mat: bpy.types.Material,
    *,
    segments: int = 28,
) -> bpy.types.Object:
    cx, cy, cz = loc
    verts = [(cx, cy, cz)]
    for i in range(segments):
        a = math.tau * i / segments
        verts.append((cx + rx * math.cos(a), cy, cz + rz * math.sin(a)))
    faces = [(0, 1 + i, 1 + ((i + 1) % segments)) for i in range(segments)]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def add_anime_head(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    segments: int = 40,
    rings: int = 22,
) -> bpy.types.Object:
    cx, cy, cz = loc
    sx, sy, sz = scale
    verts: list[tuple[float, float, float]] = []
    for r in range(rings + 1):
        v = r / rings
        phi = math.pi * v
        z_unit = math.cos(phi)
        ring = math.sin(phi)
        lower = max(0.0, -z_unit)
        upper = max(0.0, z_unit)
        # Anime face: broad cranium, flatter face plane, tapered lower jaw.
        x_mul = 1.03 + 0.06 * upper - 0.34 * lower * lower
        y_mul = 0.86 + 0.08 * upper - 0.20 * lower
        for i in range(segments):
            a = math.tau * i / segments
            front = max(0.0, math.sin(a))
            cheek = 1.0 + 0.08 * front * (1.0 - abs(z_unit))
            x = cx + math.cos(a) * ring * sx * x_mul * cheek
            y = cy + math.sin(a) * ring * sy * y_mul
            z = cz + z_unit * sz - 0.018 * lower * lower
            verts.append((x, y, z))
    faces: list[tuple[int, int, int, int]] = []
    for r in range(rings):
        row = r * segments
        nxt = (r + 1) * segments
        for i in range(segments):
            faces.append((row + i, row + ((i + 1) % segments), nxt + ((i + 1) % segments), nxt + i))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    shade_smooth(obj)
    obj.modifiers.new(name="XYGAME_weighted_normals", type="WEIGHTED_NORMAL")
    return obj


def add_leaf(
    name: str,
    centers: list[tuple[float, float, float]],
    widths: list[float],
    mat: bpy.types.Material,
    *,
    axis_hint: tuple[float, float, float] = (1, 0, 0),
    solidify: float = 0.010,
) -> bpy.types.Object:
    axis = Vector(axis_hint).normalized()
    verts: list[tuple[float, float, float]] = []
    for center, width in zip(centers, widths):
        c = Vector(center)
        verts.append(tuple(c - axis * width))
        verts.append(tuple(c + axis * width))
    faces = [(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2) for i in range(len(centers) - 1)]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if solidify:
        mod = obj.modifiers.new(name="XYGAME_leaf_thickness", type="SOLIDIFY")
        mod.thickness = solidify
        mod.offset = 0
    obj.modifiers.new(name="XYGAME_weighted_normals", type="WEIGHTED_NORMAL")
    return obj


def add_wave_line(
    name: str,
    x0: float,
    x1: float,
    y: float,
    z: float,
    amp: float,
    mat: bpy.types.Material,
    *,
    bevel: float = 0.006,
    steps: int = 14,
) -> bpy.types.Object:
    pts = []
    for i in range(steps):
        t = i / (steps - 1)
        pts.append((x0 + (x1 - x0) * t, y, z + math.sin(t * math.tau * 1.15) * amp))
    return add_curve(name, pts, mat, bevel=bevel, resolution=4)


def add_lighthouse_mark(prefix: str, x: float, y: float, z: float, scale: float, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    return [
        add_box(f"{prefix}_lighthouse_tower", (x, y, z), (0.026 * scale, 0.005, 0.115 * scale), mats["decal"], bevel=0.0015),
        add_box(f"{prefix}_lighthouse_top", (x, y + 0.002, z + 0.067 * scale), (0.064 * scale, 0.005, 0.022 * scale), mats["decal"], bevel=0.0015),
        add_box(f"{prefix}_lighthouse_base", (x, y + 0.002, z - 0.067 * scale), (0.084 * scale, 0.005, 0.016 * scale), mats["decal"], bevel=0.0015),
        add_wave_line(f"{prefix}_lighthouse_wave", x - 0.075 * scale, x + 0.075 * scale, y + 0.004, z - 0.112 * scale, 0.006 * scale, mats["decal"], bevel=0.0024 * scale, steps=10),
    ]


def add_shell(name: str, loc: tuple[float, float, float], width: float, height: float, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    x0, y0, z0 = loc
    half = width * 0.5
    verts = [(x0, y0, z0 + height * 0.42)]
    for i in range(11):
        t = -1.0 + 2.0 * i / 10.0
        verts.append((x0 + t * half, y0 + 0.004, z0 - height * (0.26 + 0.10 * abs(t))))
    faces = [(0, i, i + 1) for i in range(1, 11)]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    shell = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(shell)
    shell.data.materials.append(mats["shell"])
    objs = [shell]
    for t in (-0.55, -0.25, 0.0, 0.25, 0.55):
        objs.append(add_cylinder_between(f"{name}_rib_{t:+.2f}", (x0, y0 + 0.010, z0 + height * 0.34), (x0 + t * half, y0 + 0.012, z0 - height * 0.26), 0.0028, mats["gold"], vertices=6))
    objs.append(add_sphere(f"{name}_drop", (x0, y0 + 0.016, z0 - height * 0.45), (0.010, 0.006, 0.021), mats["water"], segments=12, rings=6))
    return objs


def create_part(root: bpy.types.Object, name: str, pivot: tuple[float, float, float]) -> bpy.types.Object:
    part = add_empty(name, pivot)
    part.parent = root
    return part


def build_body(root: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> dict[str, bpy.types.Object]:
    parts = {
        "body": create_part(root, "XYGAME_Body", (0, 0, 1.12)),
        "head": create_part(root, "XYGAME_Head", (0, 0, 1.82)),
        "arm_l": create_part(root, "XYGAME_ArmL", (-0.225, 0, 1.52)),
        "arm_r": create_part(root, "XYGAME_ArmR", (0.225, 0, 1.52)),
        "leg_l": create_part(root, "XYGAME_LegL", (-0.120, 0, 0.98)),
        "leg_r": create_part(root, "XYGAME_LegR", (0.120, 0, 0.98)),
        "cape": create_part(root, "XYGAME_Cape", (0, -0.08, 1.58)),
        "satchel": create_part(root, "XYGAME_Satchel", (-0.245, 0.13, 1.02)),
    }

    parent_keep_world(add_sphere("XYGAME_Body_torso", (0, 0.000, 1.385), (0.160, 0.098, 0.315), mats["shirt"], segments=34, rings=16), parts["body"])
    parent_keep_world(add_panel("XYGAME_Body_front_tunic_l", [(-0.135, 0.112, 1.630), (-0.010, 0.128, 1.610), (-0.028, 0.135, 1.125), (-0.170, 0.112, 1.060)], mats["cloak"], solidify=0.010), parts["body"])
    parent_keep_world(add_panel("XYGAME_Body_front_tunic_r", [(0.010, 0.128, 1.610), (0.135, 0.112, 1.630), (0.170, 0.112, 1.060), (0.028, 0.135, 1.125)], mats["cloak"], solidify=0.010), parts["body"])
    parent_keep_world(add_box("XYGAME_Body_belt", (0, 0.024, 1.105), (0.340, 0.034, 0.042), mats["leather_dark"], bevel=0.008), parts["body"])
    for x in (-0.060, 0.000, 0.060):
        parent_keep_world(add_sphere(f"XYGAME_Body_button_{x:+.2f}", (x, 0.136, 1.405), (0.008, 0.004, 0.008), mats["gold"], segments=10, rings=5), parts["body"])
    parent_keep_world(add_curve("XYGAME_Body_shirt_center", [(0.0, 0.146, 1.595), (0.0, 0.152, 1.225)], mats["cloak_shadow"], bevel=0.0022), parts["body"])

    for side, key in [(-1, "leg_l"), (1, "leg_r")]:
        x = side * 0.135
        pant = add_tapered_between(f"XYGAME_Leg{'L' if side < 0 else 'R'}_wide_pant", (x, 0, 1.035), (x + side * 0.018, 0, 0.360), 0.092, 0.132, mats["pants"], vertices=24)
        pant.scale.x = 0.62
        pant.scale.y = 0.46
        parent_keep_world(pant, parts[key])
        parent_keep_world(add_curve(f"XYGAME_Leg{'L' if side < 0 else 'R'}_front_crease", [(x + side * 0.030, 0.118, 0.945), (x + side * 0.020, 0.132, 0.610), (x + side * 0.010, 0.116, 0.420)], mats["pants_shadow"], bevel=0.0030), parts[key])
        parent_keep_world(add_wave_line(f"XYGAME_Leg{'L' if side < 0 else 'R'}_hem_wave", x - 0.078, x + 0.078, 0.121, 0.432, 0.008, mats["trim_dark"], bevel=0.0038, steps=9), parts[key])
        cuff = add_tapered_between(f"XYGAME_Leg{'L' if side < 0 else 'R'}_cuff", (x + side * 0.018, 0.002, 0.392), (x + side * 0.018, 0.002, 0.340), 0.130, 0.125, mats["cloak"], vertices=22)
        cuff.scale.x = 0.58
        cuff.scale.y = 0.44
        parent_keep_world(cuff, parts[key])
        parent_keep_world(add_cylinder_between(f"XYGAME_Leg{'L' if side < 0 else 'R'}_ankle", (x + side * 0.018, 0, 0.315), (x + side * 0.018, 0, 0.165), 0.030, mats["skin"], vertices=14), parts[key])
        parent_keep_world(add_box(f"XYGAME_Leg{'L' if side < 0 else 'R'}_boot", (x + side * 0.018, 0.042, 0.090), (0.112, 0.137, 0.188), mats["boot"], bevel=0.022), parts[key])
        parent_keep_world(add_box(f"XYGAME_Leg{'L' if side < 0 else 'R'}_boot_toe", (x + side * 0.018, 0.115, 0.022), (0.142, 0.120, 0.054), mats["boot"], bevel=0.022), parts[key])
        parent_keep_world(add_box(f"XYGAME_Leg{'L' if side < 0 else 'R'}_sole", (x + side * 0.018, 0.124, -0.012), (0.152, 0.145, 0.030), mats["sole"], bevel=0.008), parts[key])
        for i in range(3):
            z = 0.060 + i * 0.040
            parent_keep_world(add_curve(f"XYGAME_Leg{'L' if side < 0 else 'R'}_boot_lace_{i}", [(x - 0.032 * side, 0.126, z), (x + 0.032 * side, 0.129, z + 0.018)], mats["trim_dark"], bevel=0.0032), parts[key])

    for side, key in [(-1, "arm_l"), (1, "arm_r")]:
        shoulder = (side * 0.218, 0.002, 1.545)
        elbow = (side * 0.345, 0.020, 1.255)
        wrist = (side * 0.438, 0.026, 1.020)
        sleeve = add_tapered_between(f"XYGAME_Arm{'L' if side < 0 else 'R'}_sleeve", shoulder, elbow, 0.060, 0.092, mats["cloak"], vertices=20)
        sleeve.scale.x = 0.86
        sleeve.scale.y = 0.72
        parent_keep_world(sleeve, parts[key])
        parent_keep_world(add_cylinder_between(f"XYGAME_Arm{'L' if side < 0 else 'R'}_forearm", elbow, wrist, 0.029, mats["skin"], vertices=14), parts[key])
        hand = add_sphere(f"XYGAME_Arm{'L' if side < 0 else 'R'}_hand", (side * 0.456, 0.030, 0.955), (0.025, 0.015, 0.055), mats["skin"], segments=14, rings=8)
        hand.rotation_euler[1] = math.radians(8 * side)
        parent_keep_world(hand, parts[key])
        parent_keep_world(add_curve(f"XYGAME_Arm{'L' if side < 0 else 'R'}_sleeve_trim", [(side * 0.284, 0.098, 1.265), (side * 0.352, 0.115, 1.160), (side * 0.414, 0.104, 1.075)], mats["trim"], bevel=0.0045), parts[key])

    return parts


def build_head(parts: dict[str, bpy.types.Object], mats: dict[str, bpy.types.Material]) -> None:
    head_part = parts["head"]
    parent_keep_world(add_cylinder_between("XYGAME_Head_neck", (0, 0, 1.650), (0, 0, 1.770), 0.044, mats["skin"], vertices=16), head_part)
    parent_keep_world(add_anime_head("XYGAME_Head_face", (0, 0.012, 1.990), (0.162, 0.125, 0.252), mats["skin"], segments=44, rings=22), head_part)
    parent_keep_world(add_ellipse("XYGAME_Head_soft_chin_tint", (0, 0.153, 1.822), 0.024, 0.0035, mats["skin_shadow"], segments=14), head_part)

    for side in (-1, 1):
        parent_keep_world(add_ellipse(f"XYGAME_Head_eye_white_{side}", (side * 0.054, 0.158, 2.002), 0.039, 0.023, mats["eye_hi"], segments=28), head_part)
        parent_keep_world(add_ellipse(f"XYGAME_Head_eye_iris_{side}", (side * 0.054, 0.164, 1.998), 0.019, 0.028, mats["eye"], segments=22), head_part)
        parent_keep_world(add_ellipse(f"XYGAME_Head_eye_pupil_{side}", (side * 0.055, 0.169, 1.995), 0.0085, 0.020, mats["eye_dark"], segments=16), head_part)
        parent_keep_world(add_ellipse(f"XYGAME_Head_eye_spark_{side}", (side * 0.046, 0.174, 2.010), 0.0055, 0.006, mats["eye_hi"], segments=12), head_part)
        parent_keep_world(add_curve(f"XYGAME_Head_eye_upper_{side}", [(side * 0.019, 0.176, 2.010), (side * 0.056, 0.182, 2.031), (side * 0.096, 0.176, 2.012)], mats["eye_dark"], bevel=0.0020), head_part)
        parent_keep_world(add_curve(f"XYGAME_Head_eye_lower_{side}", [(side * 0.027, 0.172, 1.980), (side * 0.056, 0.176, 1.972), (side * 0.086, 0.172, 1.980)], mats["eye_dark"], bevel=0.0010), head_part)
        parent_keep_world(add_curve(f"XYGAME_Head_brow_{side}", [(side * 0.030, 0.166, 2.060), (side * 0.074, 0.170, 2.071), (side * 0.106, 0.166, 2.066)], mats["hair"], bevel=0.0018), head_part)
        parent_keep_world(add_ellipse(f"XYGAME_Head_blush_{side}", (side * 0.084, 0.162, 1.922), 0.016, 0.006, mats["skin_shadow"], segments=14), head_part)
    parent_keep_world(add_curve("XYGAME_Head_nose", [(-0.003, 0.174, 1.956), (0.002, 0.179, 1.936)], mats["skin_shadow"], bevel=0.0010), head_part)
    parent_keep_world(add_curve("XYGAME_Head_mouth", [(-0.016, 0.178, 1.886), (-0.004, 0.182, 1.882), (0.015, 0.178, 1.887)], mats["eye_dark"], bevel=0.0011), head_part)

    parent_keep_world(add_sphere("XYGAME_Head_hair_cap", (0, -0.030, 2.095), (0.198, 0.150, 0.198), mats["hair"], segments=44, rings=18), head_part)
    parent_keep_world(add_sphere("XYGAME_Head_hair_crown", (0, -0.055, 2.176), (0.158, 0.112, 0.084), mats["hair_mid"], segments=30, rings=10), head_part)
    hair_locks = [
        ("front_mid", [(0.004, 0.146, 2.220), (-0.004, 0.176, 2.095), (-0.015, 0.174, 1.990)], [0.026, 0.036, 0.006], mats["hair_mid"], (1, 0, -0.10)),
        ("front_l", [(-0.052, 0.136, 2.205), (-0.082, 0.168, 2.080), (-0.104, 0.168, 1.980)], [0.026, 0.034, 0.006], mats["hair"], (0.86, 0, -0.32)),
        ("front_r", [(0.052, 0.136, 2.205), (0.082, 0.168, 2.084), (0.104, 0.168, 1.985)], [0.026, 0.034, 0.006], mats["hair"], (0.86, 0, 0.32)),
        ("temple_l", [(-0.126, 0.100, 2.165), (-0.156, 0.146, 2.030), (-0.148, 0.142, 1.908)], [0.022, 0.029, 0.006], mats["hair_mid"], (0.58, 0, -0.82)),
        ("temple_r", [(0.126, 0.100, 2.165), (0.156, 0.146, 2.036), (0.148, 0.142, 1.918)], [0.022, 0.029, 0.006], mats["hair_mid"], (0.58, 0, 0.82)),
        ("side_l", [(-0.176, 0.020, 2.070), (-0.204, 0.082, 1.940), (-0.188, 0.090, 1.795)], [0.026, 0.032, 0.007], mats["hair_mid"], (0.54, 0, -0.84)),
        ("side_r", [(0.176, 0.020, 2.070), (0.204, 0.082, 1.945), (0.188, 0.090, 1.802)], [0.026, 0.032, 0.007], mats["hair_mid"], (0.54, 0, 0.84)),
        ("flip_l", [(-0.196, -0.028, 2.060), (-0.258, -0.026, 2.035), (-0.278, -0.030, 2.078)], [0.018, 0.024, 0.005], mats["hair"], (0.30, 0, -0.95)),
        ("flip_r", [(0.196, -0.028, 2.060), (0.258, -0.026, 2.035), (0.278, -0.030, 2.078)], [0.018, 0.024, 0.005], mats["hair"], (0.30, 0, 0.95)),
        ("nape_l", [(-0.080, -0.160, 2.035), (-0.146, -0.198, 1.900), (-0.120, -0.176, 1.760)], [0.030, 0.040, 0.009], mats["hair"], (0.64, -0.08, -0.76)),
        ("nape_r", [(0.080, -0.160, 2.035), (0.146, -0.198, 1.900), (0.120, -0.176, 1.760)], [0.030, 0.040, 0.009], mats["hair"], (0.64, 0.08, 0.76)),
    ]
    for name, centers, widths, mat, axis in hair_locks:
        parent_keep_world(add_leaf(f"XYGAME_Head_hair_{name}", centers, widths, mat, axis_hint=axis, solidify=0.012), head_part)
        parent_keep_world(add_curve(f"XYGAME_Head_hair_line_{name}", centers, mats["ink"], bevel=0.0018), head_part)
    parent_keep_world(add_leaf("XYGAME_Head_teal_streak_l", [(-0.178, 0.074, 2.040), (-0.204, 0.104, 1.930), (-0.192, 0.094, 1.820)], [0.007, 0.010, 0.003], mats["hair_teal"], axis_hint=(0.6, 0, -0.75), solidify=0.005), head_part)
    parent_keep_world(add_leaf("XYGAME_Head_teal_streak_r", [(0.178, 0.074, 2.040), (0.204, 0.104, 1.932), (0.192, 0.094, 1.826)], [0.007, 0.010, 0.003], mats["hair_teal"], axis_hint=(0.6, 0, 0.75), solidify=0.005), head_part)
    parent_keep_world(add_curve("XYGAME_Head_ahoge_curl", [(0.006, -0.020, 2.288), (0.030, -0.018, 2.340), (-0.020, -0.020, 2.334)], mats["hair"], bevel=0.0038, resolution=5), head_part)
    parent_keep_world(add_sphere("XYGAME_Head_hair_gold_pin", (0.148, 0.094, 2.060), (0.014, 0.007, 0.014), mats["gold"], segments=12, rings=6), head_part)


def build_cape_and_accessories(parts: dict[str, bpy.types.Object], mats: dict[str, bpy.types.Material]) -> None:
    cape = parts["cape"]
    parent_keep_world(add_sphere("XYGAME_Cape_hood", (0, -0.078, 1.725), (0.228, 0.084, 0.086), mats["cloak"], segments=28, rings=10), cape)
    parent_keep_world(add_curve("XYGAME_Cape_hood_lip", [(-0.205, 0.056, 1.690), (-0.095, 0.105, 1.735), (0.0, 0.112, 1.748), (0.095, 0.105, 1.735), (0.205, 0.056, 1.690)], mats["cloak_shadow"], bevel=0.006), cape)
    parent_keep_world(add_panel("XYGAME_Cape_back_panel", [(-0.245, -0.095, 1.660), (0.245, -0.095, 1.660), (0.358, -0.255, 1.085), (0.132, -0.315, 0.965), (-0.132, -0.315, 0.965), (-0.358, -0.255, 1.085)], mats["cloak"], solidify=0.012), cape)
    parent_keep_world(add_wave_line("XYGAME_Cape_back_wave_trim", -0.300, 0.300, -0.326, 1.125, 0.016, mats["trim"], bevel=0.006, steps=18), cape)
    for obj in add_lighthouse_mark("XYGAME_Cape_back_mark", 0.0, -0.336, 1.345, 0.72, mats):
        parent_keep_world(obj, cape)
    for side in (-1, 1):
        parent_keep_world(add_panel(f"XYGAME_Cape_front_panel_{side}", [(side * 0.048, 0.122, 1.635), (side * 0.242, 0.104, 1.585), (side * 0.315, 0.070, 1.230), (side * 0.150, 0.128, 1.180)], mats["cloak"], solidify=0.012), cape)
        parent_keep_world(add_curve(f"XYGAME_Cape_front_trim_{side}", [(side * 0.095, 0.136, 1.310), (side * 0.202, 0.125, 1.278), (side * 0.302, 0.085, 1.305)], mats["trim"], bevel=0.0055), cape)
        parent_keep_world(add_panel(f"XYGAME_Cape_side_blue_{side}", [(side * 0.245, -0.060, 1.535), (side * 0.398, -0.110, 1.360), (side * 0.405, -0.135, 0.995), (side * 0.270, -0.086, 1.095)], mats["cape_blue"], solidify=0.006), cape)
        parent_keep_world(add_curve(f"XYGAME_Cape_side_edge_{side}", [(side * 0.408, -0.112, 1.360), (side * 0.414, -0.138, 0.955)], mats["ink"], bevel=0.0032), cape)

    body = parts["body"]
    chest_lines = [
        ("cord_l", [(-0.112, 0.146, 1.575), (-0.042, 0.170, 1.465), (0.0, 0.176, 1.378)], mats["leather"], 0.0042),
        ("cord_r", [(0.112, 0.146, 1.575), (0.042, 0.170, 1.465), (0.0, 0.176, 1.378)], mats["leather"], 0.0042),
        ("blue_l", [(-0.140, 0.150, 1.495), (-0.030, 0.176, 1.397), (0.048, 0.174, 1.338)], mats["trim_dark"], 0.0050),
        ("blue_r", [(0.140, 0.150, 1.495), (0.030, 0.176, 1.397), (-0.048, 0.174, 1.338)], mats["trim"], 0.0050),
    ]
    for name, pts, mat, bevel in chest_lines:
        parent_keep_world(add_curve(f"XYGAME_Body_chest_{name}", pts, mat, bevel=bevel), body)
    parent_keep_world(add_sphere("XYGAME_Body_pendant_node", (0, 0.185, 1.405), (0.012, 0.007, 0.012), mats["gold"], segments=10, rings=5), body)
    for obj in add_shell("XYGAME_Body_shell_pendant", (0, 0.194, 1.342), 0.078, 0.094, mats):
        parent_keep_world(obj, body)

    satchel = parts["satchel"]
    parent_keep_world(add_curve("XYGAME_Satchel_strap", [(-0.165, 0.132, 1.555), (-0.075, 0.128, 1.342), (0.040, 0.118, 1.115), (0.170, 0.092, 0.880)], mats["leather"], bevel=0.010, resolution=5), satchel)
    parent_keep_world(add_box("XYGAME_Satchel_bag", (-0.210, 0.158, 0.925), (0.176, 0.064, 0.205), mats["leather"], bevel=0.018), satchel)
    parent_keep_world(add_panel("XYGAME_Satchel_flap", [(-0.296, 0.200, 1.014), (-0.124, 0.200, 1.005), (-0.130, 0.205, 0.922), (-0.290, 0.205, 0.904)], mats["cloak_shadow"], solidify=0.006), satchel)
    parent_keep_world(add_curve("XYGAME_Satchel_blue_edge", [(-0.286, 0.214, 0.922), (-0.210, 0.222, 0.900), (-0.132, 0.214, 0.932)], mats["trim"], bevel=0.0035), satchel)
    for obj in add_lighthouse_mark("XYGAME_Satchel_mark", -0.210, 0.214, 0.965, 0.34, mats):
        parent_keep_world(obj, satchel)


def add_poly_panel(
    name: str,
    points: list[tuple[float, float]],
    y: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    solidify: float = 0.006,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata([(x, y, z) for x, z in points], [], [tuple(range(len(points)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if solidify:
        mod = obj.modifiers.new(name="XYGAME_panel_thickness", type="SOLIDIFY")
        mod.thickness = solidify
        mod.offset = 0
    obj.modifiers.new(name="XYGAME_weighted_normals", type="WEIGHTED_NORMAL")
    return parent_keep_world(obj, parent)


def add_curve_panel(
    name: str,
    points: list[tuple[float, float]],
    y: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    bevel: float = 0.004,
    resolution: int = 4,
) -> bpy.types.Object:
    return parent_keep_world(add_curve(name, [(x, y, z) for x, z in points], mat, bevel=bevel, resolution=resolution), parent)


def add_ellipse_panel(
    name: str,
    loc: tuple[float, float],
    y: float,
    rx: float,
    rz: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    *,
    segments: int = 28,
) -> bpy.types.Object:
    return parent_keep_world(add_ellipse(name, (loc[0], y, loc[1]), rx, rz, mat, segments=segments), parent)


def ensure_texture() -> None:
    needs_refresh = not TEXTURE_PATH.exists() or TEXTURE_PATH.stat().st_size <= 50_000
    if TEXTURE_PATH.exists():
        texture_mtime = TEXTURE_PATH.stat().st_mtime
        source_paths = [TEXTURE_SCRIPT, AI_TEXTURE_SOURCE]
        needs_refresh = needs_refresh or any(path.exists() and path.stat().st_mtime > texture_mtime for path in source_paths)
    if not needs_refresh:
        return
    python = shutil.which("python3")
    if not python:
        raise RuntimeError("python3 is required to generate xy_char_game_protagonist_texture.png")
    subprocess.run([python, str(TEXTURE_SCRIPT)], check=True)


def add_textured_card(
    name: str,
    width: float,
    height: float,
    y: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    half = width * 0.5
    verts = [(-half, y, 0.0), (half, y, 0.0), (half, y, height), (-half, y, height)]
    faces = [(0, 1, 2, 3)]
    uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="XYGAME_UV")
    for loop, uv in zip(mesh.polygons[0].loop_indices, uvs):
        uv_layer.data[loop].uv = uv
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return parent_keep_world(obj, parent)


def build_scene_texture_card() -> None:
    """Texture-card version for a cleaner game character presentation."""
    ensure_texture()
    reset()
    root = add_empty("XYGAME_Root", (0, 0, 0))
    texture_mat = make_texture_mat("XYGAME_character_texture_card", TEXTURE_PATH)
    add_textured_card("XYGAME_TextureCard_Main", 1.36, 2.05, 0.0, texture_mat, root)

    # Keep semantic parts for gameplay hooks and future rig/sprite replacement.
    create_part(root, "XYGAME_Body", (0, 0.02, 1.12))
    create_part(root, "XYGAME_Head", (0, 0.02, 1.73))
    create_part(root, "XYGAME_ArmL", (-0.34, 0.02, 1.04))
    create_part(root, "XYGAME_ArmR", (0.34, 0.02, 1.04))
    create_part(root, "XYGAME_LegL", (-0.13, 0.02, 0.42))
    create_part(root, "XYGAME_LegR", (0.13, 0.02, 0.42))
    create_part(root, "XYGAME_Cape", (0, -0.01, 1.18))
    create_part(root, "XYGAME_Satchel", (-0.26, 0.03, 0.86))

    for obj in bpy.data.objects:
        if obj.name.startswith("XYGAME_"):
            obj.select_set(True)
    bpy.context.view_layer.objects.active = root


def build_scene_illustration() -> None:
    """2.5D layered game asset: closer to the reference design than toy-like primitives."""
    reset()
    mats = palette()
    root = add_empty("XYGAME_Root", (0, 0, 0))
    parts = {
        "cape": create_part(root, "XYGAME_Cape", (0, 0, 0)),
        "body": create_part(root, "XYGAME_Body", (0, 0, 0)),
        "head": create_part(root, "XYGAME_Head", (0, 0, 0)),
        "arm_l": create_part(root, "XYGAME_ArmL", (0, 0, 0)),
        "arm_r": create_part(root, "XYGAME_ArmR", (0, 0, 0)),
        "leg_l": create_part(root, "XYGAME_LegL", (0, 0, 0)),
        "leg_r": create_part(root, "XYGAME_LegR", (0, 0, 0)),
        "satchel": create_part(root, "XYGAME_Satchel", (0, 0, 0)),
    }

    cape = parts["cape"]
    add_poly_panel("XYGAME_Cape_back_silhouette", [(-0.30, 1.72), (0.30, 1.72), (0.44, 1.10), (0.22, 0.88), (0.00, 0.80), (-0.22, 0.88), (-0.44, 1.10)], -0.045, mats["cloak"], cape, solidify=0.010)
    add_poly_panel("XYGAME_Cape_blue_tail_l", [(-0.30, 1.54), (-0.47, 1.28), (-0.43, 0.90), (-0.24, 1.06)], -0.040, mats["cape_blue"], cape, solidify=0.004)
    add_poly_panel("XYGAME_Cape_blue_tail_r", [(0.30, 1.54), (0.47, 1.28), (0.43, 0.90), (0.24, 1.06)], -0.040, mats["cape_blue"], cape, solidify=0.004)
    add_ellipse_panel("XYGAME_Cape_soft_hood", (0.0, 1.70), -0.018, 0.25, 0.105, mats["cloak"], cape, segments=36)
    add_curve_panel("XYGAME_Cape_hood_lip", [(-0.22, 1.66), (-0.10, 1.73), (0.0, 1.75), (0.10, 1.73), (0.22, 1.66)], 0.042, mats["cloak_shadow"], cape, bevel=0.006)
    parent_keep_world(add_wave_line("XYGAME_Cape_back_wave_trim", -0.31, 0.31, 0.040, 1.10, 0.012, mats["trim"], bevel=0.0055, steps=18), cape)
    for obj in add_lighthouse_mark("XYGAME_Cape_back_mark", 0.0, -0.052, 1.33, 0.55, mats):
        parent_keep_world(obj, cape)

    body = parts["body"]
    add_poly_panel("XYGAME_Body_neck", [(-0.036, 1.74), (0.036, 1.74), (0.030, 1.58), (-0.030, 1.58)], 0.104, mats["skin"], body, solidify=0.010)
    add_poly_panel("XYGAME_Body_inner_collar", [(-0.070, 1.58), (0.0, 1.52), (0.070, 1.58), (0.030, 1.62), (0.0, 1.59), (-0.030, 1.62)], 0.132, mats["shirt"], body, solidify=0.006)
    add_poly_panel("XYGAME_Body_shirt_panel", [(-0.13, 1.58), (0.13, 1.58), (0.17, 1.10), (0.06, 0.98), (-0.06, 0.98), (-0.17, 1.10)], 0.060, mats["shirt"], body, solidify=0.008)
    add_poly_panel("XYGAME_Body_front_tunic_l", [(-0.22, 1.60), (-0.02, 1.62), (-0.03, 1.04), (-0.18, 0.98), (-0.31, 1.28)], 0.090, mats["cloak"], body, solidify=0.006)
    add_poly_panel("XYGAME_Body_front_tunic_r", [(0.02, 1.62), (0.22, 1.60), (0.31, 1.28), (0.18, 0.98), (0.03, 1.04)], 0.092, mats["cloak"], body, solidify=0.006)
    add_poly_panel("XYGAME_Body_belt_flat", [(-0.19, 1.04), (0.19, 1.04), (0.18, 1.00), (-0.18, 1.00)], 0.118, mats["leather_dark"], body, solidify=0.004)
    add_curve_panel("XYGAME_Body_center_fold", [(0.0, 1.56), (0.0, 1.04)], 0.124, mats["cloak_shadow"], body, bevel=0.0018)
    for side in (-1, 1):
        add_curve_panel(f"XYGAME_Body_chest_cord_{side}", [(side * 0.12, 1.56), (side * 0.04, 1.43), (0.0, 1.35)], 0.130, mats["leather"], body, bevel=0.0040)
        add_curve_panel(f"XYGAME_Body_chest_blue_{side}", [(side * 0.15, 1.47), (side * 0.05, 1.38), (0.0, 1.32)], 0.132, mats["trim"], body, bevel=0.0045)
        add_ellipse_panel(f"XYGAME_Body_button_{side}", (side * 0.062, 1.38), 0.136, 0.008, 0.008, mats["gold"], body, segments=10)
    add_ellipse_panel("XYGAME_Body_pendant_node", (0.0, 1.38), 0.138, 0.012, 0.012, mats["gold"], body, segments=12)
    for obj in add_shell("XYGAME_Body_shell_pendant", (0.0, 0.145, 1.315), 0.082, 0.095, mats):
        parent_keep_world(obj, body)

    for side, key in [(-1, "arm_l"), (1, "arm_r")]:
        arm = parts[key]
        add_poly_panel(f"XYGAME_Arm{'L' if side < 0 else 'R'}_sleeve", [(side * 0.22, 1.51), (side * 0.39, 1.34), (side * 0.35, 1.08), (side * 0.24, 1.13), (side * 0.17, 1.42)], 0.072, mats["cloak"], arm, solidify=0.006)
        add_poly_panel(f"XYGAME_Arm{'L' if side < 0 else 'R'}_forearm", [(side * 0.34, 1.08), (side * 0.41, 1.03), (side * 0.44, 0.84), (side * 0.39, 0.80), (side * 0.31, 1.02)], 0.094, mats["skin"], arm, solidify=0.010)
        add_ellipse_panel(f"XYGAME_Arm{'L' if side < 0 else 'R'}_hand", (side * 0.425, 0.765), 0.102, 0.026, 0.050, mats["skin"], arm, segments=18)
        add_curve_panel(f"XYGAME_Arm{'L' if side < 0 else 'R'}_sleeve_trim", [(side * 0.265, 1.18), (side * 0.340, 1.105), (side * 0.382, 1.14)], 0.108, mats["trim"], arm, bevel=0.0040)

    for side, key in [(-1, "leg_l"), (1, "leg_r")]:
        leg = parts[key]
        x0 = side * 0.115
        inner = x0 - side * 0.020
        outer = x0 + side * 0.120
        add_poly_panel(f"XYGAME_Leg{'L' if side < 0 else 'R'}_wide_pant", [(inner, 1.02), (outer, 1.01), (outer + side * 0.025, 0.35), (inner - side * 0.018, 0.35), (inner - side * 0.010, 0.80)], 0.050, mats["pants"], leg, solidify=0.010)
        add_poly_panel(f"XYGAME_Leg{'L' if side < 0 else 'R'}_pant_shadow", [(outer - side * 0.045, 1.00), (outer, 1.00), (outer + side * 0.018, 0.38), (outer - side * 0.035, 0.38)], 0.058, mats["pants_shadow"], leg, solidify=0.003)
        add_curve_panel(f"XYGAME_Leg{'L' if side < 0 else 'R'}_front_crease", [(x0 + side * 0.022, 0.94), (x0 + side * 0.015, 0.64), (x0 + side * 0.010, 0.42)], 0.074, mats["trim_dark"], leg, bevel=0.0020)
        add_curve_panel(f"XYGAME_Leg{'L' if side < 0 else 'R'}_hem_wave", [(x0 - 0.090, 0.42), (x0 - 0.028, 0.405), (x0 + 0.032, 0.418), (x0 + 0.090, 0.407)], 0.076, mats["trim"], leg, bevel=0.0035)
        add_poly_panel(f"XYGAME_Leg{'L' if side < 0 else 'R'}_cuff", [(inner - side * 0.020, 0.36), (outer + side * 0.018, 0.36), (outer + side * 0.012, 0.31), (inner - side * 0.018, 0.31)], 0.080, mats["cloak"], leg, solidify=0.006)
        add_poly_panel(f"XYGAME_Leg{'L' if side < 0 else 'R'}_ankle", [(x0 - 0.026, 0.31), (x0 + 0.026, 0.31), (x0 + 0.026, 0.12), (x0 - 0.026, 0.12)], 0.046, mats["skin"], leg, solidify=0.010)
        add_poly_panel(f"XYGAME_Leg{'L' if side < 0 else 'R'}_boot", [(x0 - 0.060, 0.14), (x0 + 0.065, 0.14), (x0 + 0.082, 0.00), (x0 - 0.082, 0.00), (x0 - 0.072, 0.09)], 0.090, mats["boot"], leg, solidify=0.014)
        add_poly_panel(f"XYGAME_Leg{'L' if side < 0 else 'R'}_sole", [(x0 - 0.088, 0.010), (x0 + 0.092, 0.010), (x0 + 0.092, -0.022), (x0 - 0.088, -0.022)], 0.104, mats["sole"], leg, solidify=0.006)
        for i in range(3):
            z = 0.047 + i * 0.035
            add_curve_panel(f"XYGAME_Leg{'L' if side < 0 else 'R'}_boot_lace_{i}", [(x0 - 0.035, z), (x0 + 0.035, z + 0.016)], 0.114, mats["trim_dark"], leg, bevel=0.0028)

    head = parts["head"]
    add_poly_panel("XYGAME_Head_face", [(-0.142, 2.085), (-0.126, 1.930), (-0.078, 1.820), (0.0, 1.785), (0.078, 1.820), (0.126, 1.930), (0.142, 2.085), (0.090, 2.175), (0.0, 2.210), (-0.090, 2.175)], 0.112, mats["skin"], head, solidify=0.010)
    add_poly_panel("XYGAME_Head_hair_cap", [(-0.190, 2.075), (-0.150, 2.185), (-0.060, 2.250), (0.050, 2.250), (0.155, 2.190), (0.198, 2.070), (0.142, 2.030), (0.094, 2.105), (0.030, 2.070), (-0.030, 2.115), (-0.096, 2.055), (-0.150, 2.030)], 0.140, mats["hair"], head, solidify=0.012)
    hair_panels = [
        ("front_mid", [(-0.030, 2.185), (0.030, 2.185), (0.010, 1.965)]),
        ("front_l", [(-0.095, 2.150), (-0.035, 2.185), (-0.080, 1.960), (-0.125, 2.020)]),
        ("front_r", [(0.095, 2.150), (0.035, 2.185), (0.080, 1.975), (0.125, 2.030)]),
        ("side_l", [(-0.160, 2.045), (-0.210, 1.940), (-0.175, 1.775), (-0.126, 1.930)]),
        ("side_r", [(0.160, 2.045), (0.210, 1.940), (0.175, 1.790), (0.126, 1.930)]),
        ("flip_l", [(-0.175, 2.075), (-0.290, 2.015), (-0.255, 2.090)]),
        ("flip_r", [(0.175, 2.075), (0.290, 2.015), (0.255, 2.090)]),
    ]
    for name, pts in hair_panels:
        add_poly_panel(f"XYGAME_Head_hair_{name}", pts, 0.155, mats["hair_mid" if "front" in name else "hair"], head, solidify=0.008)
    add_poly_panel("XYGAME_Head_teal_streak_l", [(-0.185, 1.990), (-0.205, 1.910), (-0.176, 1.795), (-0.158, 1.920)], 0.166, mats["hair_teal"], head, solidify=0.004)
    add_poly_panel("XYGAME_Head_teal_streak_r", [(0.185, 1.990), (0.205, 1.910), (0.176, 1.805), (0.158, 1.920)], 0.166, mats["hair_teal"], head, solidify=0.004)
    add_curve_panel("XYGAME_Head_ahoge_curl", [(0.012, 2.245), (0.040, 2.318), (-0.025, 2.300)], 0.170, mats["hair"], head, bevel=0.0040)
    for side in (-1, 1):
        add_ellipse_panel(f"XYGAME_Head_eye_white_{side}", (side * 0.054, 1.990), 0.178, 0.038, 0.023, mats["eye_hi"], head, segments=24)
        add_ellipse_panel(f"XYGAME_Head_eye_iris_{side}", (side * 0.054, 1.987), 0.184, 0.018, 0.028, mats["eye"], head, segments=18)
        add_ellipse_panel(f"XYGAME_Head_eye_pupil_{side}", (side * 0.055, 1.985), 0.190, 0.008, 0.019, mats["eye_dark"], head, segments=14)
        add_ellipse_panel(f"XYGAME_Head_eye_spark_{side}", (side * 0.047, 2.000), 0.196, 0.005, 0.006, mats["eye_hi"], head, segments=10)
        add_curve_panel(f"XYGAME_Head_eye_upper_{side}", [(side * 0.020, 2.010), (side * 0.056, 2.030), (side * 0.096, 2.010)], 0.202, mats["eye_dark"], head, bevel=0.0018)
        add_ellipse_panel(f"XYGAME_Head_blush_{side}", (side * 0.088, 1.915), 0.180, 0.016, 0.006, mats["skin_shadow"], head, segments=12)
    add_curve_panel("XYGAME_Head_nose", [(-0.003, 1.955), (0.002, 1.935)], 0.202, mats["skin_shadow"], head, bevel=0.0009)
    add_curve_panel("XYGAME_Head_mouth", [(-0.016, 1.875), (-0.004, 1.870), (0.015, 1.876)], 0.204, mats["eye_dark"], head, bevel=0.0012)
    add_ellipse_panel("XYGAME_Head_hair_gold_pin", (0.145, 2.055), 0.172, 0.012, 0.012, mats["gold"], head, segments=12)

    satchel = parts["satchel"]
    add_curve_panel("XYGAME_Satchel_strap", [(-0.16, 1.56), (-0.04, 1.30), (0.10, 1.00), (0.18, 0.82)], 0.210, mats["leather"], satchel, bevel=0.009)
    add_poly_panel("XYGAME_Satchel_bag", [(0.18, 0.99), (0.36, 0.99), (0.35, 0.76), (0.17, 0.76)], 0.224, mats["leather"], satchel, solidify=0.016)
    add_poly_panel("XYGAME_Satchel_flap", [(0.19, 0.98), (0.35, 0.98), (0.33, 0.88), (0.27, 0.84), (0.20, 0.89)], 0.236, mats["cloak_shadow"], satchel, solidify=0.006)
    add_curve_panel("XYGAME_Satchel_blue_edge", [(0.20, 0.89), (0.27, 0.84), (0.33, 0.88)], 0.242, mats["trim"], satchel, bevel=0.0035)
    for obj in add_lighthouse_mark("XYGAME_Satchel_mark", 0.27, 0.246, 0.925, 0.30, mats):
        parent_keep_world(obj, satchel)

    for obj in bpy.data.objects:
        if obj.name.startswith("XYGAME_"):
            obj.select_set(True)
    bpy.context.view_layer.objects.active = root


def build_scene() -> None:
    build_scene_texture_card()


def select_asset() -> None:
    bpy.ops.object.select_all(action="DESELECT")
    root = bpy.data.objects["XYGAME_Root"]
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root


def point_camera_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_preview() -> None:
    SHOT.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 1500
    scene.render.film_transparent = False
    world = scene.world or bpy.data.worlds.new("XYGAME_preview_world")
    scene.world = world
    world.color = (0.78, 0.78, 0.75)

    cam_data = bpy.data.cameras.new("XYGAME_preview_camera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.32
    cam = bpy.data.objects.new("XYGAME_preview_camera", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (0.0, 5.55, 1.03)
    point_camera_at(cam, (0, 0.02, 1.03))

    scene.render.filepath = str(SHOT / f"{NAME}.png")
    bpy.ops.render.render(write_still=True)
    print(f"preview -> {scene.render.filepath}")


def export_assets() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    blend_path = OUT / f"{NAME}.blend"
    glb_path = OUT / f"{NAME}.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    select_asset()
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
    )
    print(f"saved blend -> {blend_path} ({blend_path.stat().st_size} bytes)")
    print(f"exported glb -> {glb_path} ({glb_path.stat().st_size} bytes)")


def main() -> None:
    build_scene()
    render_preview()
    export_assets()
    print("XY GAME PROTAGONIST DONE")


if __name__ == "__main__":
    main()
