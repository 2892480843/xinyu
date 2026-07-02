# -*- coding: utf-8 -*-
"""
Xinyu shooting star effect model.

Generates the dedicated GLB used by the StarWish night sky event.

Run:
  blender --background --python blender/xy_shooting_star.py

Output:
  frontend/public/models/xy_fx_shooting_star.glb
"""

import math
import os

import bpy


OUT = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else
    "/Users/a111/chen/code/心屿/blender", "..", "frontend", "public", "models"))


def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexc(h, a=1.0):
    h = h.lstrip("#")
    return (
        s2l(int(h[0:2], 16) / 255),
        s2l(int(h[2:4], 16) / 255),
        s2l(int(h[4:6], 16) / 255),
        a,
    )


def make_mat(name, hx, rough=0.7, emit=None, es=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hexc(hx, alpha)
    bsdf.inputs["Roughness"].default_value = rough
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = hexc(emit)
        bsdf.inputs["Emission Strength"].default_value = es
    if alpha < 1.0:
        mat.blend_method = "BLEND"
        mat.use_screen_refraction = False
        bsdf.inputs["Alpha"].default_value = alpha
    mat.diffuse_color = hexc(hx, alpha)
    return mat


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights, bpy.data.cameras):
        for block in list(collection):
            collection.remove(block)


def shade_smooth(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth()
    finally:
        obj.select_set(False)


def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj


def add_empty(name, loc=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.1
    obj.location = loc
    if parent:
        obj.parent = parent
    bpy.context.collection.objects.link(obj)
    return obj


def add_uv_sphere(name, loc, scale, mat, parent=None, segments=18, rings=9):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def add_cone_between(name, start, end, radius1, radius2, mat, parent=None, vertices=18):
    sx, sy, sz = start
    ex, ey, ez = end
    mx, my, mz = ((sx + ex) / 2, (sy + ey) / 2, (sz + ez) / 2)
    dx, dy, dz = (ex - sx, ey - sy, ez - sz)
    depth = math.sqrt(dx * dx + dy * dy + dz * dz)
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=(mx, my, mz))
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (0, math.atan2(math.sqrt(dx * dx + dy * dy), dz), math.atan2(dy, dx) + math.pi / 2)
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def add_diamond(name, loc, size, mat, parent=None):
    x, y, z = loc
    verts = [
        (x, y, z + size),
        (x + size, y, z),
        (x, y + size, z),
        (x - size, y, z),
        (x, y - size, z),
        (x, y, z - size),
    ]
    faces = [
        (0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1),
        (5, 2, 1), (5, 3, 2), (5, 4, 3), (5, 1, 4),
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.name = name
    obj.rotation_euler = (0.0, 0.0, math.radians(45))
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def build_shooting_star():
    clear_scene()

    core = make_mat("Emissive_StarCore", "#fff7d6", rough=0.35, emit="#fff2a8", es=2.5)
    trail = make_mat("Emissive_StarTrail", "#ffd07a", rough=0.55, emit="#ffbf70", es=1.6, alpha=0.68)
    glow = make_mat("Transparent_StarGlow", "#fff0a8", rough=0.9, emit="#fff0a8", es=0.8, alpha=0.28)

    root = add_empty("ShootingStarRoot", (0, 0, 0))
    core_node = add_empty("Core", (0, 0, 0), root)
    trail_node = add_empty("Trail", (-0.52, 0, 0.06), root)
    glow_node = add_empty("Glow", (0, 0, 0), root)

    add_diamond("CoreStar", (0, 0, 0), 0.24, core, core_node)
    add_uv_sphere("CoreHotCenter", (0, 0, 0), (0.16, 0.16, 0.16), core, core_node, segments=16, rings=8)
    add_cone_between("TrailCone", (-1.58, 0, 0.02), (-0.12, 0, 0.02), 0.05, 0.22, trail, trail_node, vertices=18)
    add_cone_between("TrailRibbonUpper", (-1.25, 0.12, 0.12), (-0.08, 0.02, 0.04), 0.025, 0.08, trail, trail_node, vertices=12)
    add_cone_between("TrailRibbonLower", (-1.20, -0.12, -0.02), (-0.08, -0.02, 0.02), 0.025, 0.08, trail, trail_node, vertices=12)
    add_uv_sphere("GlowAura", (0.02, 0, 0), (0.36, 0.36, 0.36), glow, glow_node, segments=16, rings=8)

    root.rotation_euler = (0, 0, math.radians(-12))

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    for child in root.children_recursive:
        child.select_set(True)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "xy_fx_shooting_star.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
    )
    print("exported ->", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    build_shooting_star()
