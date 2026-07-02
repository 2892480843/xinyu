# -*- coding: utf-8 -*-
"""Build the Xinyu protagonist as a manga/anime style Blender asset.

This is a fresh stylized build rather than a patch on the chibi protagonist.
The model keeps the same visual identity from the reference sheet:
white sea cloak, blue wave trim, dark layered hair, shell pendant, satchel,
lighthouse marks, cropped wide pants, and lace boots.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/xy_anime_protagonist.py

Outputs:
  frontend/public/models/xy_char_anime_protagonist.glb
  frontend/public/models/xy_char_anime_protagonist.blend
  docs/screenshots/xy_char_anime_protagonist.png
"""
from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "models"
SHOT = ROOT / "docs" / "screenshots"
NAME = "xy_char_anime_protagonist"


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
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if emission and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = hex_color(emission, 1.0)
        if emission and "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        mat.blend_method = "BLEND"
        mat.show_transparent_back = True
    return mat


def palette() -> dict[str, bpy.types.Material]:
    return {
        "skin": make_mat("XYAN_Toon_skin_warm", "#f3cdb2", roughness=0.74),
        "skin_shadow": make_mat("XYAN_Toon_skin_shadow", "#e8b997", roughness=0.78),
        "hair": make_mat("XYAN_Toon_deep_blue_hair", "#252c3e", roughness=0.68),
        "hair_mid": make_mat("XYAN_Toon_hair_mid", "#394458", roughness=0.70),
        "hair_light": make_mat("XYAN_Toon_hair_light", "#566579", roughness=0.64),
        "teal": make_mat("XYAN_Toon_teal_hair_streak", "#2f9cb0", roughness=0.64),
        "eye": make_mat("XYAN_Toon_blue_gray_eye", "#4f7188", roughness=0.50),
        "eye_dark": make_mat("XYAN_Toon_eye_ink", "#1b2333", roughness=0.65),
        "eye_hi": make_mat("XYAN_Toon_eye_highlight", "#f9fbff", roughness=0.20, emission="#ffffff", emission_strength=0.45),
        "ivory": make_mat("XYAN_Toon_ivory_cloak", "#f6edda", roughness=0.88),
        "ivory_shadow": make_mat("XYAN_Toon_ivory_cloak_shadow", "#d9cdb4", roughness=0.91),
        "ivory_deep": make_mat("XYAN_Toon_ivory_deep_fold", "#bfb39b", roughness=0.93),
        "shirt": make_mat("XYAN_Toon_white_shirt", "#fff8ec", roughness=0.84),
        "blue_trim": make_mat("XYAN_Toon_sea_blue_trim", "#69b0c3", roughness=0.72),
        "blue_trim_dark": make_mat("XYAN_Toon_deep_trim", "#3f7586", roughness=0.76),
        "pants": make_mat("XYAN_Toon_blue_gray_pants", "#7e969b", roughness=0.82),
        "pants_shadow": make_mat("XYAN_Toon_pants_shadow", "#607a80", roughness=0.86),
        "boot": make_mat("XYAN_Toon_cream_boot", "#e9dcc6", roughness=0.77),
        "sole": make_mat("XYAN_Toon_boot_sole", "#745b40", roughness=0.74),
        "leather": make_mat("XYAN_Toon_sandy_leather", "#987a58", roughness=0.70),
        "leather_dark": make_mat("XYAN_Toon_dark_leather", "#513f31", roughness=0.72),
        "gold": make_mat("XYAN_Toon_soft_gold", "#c79a4e", roughness=0.46, metallic=0.18),
        "shell": make_mat("XYAN_Toon_shell_pearl", "#efd8aa", roughness=0.62),
        "water": make_mat("XYAN_Toon_water_drop", "#47a9c1", roughness=0.34, alpha=0.78),
        "ink": make_mat("XYAN_Toon_line_ink", "#273143", roughness=0.88),
        "decal": make_mat("XYAN_Toon_faded_lighthouse_decal", "#577586", roughness=0.90, alpha=0.74),
        "outline": make_mat("XYAN_Outline_ink_material", "#2b3446", roughness=0.94),
        "blush": make_mat("XYAN_Toon_soft_blush", "#ee9da0", roughness=0.85, alpha=0.38),
    }


def reset() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


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


def add_empty(name: str, loc: tuple[float, float, float] = (0, 0, 0)) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.08
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    return obj


def add_uv_sphere(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    segments: int = 48,
    rings: int = 24,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    assign(obj, mat)
    shade_smooth(obj)
    obj.modifiers.new(name="XYAN_weighted_normals", type="WEIGHTED_NORMAL")
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
        mod = obj.modifiers.new(name="XYAN_soft_bevel", type="BEVEL")
        mod.width = bevel
        mod.segments = 4
        obj.modifiers.new(name="XYAN_weighted_normals", type="WEIGHTED_NORMAL")
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
    vertices: int = 18,
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
    vertices: int = 18,
) -> bpy.types.Object:
    a = Vector(p0)
    b = Vector(p1)
    axis = b - a
    length = axis.length
    if length < 1e-5:
        raise ValueError(f"{name} has zero length")
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius0, radius2=radius1, depth=length, location=(a + b) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
    assign(obj, mat)
    shade_smooth(obj)
    return obj


