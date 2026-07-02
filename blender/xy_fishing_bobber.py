# -*- coding: utf-8 -*-
"""
Xinyu fishing bobber model.

Generates the dedicated GLB used while the player is casting near the bay.

Run:
  blender --background --python blender/xy_fishing_bobber.py

Output:
  frontend/public/models/xy_item_fishing_bobber.glb
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


def make_mat(name, hx, rough=0.82, emit=None, es=0.0, alpha=1.0):
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
    obj.empty_display_size = 0.08
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


def add_cylinder(name, loc, radius, depth, mat, parent=None, vertices=14, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def add_cone(name, loc, radius1, radius2, depth, mat, parent=None, vertices=14, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def build_bobber():
    clear_scene()

    red = make_mat("BobberRed", "#ff6b5f")
    white = make_mat("BobberWhite", "#f7f5ea")
    line = make_mat("BobberLine", "#3d4b55")
    tip = make_mat("Emissive_BobberTip", "#fff2ad", rough=0.4, emit="#fff2ad", es=1.2)

    root = add_empty("FishingBobberRoot", (0, 0, 0))
    body = add_empty("BobberBody", (0, 0, 0.12), root)
    add_uv_sphere("BobberRedLower", (0, 0, 0), (0.22, 0.22, 0.18), red, body, segments=18, rings=8)
    add_uv_sphere("BobberWhiteBand", (0, 0, 0.08), (0.19, 0.19, 0.08), white, body, segments=18, rings=6)
    add_uv_sphere("BobberRedUpper", (0, 0, 0.17), (0.16, 0.16, 0.14), red, body, segments=16, rings=7)

    add_cylinder("BobberTip", (0, 0, 0.44), 0.035, 0.32, tip, root, vertices=12)
    add_cone("BobberTipCap", (0, 0, 0.64), 0.06, 0.015, 0.12, tip, root, vertices=12)
    add_cylinder("BobberLine", (0, 0, 0.78), 0.012, 0.32, line, root, vertices=8)

    hook = add_empty("LineHook", (0, 0, 0.98), root)
    add_cylinder("LineHookStem", (0, 0, 0), 0.009, 0.16, line, hook, vertices=8, rotation=(math.radians(25), 0, 0))

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    for child in root.children_recursive:
        child.select_set(True)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "xy_item_fishing_bobber.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
    )
    print("exported ->", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    build_bobber()