def add_flat_panel(
    name: str,
    verts: list[tuple[float, float, float]],
    mat: bpy.types.Material,
    *,
    two_sided: bool = True,
    solidify: float = 0.0,
    bevel: float = 0.0,
) -> bpy.types.Object:
    faces = [(0, 1, 2, 3)]
    if len(verts) == 5:
        faces = [(0, 1, 2, 3), (0, 3, 4)]
    elif len(verts) == 6:
        faces = [(0, 1, 2, 3), (0, 3, 4, 5)]
    if two_sided and not solidify:
        faces += [tuple(reversed(face)) for face in list(faces)]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if solidify:
        mod = obj.modifiers.new(name="XYAN_cloth_thickness", type="SOLIDIFY")
        mod.thickness = solidify
        mod.offset = 0
    if bevel:
        mod = obj.modifiers.new(name="XYAN_panel_bevel", type="BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new(name="XYAN_weighted_normals", type="WEIGHTED_NORMAL")
    return obj


def add_leaf_panel(
    name: str,
    centers: list[tuple[float, float, float]],
    widths: list[float],
    mat: bpy.types.Material,
    *,
    width_axis: tuple[float, float, float] = (1, 0, 0),
    solidify: float = 0.012,
    crease: float = 0.0,
) -> bpy.types.Object:
    axis = Vector(width_axis).normalized()
    verts: list[tuple[float, float, float]] = []
    for i, (center, width) in enumerate(zip(centers, widths)):
        c = Vector(center)
        fold = Vector((0, crease * math.sin(i / max(1, len(centers) - 1) * math.pi), 0))
        verts.append(tuple(c - axis * width + fold))
        verts.append(tuple(c + axis * width - fold))
    faces = []
    for i in range(len(centers) - 1):
        faces.append((i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if solidify:
        mod = obj.modifiers.new(name="XYAN_sheet_thickness", type="SOLIDIFY")
        mod.thickness = solidify
        mod.offset = 0
    obj.modifiers.new(name="XYAN_weighted_normals", type="WEIGHTED_NORMAL")
    return obj


def add_ribbon_panel(
    name: str,
    centers: list[tuple[float, float, float]],
    widths: list[float],
    mat: bpy.types.Material,
    *,
    normal_hint: tuple[float, float, float] = (0, 1, 0),
    solidify: float = 0.006,
) -> bpy.types.Object:
    """Create a narrow flowing strip that follows a 3D centerline."""
    if len(centers) != len(widths):
        raise ValueError(f"{name} centers and widths mismatch")
    hint = Vector(normal_hint).normalized()
    verts: list[tuple[float, float, float]] = []
    cvec = [Vector(c) for c in centers]
    for i, center in enumerate(cvec):
        if i == 0:
            tangent = cvec[1] - center
        elif i == len(cvec) - 1:
            tangent = center - cvec[i - 1]
        else:
            tangent = cvec[i + 1] - cvec[i - 1]
        if tangent.length < 1e-5:
            tangent = Vector((0, 0, 1))
        tangent.normalize()
        width_axis = tangent.cross(hint)
        if width_axis.length < 1e-5:
            width_axis = Vector((1, 0, 0))
        width_axis.normalize()
        verts.append(tuple(center - width_axis * widths[i]))
        verts.append(tuple(center + width_axis * widths[i]))
    faces: list[tuple[int, ...]] = []
    for i in range(len(cvec) - 1):
        faces.append((i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if solidify:
        mod = obj.modifiers.new(name="XYAN_ribbon_thickness", type="SOLIDIFY")
        mod.thickness = solidify
        mod.offset = 0
    obj.modifiers.new(name="XYAN_weighted_normals", type="WEIGHTED_NORMAL")
    return obj


def add_hair_cap_shell(
    name: str,
    loc: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    segments: int = 56,
    rings: int = 16,
) -> bpy.types.Object:
    """Create an open anime hair cap instead of a full helmet sphere."""
    cx, cy, cz = loc
    rx, ry, rz = scale
    verts: list[tuple[float, float, float]] = [(cx, cy, cz + rz)]
    ring_starts: list[int] = []
    for ring in range(1, rings + 1):
        t = ring / rings
        ring_starts.append(len(verts))
        for i in range(segments):
            a = math.tau * i / segments
            front = max(0.0, math.sin(a))
            side = abs(math.cos(a))
            phi_max = 1.42 * front + 2.18 * (1.0 - front)
            phi_max -= 0.12 * side * front
            phi = phi_max * t
            x = cx + rx * math.sin(phi) * math.cos(a)
            y = cy + ry * math.sin(phi) * math.sin(a)
            z = cz + rz * math.cos(phi)
            verts.append((x, y, z))
    faces: list[tuple[int, ...]] = []
    first = ring_starts[0]
    for i in range(segments):
        faces.append((0, first + i, first + ((i + 1) % segments)))
    for ring in range(rings - 1):
        a0 = ring_starts[ring]
        a1 = ring_starts[ring + 1]
        for i in range(segments):
            faces.append((a0 + i, a0 + ((i + 1) % segments), a1 + ((i + 1) % segments), a1 + i))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    shade_smooth(obj)
    obj.modifiers.new(name="XYAN_weighted_normals", type="WEIGHTED_NORMAL")
    return obj


def make_ellipse_mesh(
    name: str,
    loc: tuple[float, float, float],
    rx: float,
    rz: float,
    mat: bpy.types.Material,
    *,
    segments: int = 48,
    y: float | None = None,
) -> bpy.types.Object:
    cx, cy, cz = loc
    if y is not None:
        cy = y
    verts = [(cx, cy, cz)]
    for i in range(segments):
        a = math.tau * i / segments
        verts.append((cx + rx * math.cos(a), cy, cz + rz * math.sin(a)))
    faces = []
    for i in range(segments):
        faces.append((0, 1 + i, 1 + ((i + 1) % segments)))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def add_outline_curve(
    name: str,
    points: list[tuple[float, float, float]],
    mats: dict[str, bpy.types.Material],
    *,
    bevel: float = 0.005,
) -> bpy.types.Object:
    return add_curve(f"XYAN_Outline_{name}", points, mats["outline"], bevel=bevel, resolution=4)


def add_wave_line(
    prefix: str,
    x0: float,
    x1: float,
    y: float,
    z: float,
    amp: float,
    mats: dict[str, bpy.types.Material],
    *,
    bevel: float = 0.007,
    steps: int = 18,
) -> bpy.types.Object:
    pts = []
    for i in range(steps):
        t = i / (steps - 1)
        x = x0 + (x1 - x0) * t
        pts.append((x, y, z + math.sin(t * math.tau * 1.45) * amp))
    return add_curve(prefix, pts, mats["blue_trim"], bevel=bevel, resolution=5)


def add_lighthouse_mark(
    prefix: str,
    x: float,
    y: float,
    z: float,
    scale: float,
    mats: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objs = [
        add_box(f"{prefix}_XYAN_LighthouseMark_tower", (x, y, z), (0.030 * scale, 0.005, 0.130 * scale), mats["decal"], bevel=0.002),
        add_box(f"{prefix}_XYAN_LighthouseMark_top", (x, y + 0.002, z + 0.079 * scale), (0.072 * scale, 0.005, 0.025 * scale), mats["decal"], bevel=0.002),
        add_box(f"{prefix}_XYAN_LighthouseMark_base", (x, y + 0.002, z - 0.078 * scale), (0.095 * scale, 0.005, 0.017 * scale), mats["decal"], bevel=0.002),
    ]
    for i, dz in enumerate((-0.036, 0.008, 0.048)):
        objs.append(add_box(f"{prefix}_XYAN_LighthouseMark_band_{i}", (x, y + 0.004, z + dz * scale), (0.057 * scale, 0.005, 0.008 * scale), mats["decal"]))
    for row, dz in enumerate((-0.112, -0.132)):
        pts = []
        for i in range(13):
            t = -1.0 + 2 * i / 12
            pts.append((x + t * 0.115 * scale, y + 0.005, z + dz * scale + math.sin((t + row * 0.45) * math.pi) * 0.011 * scale))
        objs.append(add_curve(f"{prefix}_XYAN_LighthouseMark_wave_{row}", pts, mats["decal"], bevel=0.0028 * scale))
    return objs


def add_shell_pendant(
    name: str,
    loc: tuple[float, float, float],
    width: float,
    height: float,
    mats: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    x0, y0, z0 = loc
    half = width * 0.5
    verts = [(x0, y0, z0 + height * 0.44)]
    for i in range(17):
        t = -1.0 + 2.0 * i / 16.0
        x = x0 + t * half
        z = z0 - height * (0.28 + 0.10 * abs(t)) + height * 0.07 * math.cos(t * math.pi)
        verts.append((x, y0 + 0.004 * math.cos(t * math.pi), z))
    faces = [(0, i, i + 1) for i in range(1, 17)]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    shell = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(shell)
    shell.data.materials.append(mats["shell"])
    objs = [shell]
    for i, t in enumerate((-0.78, -0.52, -0.28, 0.0, 0.28, 0.52, 0.78)):
        objs.append(
            add_cylinder_between(
                f"{name}_rib_{i}",
                (x0, y0 + 0.010, z0 + height * 0.38),
                (x0 + t * half * 0.92, y0 + 0.012, z0 - height * 0.33),
                0.0038,
                mats["gold"],
                vertices=7,
            )
        )
    objs.append(add_uv_sphere(f"{name}_blue_drop", (x0, y0 + 0.018, z0 - height * 0.54), (0.014, 0.008, 0.030), mats["water"], segments=18, rings=9))
    return objs


def add_body(root: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    body = add_uv_sphere("XYAN_Body_torso", (0.0, 0.0, 1.42), (0.190, 0.125, 0.365), mats["shirt"], segments=40, rings=18)
    parent_keep_world(body, root)
    waist = add_box("XYAN_Body_dark_belt", (0.0, 0.012, 1.125), (0.392, 0.038, 0.043), mats["leather_dark"], bevel=0.008)
    parent_keep_world(waist, root)
    for x in (-0.085, 0.0, 0.085):
        parent_keep_world(add_uv_sphere(f"XYAN_Body_gold_button_{x:+.2f}", (x, 0.137, 1.420), (0.010, 0.005, 0.010), mats["gold"], segments=14, rings=7), root)

    for side in (-1, 1):
        x = side * 0.135
        pant = add_tapered_between(
            f"XYAN_Body_wide_cropped_pants_{side}",
            (x, 0.000, 1.080),
            (x + side * 0.018, 0.000, 0.365),
            0.125,
            0.158,
            mats["pants"],
            vertices=28,
        )
        pant.scale.x = 0.70
        pant.scale.y = 0.51
        parent_keep_world(pant, root)
        parent_keep_world(add_cylinder_between(f"XYAN_Body_ankle_skin_{side}", (x + side * 0.018, 0.000, 0.330), (x + side * 0.018, 0.000, 0.190), 0.037, mats["skin"], vertices=20), root)
        cuff = add_tapered_between(f"XYAN_Body_pants_cuff_{side}", (x + side * 0.018, 0.002, 0.382), (x + side * 0.018, 0.002, 0.330), 0.162, 0.152, mats["ivory"], vertices=28)
        cuff.scale.x = 0.69
        cuff.scale.y = 0.50
        parent_keep_world(cuff, root)
        boot = add_box(f"XYAN_Body_lace_boot_{side}", (x + side * 0.020, 0.035, 0.105), (0.125, 0.150, 0.200), mats["boot"], bevel=0.020)
        parent_keep_world(boot, root)
        toe = add_box(f"XYAN_Body_boot_toe_{side}", (x + side * 0.020, 0.113, 0.030), (0.148, 0.132, 0.064), mats["boot"], bevel=0.024)
        parent_keep_world(toe, root)
        parent_keep_world(add_box(f"XYAN_Body_boot_sole_{side}", (x + side * 0.020, 0.123, -0.008), (0.158, 0.155, 0.034), mats["sole"], bevel=0.010), root)
        for i in range(4):
            z = 0.052 + i * 0.037
            parent_keep_world(add_curve(f"XYAN_Outline_boot_lace_{side}_{i}", [(x - 0.038 * side, 0.126, z), (x + 0.038 * side, 0.128, z + 0.020)], mats["blue_trim_dark"], bevel=0.0038), root)
        parent_keep_world(add_wave_line(f"XYAN_Body_pants_wave_trim_{side}", x - 0.078, x + 0.078, 0.122, 0.465, 0.010, mats, bevel=0.0040), root)
        for obj in add_lighthouse_mark(f"XYAN_Body_pants_decal_{side}", x, 0.132, 0.705, 0.41, mats):
            parent_keep_world(obj, root)

    # Long, relaxed sleeves and slim hands.
    for side in (-1, 1):
        shoulder = (side * 0.220, 0.005, 1.610)
        elbow = (side * 0.340, 0.025, 1.185)
        wrist = (side * 0.398, 0.030, 0.955)
        sleeve = add_tapered_between(f"XYAN_Body_flared_sleeve_{side}", shoulder, elbow, 0.070, 0.104, mats["ivory"], vertices=22)
        sleeve.scale.x = 0.82
        sleeve.scale.y = 0.70
        parent_keep_world(sleeve, root)
        parent_keep_world(add_cylinder_between(f"XYAN_Body_forearm_skin_{side}", elbow, wrist, 0.035, mats["skin"], vertices=18), root)
        hand = add_uv_sphere(f"XYAN_Body_soft_hand_{side}", (side * 0.415, 0.035, 0.895), (0.029, 0.018, 0.064), mats["skin"], segments=20, rings=10)
        hand.rotation_euler[1] = math.radians(8 * side)
        parent_keep_world(hand, root)
        parent_keep_world(add_curve(f"XYAN_Outline_sleeve_wave_edge_{side}", [(side * 0.285, 0.103, 1.250), (side * 0.360, 0.118, 1.130), (side * 0.425, 0.104, 1.055)], mats["blue_trim"], bevel=0.0045), root)


def add_face_and_hair(root: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    neck = add_cylinder_between("XYAN_Body_neck", (0.0, 0.0, 1.705), (0.0, 0.0, 1.820), 0.052, mats["skin"], vertices=22)
    parent_keep_world(neck, root)
    head = add_uv_sphere("XYAN_Body_anime_head", (0.0, 0.020, 2.000), (0.200, 0.152, 0.265), mats["skin"], segments=64, rings=32)
    parent_keep_world(head, root)
    chin = add_uv_sphere("XYAN_Body_soft_chin", (0.0, 0.112, 1.825), (0.124, 0.052, 0.064), mats["skin_shadow"], segments=32, rings=12)
    parent_keep_world(chin, root)

    face = make_ellipse_mesh("XYAN_FacePlane_soft_anime_face", (0.0, 0.177, 1.965), 0.176, 0.224, mats["skin"], segments=64)
    parent_keep_world(face, root)
    parent_keep_world(add_curve("XYAN_Outline_face_jaw", [(-0.125, 0.186, 1.835), (-0.060, 0.197, 1.795), (0.0, 0.201, 1.784), (0.060, 0.197, 1.795), (0.125, 0.186, 1.835)], mats["skin_shadow"], bevel=0.0020), root)

    for side in (-1, 1):
        eye_white = make_ellipse_mesh(f"XYAN_FacePlane_eye_white_{side}", (side * 0.060, 0.191, 1.995), 0.048, 0.029, mats["eye_hi"], segments=32)
        iris = make_ellipse_mesh(f"XYAN_FacePlane_large_iris_{side}", (side * 0.060, 0.195, 1.992), 0.026, 0.034, mats["eye"], segments=32)
        pupil = make_ellipse_mesh(f"XYAN_FacePlane_pupil_{side}", (side * 0.061, 0.198, 1.989), 0.012, 0.023, mats["eye_dark"], segments=24)
        sparkle = make_ellipse_mesh(f"XYAN_FacePlane_eye_sparkle_{side}", (side * 0.050, 0.201, 2.010), 0.009, 0.010, mats["eye_hi"], segments=16)
        lower = add_curve(f"XYAN_Outline_eye_lower_{side}", [(side * 0.022, 0.203, 1.966), (side * 0.060, 0.206, 1.957), (side * 0.102, 0.203, 1.968)], mats["eye_dark"], bevel=0.0018)
        upper = add_curve(f"XYAN_Outline_eye_upper_{side}", [(side * 0.018, 0.207, 2.002), (side * 0.060, 0.211, 2.030), (side * 0.108, 0.207, 2.006)], mats["eye_dark"], bevel=0.0038)
        brow = add_curve(f"XYAN_Outline_soft_brow_{side}", [(side * 0.026, 0.196, 2.065), (side * 0.080, 0.199, 2.076), (side * 0.118, 0.196, 2.069)], mats["hair"], bevel=0.0030)
        blush = make_ellipse_mesh(f"XYAN_FacePlane_blush_{side}", (side * 0.096, 0.196, 1.925), 0.030, 0.012, mats["blush"], segments=24)
        for obj in (eye_white, iris, pupil, sparkle, lower, upper, brow, blush):
            parent_keep_world(obj, root)
    parent_keep_world(add_curve("XYAN_Outline_tiny_nose", [(-0.006, 0.202, 1.943), (0.005, 0.205, 1.928)], mats["skin_shadow"], bevel=0.0022), root)
    parent_keep_world(add_curve("XYAN_Outline_small_mouth", [(-0.023, 0.204, 1.865), (-0.005, 0.207, 1.858), (0.022, 0.204, 1.866)], mats["eye_dark"], bevel=0.0022), root)

    hair_cap = add_hair_cap_shell("XYAN_HairCap_layered_dark_cap", (0.0, -0.010, 2.080), (0.230, 0.178, 0.230), mats["hair"], segments=64, rings=16)
    parent_keep_world(hair_cap, root)
    crown = add_hair_cap_shell("XYAN_HairCap_crown_volume", (0.0, -0.040, 2.175), (0.190, 0.150, 0.118), mats["hair_mid"], segments=44, rings=10)
    parent_keep_world(crown, root)

    locks = [
        ("front_center", [(0.006, 0.174, 2.228), (0.000, 0.196, 2.105), (-0.010, 0.196, 1.985)], [0.032, 0.040, 0.007], mats["hair_mid"], (1, 0.0, -0.10), 0.006),
        ("front_left", [(-0.062, 0.166, 2.210), (-0.086, 0.196, 2.085), (-0.112, 0.194, 1.970)], [0.032, 0.038, 0.007], mats["hair"], (0.88, 0, -0.30), 0.007),
        ("front_right", [(0.066, 0.166, 2.210), (0.090, 0.196, 2.090), (0.112, 0.194, 1.985)], [0.033, 0.039, 0.007], mats["hair"], (0.88, 0, 0.30), 0.007),
        ("front_short_left", [(-0.135, 0.135, 2.160), (-0.165, 0.175, 2.040), (-0.150, 0.174, 1.935)], [0.026, 0.031, 0.006], mats["hair_light"], (0.58, 0, -0.82), 0.006),
        ("front_short_right", [(0.135, 0.135, 2.160), (0.165, 0.175, 2.045), (0.150, 0.174, 1.950)], [0.026, 0.031, 0.006], mats["hair_light"], (0.58, 0, 0.82), 0.006),
        ("cheek_left", [(-0.185, 0.055, 2.070), (-0.215, 0.118, 1.930), (-0.198, 0.116, 1.782)], [0.030, 0.034, 0.008], mats["hair_mid"], (0.54, 0, -0.84), 0.007),
        ("cheek_right", [(0.185, 0.055, 2.070), (0.215, 0.118, 1.935), (0.198, 0.116, 1.790)], [0.030, 0.034, 0.008], mats["hair_mid"], (0.54, 0, 0.84), 0.007),
        ("side_flip_left", [(-0.218, -0.018, 2.060), (-0.305, -0.020, 2.030), (-0.328, -0.022, 2.105)], [0.026, 0.031, 0.005], mats["hair_light"], (0.30, 0, -0.95), 0.007),
        ("side_flip_right", [(0.218, -0.018, 2.060), (0.305, -0.020, 2.030), (0.328, -0.022, 2.105)], [0.026, 0.031, 0.005], mats["hair_light"], (0.30, 0, 0.95), 0.007),
        ("back_left", [(-0.132, -0.132, 2.055), (-0.195, -0.190, 1.905), (-0.145, -0.176, 1.755)], [0.038, 0.046, 0.010], mats["hair"], (0.60, -0.1, -0.78), 0.009),
        ("back_right", [(0.132, -0.132, 2.055), (0.195, -0.190, 1.905), (0.145, -0.176, 1.760)], [0.038, 0.046, 0.010], mats["hair"], (0.60, 0.1, 0.78), 0.009),
        ("nape_center", [(0.000, -0.175, 2.020), (0.000, -0.225, 1.880), (0.010, -0.185, 1.740)], [0.044, 0.052, 0.011], mats["hair_mid"], (1, 0.0, 0.0), 0.008),
    ]
    for name, centers, widths, mat, axis, crease in locks:
        parent_keep_world(add_leaf_panel(f"XYAN_HairLock_{name}", centers, widths, mat, width_axis=axis, solidify=0.015, crease=crease), root)
        edge_pts = [tuple(Vector(c) + Vector((0, 0.014, 0))) for c in centers]
        parent_keep_world(add_curve(f"XYAN_Outline_HairLock_{name}", edge_pts, mats["outline"], bevel=0.0026), root)

    streak_l = add_leaf_panel("XYAN_HairLock_teal_streak_left", [(-0.185, 0.105, 2.045), (-0.210, 0.137, 1.930), (-0.198, 0.123, 1.810)], [0.008, 0.011, 0.003], mats["teal"], width_axis=(0.6, 0, -0.75), solidify=0.006)
    streak_r = add_leaf_panel("XYAN_HairLock_teal_streak_right", [(0.220, -0.045, 2.065), (0.290, -0.045, 2.090), (0.318, -0.035, 2.046)], [0.008, 0.011, 0.003], mats["teal"], width_axis=(0.25, 0, 0.95), solidify=0.006)
    parent_keep_world(streak_l, root)
    parent_keep_world(streak_r, root)

    parent_keep_world(add_curve("XYAN_HairLock_ahoge_curl", [(0.012, -0.020, 2.315), (0.040, -0.018, 2.390), (-0.030, -0.020, 2.385), (-0.018, -0.018, 2.340)], mats["hair"], bevel=0.006, resolution=6), root)
    parent_keep_world(add_uv_sphere("XYAN_HairLock_gold_pin", (0.150, 0.112, 2.055), (0.018, 0.008, 0.018), mats["gold"], segments=18, rings=9), root)
    parent_keep_world(add_uv_sphere("XYAN_HairLock_blue_bead", (0.172, 0.118, 2.036), (0.012, 0.007, 0.015), mats["water"], segments=16, rings=8), root)


def add_face_hair_refinement(root: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    """Second-pass polish: gentler anime face planes and smaller layered hair wisps."""
    for side in (-1, 1):
        cheek = make_ellipse_mesh(f"XYAN_FaceRefine_soft_cheek_shadow_{side}", (side * 0.092, 0.209, 1.900), 0.018, 0.006, mats["blush"], segments=18)
        parent_keep_world(cheek, root)

    nose_glow = add_curve("XYAN_FaceRefine_tiny_nose_bridge", [(-0.003, 0.213, 1.965), (0.003, 0.216, 1.943), (-0.002, 0.214, 1.928)], mats["skin_shadow"], bevel=0.0009, resolution=4)
    parent_keep_world(nose_glow, root)
    lip = add_curve("XYAN_FaceRefine_soft_smile_lip", [(-0.020, 0.216, 1.870), (-0.004, 0.219, 1.864), (0.018, 0.216, 1.871)], mats["eye_dark"], bevel=0.0015, resolution=5)
    parent_keep_world(lip, root)

    for side in (-1, 1):
        parent_keep_world(add_curve(f"XYAN_FaceRefine_upper_lash_{side}", [(side * 0.018, 0.218, 2.006), (side * 0.062, 0.223, 2.037), (side * 0.112, 0.219, 2.011)], mats["eye_dark"], bevel=0.0023, resolution=5), root)
        parent_keep_world(add_curve(f"XYAN_FaceRefine_iris_shadow_{side}", [(side * 0.045, 0.224, 2.008), (side * 0.062, 0.226, 1.995), (side * 0.079, 0.224, 2.008)], mats["eye_dark"], bevel=0.0013, resolution=4), root)
        parent_keep_world(make_ellipse_mesh(f"XYAN_FaceRefine_eye_catchlight_{side}", (side * 0.050, 0.229, 2.014), 0.006, 0.007, mats["eye_hi"], segments=14), root)

    wisps = [
        ("bang_left_inner", [(-0.030, 0.210, 2.160), (-0.045, 0.225, 2.060), (-0.055, 0.218, 1.975)], [0.011, 0.014, 0.003], mats["hair_light"]),
        ("bang_right_inner", [(0.030, 0.210, 2.160), (0.046, 0.225, 2.065), (0.056, 0.218, 1.988)], [0.011, 0.014, 0.003], mats["hair_light"]),
        ("temple_left_soft", [(-0.158, 0.130, 2.120), (-0.185, 0.160, 1.998), (-0.175, 0.150, 1.872)], [0.010, 0.013, 0.003], mats["hair"]),
        ("temple_right_soft", [(0.158, 0.130, 2.120), (0.185, 0.160, 2.000), (0.175, 0.150, 1.880)], [0.010, 0.013, 0.003], mats["hair"]),
        ("outer_left_flip", [(-0.198, 0.020, 2.085), (-0.280, 0.030, 2.030), (-0.332, 0.010, 2.060), (-0.352, -0.010, 2.110)], [0.011, 0.015, 0.014, 0.004], mats["hair_mid"]),
        ("outer_right_flip", [(0.198, 0.020, 2.085), (0.280, 0.030, 2.030), (0.332, 0.010, 2.060), (0.352, -0.010, 2.110)], [0.011, 0.015, 0.014, 0.004], mats["hair_mid"]),
        ("nape_left_wisp", [(-0.080, -0.200, 2.020), (-0.145, -0.235, 1.875), (-0.112, -0.210, 1.725)], [0.013, 0.018, 0.004], mats["hair"]),
        ("nape_right_wisp", [(0.080, -0.200, 2.020), (0.145, -0.235, 1.875), (0.112, -0.210, 1.725)], [0.013, 0.018, 0.004], mats["hair"]),
    ]
    for name, centers, widths, mat in wisps:
        parent_keep_world(add_ribbon_panel(f"XYAN_HairRefine_{name}", centers, widths, mat, normal_hint=(0, 1, 0), solidify=0.007), root)
        parent_keep_world(add_curve(f"XYAN_Outline_HairRefine_{name}", centers, mats["outline"], bevel=0.0017, resolution=5), root)

    parent_keep_world(add_curve("XYAN_HairRefine_front_highlight", [(-0.095, 0.202, 2.145), (-0.058, 0.218, 2.055), (-0.052, 0.215, 1.992)], mats["hair_light"], bevel=0.0042, resolution=5), root)
    parent_keep_world(add_curve("XYAN_HairRefine_right_teal_thread", [(0.198, 0.060, 2.070), (0.218, 0.090, 1.940), (0.205, 0.085, 1.815)], mats["teal"], bevel=0.0044, resolution=5), root)


def add_cloak_and_accessories(root: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    hood_back = add_uv_sphere("XYAN_CapePanel_soft_hood_back", (0.0, -0.085, 1.800), (0.255, 0.105, 0.112), mats["ivory"], segments=42, rings=16)
    parent_keep_world(hood_back, root)
    hood_lip = add_curve("XYAN_CapePanel_hood_inner_lip", [(-0.232, 0.045, 1.750), (-0.112, 0.102, 1.815), (0.0, 0.106, 1.836), (0.112, 0.102, 1.815), (0.232, 0.045, 1.750)], mats["ivory_deep"], bevel=0.011, resolution=5)
    parent_keep_world(hood_lip, root)

    back_panel = add_flat_panel(
        "XYAN_CapePanel_back_cloak_broad_cloth",
        [
            (-0.270, -0.100, 1.720),
            (0.270, -0.100, 1.720),
            (0.395, -0.285, 1.130),
            (0.150, -0.340, 0.990),
            (-0.150, -0.340, 0.990),
            (-0.395, -0.285, 1.130),
        ],
        mats["ivory"],
        solidify=0.018,
        bevel=0.004,
    )
    parent_keep_world(back_panel, root)
    parent_keep_world(add_wave_line("XYAN_CapePanel_back_wave_trim_upper", -0.330, 0.330, -0.350, 1.180, 0.020, mats, bevel=0.008, steps=26), root)
    parent_keep_world(add_wave_line("XYAN_CapePanel_back_wave_trim_lower", -0.300, 0.300, -0.354, 1.118, 0.016, mats, bevel=0.006, steps=24), root)
    for obj in add_lighthouse_mark("XYAN_CapePanel_back", 0.0, -0.362, 1.405, 0.92, mats):
        parent_keep_world(obj, root)

    for side in (-1, 1):
        front = add_flat_panel(
            f"XYAN_CapePanel_front_shoulder_drape_{side}",
            [
                (side * 0.048, 0.122, 1.715),
                (side * 0.278, 0.105, 1.655),
                (side * 0.360, 0.070, 1.245),
                (side * 0.168, 0.132, 1.205),
            ],
            mats["ivory"],
            solidify=0.018,
            bevel=0.004,
        )
        parent_keep_world(front, root)
        parent_keep_world(add_curve(f"XYAN_CapePanel_front_blue_wave_trim_{side}", [(side * 0.110, 0.140, 1.312), (side * 0.218, 0.132, 1.280), (side * 0.346, 0.086, 1.322)], mats["blue_trim"], bevel=0.007, resolution=5), root)
        translucent = add_flat_panel(
            f"XYAN_CapePanel_side_translucent_blue_tail_{side}",
            [
                (side * 0.275, -0.060, 1.625),
                (side * 0.455, -0.108, 1.435),
                (side * 0.460, -0.140, 0.945),
                (side * 0.288, -0.090, 1.080),
            ],
            make_mat(f"XYAN_CapePanel_blue_tail_mat_{side}", "#69b0c3", alpha=0.38, roughness=0.70),
            solidify=0.010,
        )
        parent_keep_world(translucent, root)
        parent_keep_world(add_curve(f"XYAN_Outline_cape_side_edge_{side}", [(side * 0.455, -0.110, 1.435), (side * 0.460, -0.143, 0.945)], mats["outline"], bevel=0.0046), root)

    for name, pts in {
        "cape_top": [(-0.292, -0.115, 1.710), (-0.135, -0.146, 1.760), (0.0, -0.144, 1.772), (0.135, -0.146, 1.760), (0.292, -0.115, 1.710)],
        "cape_left": [(-0.395, -0.285, 1.130), (-0.285, -0.245, 1.360), (-0.270, -0.100, 1.720)],
        "cape_right": [(0.395, -0.285, 1.130), (0.285, -0.245, 1.360), (0.270, -0.100, 1.720)],
    }.items():
        parent_keep_world(add_outline_curve(name, pts, mats, bevel=0.0044), root)

    # Cross cords, shell pendant, and small sea tassels.
    chest_lines = [
        ("rope_l", [(-0.128, 0.150, 1.650), (-0.050, 0.174, 1.535), (0.000, 0.182, 1.445)], mats["leather"], 0.005),
        ("rope_r", [(0.128, 0.150, 1.650), (0.050, 0.174, 1.535), (0.000, 0.182, 1.445)], mats["leather"], 0.005),
        ("blue_cross_l", [(-0.168, 0.153, 1.570), (-0.034, 0.184, 1.465), (0.052, 0.183, 1.390)], mats["blue_trim_dark"], 0.0058),
        ("blue_cross_r", [(0.168, 0.153, 1.570), (0.034, 0.184, 1.465), (-0.052, 0.183, 1.390)], mats["blue_trim"], 0.0058),
    ]
    for name, pts, mat, bevel in chest_lines:
        parent_keep_world(add_curve(f"XYAN_CapePanel_chest_{name}", pts, mat, bevel=bevel, resolution=4), root)
    parent_keep_world(add_uv_sphere("XYAN_ShellPendant_pearl_node", (0.0, 0.193, 1.482), (0.016, 0.008, 0.016), mats["gold"], segments=16, rings=8), root)
    for obj in add_shell_pendant("XYAN_ShellPendant_main", (0.0, 0.202, 1.410), 0.108, 0.126, mats):
        parent_keep_world(obj, root)
    for side in (-1, 1):
        parent_keep_world(add_curve(f"XYAN_ShellPendant_side_tassel_{side}", [(side * 0.105, 0.164, 1.485), (side * 0.150, 0.184, 1.310), (side * 0.138, 0.190, 1.205)], mats["leather"], bevel=0.0042, resolution=4), root)
        parent_keep_world(add_uv_sphere(f"XYAN_ShellPendant_tassel_drop_{side}", (side * 0.138, 0.200, 1.180), (0.010, 0.007, 0.024), mats["water"], segments=16, rings=8), root)

    strap = add_curve("XYAN_Satchel_crossbody_strap", [(-0.205, 0.138, 1.665), (-0.105, 0.138, 1.405), (0.018, 0.126, 1.155), (0.190, 0.100, 0.875)], mats["leather"], bevel=0.014, resolution=5)
    parent_keep_world(strap, root)
    bag = add_box("XYAN_Satchel_front_bag_body", (-0.230, 0.164, 0.955), (0.210, 0.074, 0.250), mats["leather"], bevel=0.020)
    parent_keep_world(bag, root)
    flap = add_flat_panel(
        "XYAN_Satchel_front_flap_with_decal",
        [(-0.338, 0.208, 1.058), (-0.126, 0.208, 1.050), (-0.132, 0.212, 0.938), (-0.330, 0.212, 0.920)],
        mats["ivory_shadow"],
        solidify=0.006,
        bevel=0.003,
    )
    parent_keep_world(flap, root)
    for obj in add_lighthouse_mark("XYAN_Satchel", -0.230, 0.218, 0.992, 0.45, mats):
        parent_keep_world(obj, root)
    parent_keep_world(add_curve("XYAN_Satchel_blue_edge", [(-0.334, 0.220, 0.930), (-0.230, 0.228, 0.902), (-0.130, 0.220, 0.944)], mats["blue_trim"], bevel=0.0043, resolution=5), root)
    for obj in add_shell_pendant("XYAN_Satchel_side_shell", (-0.350, 0.228, 0.925), 0.048, 0.060, mats):
        parent_keep_world(obj, root)


def add_cloth_refinement(root: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    """Add softer cloth folds so the cloak and sleeves stop reading as flat boards."""
    front_folds = [
        ("left_outer", [(-0.235, 0.142, 1.675), (-0.275, 0.120, 1.520), (-0.292, 0.096, 1.335), (-0.262, 0.116, 1.208)], 0.0035),
        ("right_outer", [(0.235, 0.142, 1.675), (0.275, 0.120, 1.520), (0.292, 0.096, 1.335), (0.262, 0.116, 1.208)], 0.0035),
    ]
    for name, pts, bevel in front_folds:
        parent_keep_world(add_curve(f"XYAN_CapeFold_front_{name}", pts, mats["ivory_deep"], bevel=bevel, resolution=6), root)

    back_folds = [
        ("left", [(-0.245, -0.345, 1.640), (-0.292, -0.360, 1.440), (-0.272, -0.355, 1.210), (-0.165, -0.352, 1.000)]),
        ("mid", [(0.000, -0.360, 1.690), (-0.018, -0.374, 1.455), (0.014, -0.370, 1.235), (0.000, -0.356, 0.995)]),
        ("right", [(0.245, -0.345, 1.640), (0.292, -0.360, 1.440), (0.272, -0.355, 1.210), (0.165, -0.352, 1.000)]),
    ]
    for name, pts in back_folds:
        parent_keep_world(add_curve(f"XYAN_CapeFold_back_{name}", pts, mats["ivory_deep"], bevel=0.0030, resolution=6), root)

    for side in (-1, 1):
        parent_keep_world(add_curve(f"XYAN_SleeveFold_front_edge_{side}", [(side * 0.258, 0.112, 1.535), (side * 0.318, 0.124, 1.355), (side * 0.380, 0.113, 1.170), (side * 0.415, 0.095, 1.055)], mats["ivory_deep"], bevel=0.0032, resolution=6), root)
        parent_keep_world(add_curve(f"XYAN_SleeveFold_inner_crease_{side}", [(side * 0.230, 0.122, 1.480), (side * 0.278, 0.136, 1.300), (side * 0.310, 0.122, 1.110)], mats["ivory_shadow"], bevel=0.0026, resolution=5), root)
        parent_keep_world(add_ribbon_panel(f"XYAN_SleeveFold_soft_cuff_shadow_{side}", [(side * 0.310, 0.128, 1.118), (side * 0.365, 0.128, 1.070), (side * 0.420, 0.115, 1.050)], [0.010, 0.014, 0.006], mats["ivory_shadow"], normal_hint=(0, 1, 0), solidify=0.004), root)

    side_sails = [
        ("left", [(-0.252, -0.090, 1.560), (-0.414, -0.138, 1.315), (-0.420, -0.164, 1.050)], [-0.060, -0.040, -0.010]),
        ("right", [(0.252, -0.090, 1.560), (0.414, -0.138, 1.315), (0.420, -0.164, 1.050)], [0.060, 0.040, 0.010]),
    ]
    for name, centers, offsets in side_sails:
        pts = [(x + off, y - 0.005, z) for (x, y, z), off in zip(centers, offsets)]
        parent_keep_world(add_curve(f"XYAN_CapeFold_side_blue_ripple_{name}", pts, mats["blue_trim_dark"], bevel=0.0036, resolution=5), root)


def add_to_all_main_outlines(root: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    # Hand-placed manga contour strokes. They export cleanly and avoid full black hulls.
    contour_sets = {
        "head_left": [(-0.190, 0.170, 2.060), (-0.202, 0.174, 1.955), (-0.154, 0.183, 1.835), (-0.060, 0.195, 1.785)],
        "head_right": [(0.190, 0.170, 2.060), (0.202, 0.174, 1.955), (0.154, 0.183, 1.835), (0.060, 0.195, 1.785)],
        "torso_left": [(-0.190, 0.130, 1.610), (-0.210, 0.135, 1.365), (-0.170, 0.135, 1.125)],
        "torso_right": [(0.190, 0.130, 1.610), (0.210, 0.135, 1.365), (0.170, 0.135, 1.125)],
        "left_leg": [(-0.226, 0.100, 1.070), (-0.235, 0.107, 0.660), (-0.205, 0.114, 0.360)],
        "right_leg": [(0.226, 0.100, 1.070), (0.235, 0.107, 0.660), (0.205, 0.114, 0.360)],
        "left_boot": [(-0.205, 0.142, 0.185), (-0.205, 0.170, 0.010), (-0.050, 0.185, 0.000)],
        "right_boot": [(0.205, 0.142, 0.185), (0.205, 0.170, 0.010), (0.050, 0.185, 0.000)],
    }
    for name, pts in contour_sets.items():
        parent_keep_world(add_outline_curve(name, pts, mats, bevel=0.0038), root)


def anime_proportion_point(point: Vector) -> Vector:
    """Nudge the procedural build closer to a 5-head manga turnaround ratio."""
    z = point.z
    if z < 0.38:
        nz = z * 1.18
        sx, sy = 0.88, 0.92
    elif z < 1.10:
        nz = 0.38 * 1.18 + (z - 0.38) * 1.12
        sx, sy = 0.88, 0.92
    elif z < 1.72:
        nz = 0.38 * 1.18 + (1.10 - 0.38) * 1.12 + (z - 1.10) * 1.06
        sx, sy = 0.92, 0.94
    else:
        base = 0.38 * 1.18 + (1.10 - 0.38) * 1.12 + (1.72 - 1.10) * 1.06
        nz = base + (z - 1.72) * 0.91
        sx, sy = 0.88, 0.90
    return Vector((point.x * sx, point.y * sy, nz))


def apply_anime_proportions(root: bpy.types.Object) -> None:
    bpy.context.view_layer.update()
    targets = [root, *root.children_recursive]
    for obj in targets:
        if obj.type not in {"MESH", "CURVE"}:
            continue
        inv = obj.matrix_world.inverted()
        if obj.type == "MESH":
            for vert in obj.data.vertices:
                world = obj.matrix_world @ vert.co
                vert.co = inv @ anime_proportion_point(world)
            obj.data.update()
            continue
        for spline in obj.data.splines:
            points = getattr(spline, "points", None)
            if not points:
                continue
            for point in points:
                world = obj.matrix_world @ Vector((point.co.x, point.co.y, point.co.z))
                local = inv @ anime_proportion_point(world)
                point.co = (local.x, local.y, local.z, point.co.w)
    bpy.context.view_layer.update()


def create_scene() -> None:
    reset()
    mats = palette()
    root = add_empty("XYAN_Body")
    add_body(root, mats)
    add_face_and_hair(root, mats)
    add_face_hair_refinement(root, mats)
    add_cloak_and_accessories(root, mats)
    add_cloth_refinement(root, mats)
    add_to_all_main_outlines(root, mats)
    apply_anime_proportions(root)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.name.startswith("XYAN_"):
            obj.select_set(True)
    bpy.context.view_layer.objects.active = root


def select_asset() -> None:
    bpy.ops.object.select_all(action="DESELECT")
    root = bpy.data.objects["XYAN_Body"]
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
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.shadow_intensity = 0.34
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 1500
    scene.render.film_transparent = False
    world = scene.world or bpy.data.worlds.new("XYAN_preview_world")
    scene.world = world
    world.color = (0.79, 0.78, 0.75)

    camera_data = bpy.data.cameras.new("XYAN_preview_camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 2.62
    camera = bpy.data.objects.new("XYAN_preview_camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera.location = (2.10, 5.75, 1.58)
    point_camera_at(camera, (0.0, 0.04, 1.18))

    sun_data = bpy.data.lights.new("XYAN_preview_sun", "SUN")
    sun_data.energy = 2.3
    sun = bpy.data.objects.new("XYAN_preview_sun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(54), math.radians(10), math.radians(137))

    area_data = bpy.data.lights.new("XYAN_preview_softbox", "AREA")
    area_data.energy = 340
    area_data.size = 4.2
    area = bpy.data.objects.new("XYAN_preview_softbox", area_data)
    bpy.context.collection.objects.link(area)
    area.location = (-2.8, 3.0, 3.0)

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
    create_scene()
    render_preview()
    export_assets()
    print("XY ANIME PROTAGONIST DONE")


if __name__ == "__main__":
    main()
