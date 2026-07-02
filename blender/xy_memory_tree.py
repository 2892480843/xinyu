# -*- coding: utf-8 -*-
"""
Xinyu memory tree reward model.

Generates the dedicated GLB used after all memory imprints are collected.
The frontend keeps dynamic collected-color orbs, while this model supplies the
tree trunk, branches, canopy, and stable orb anchor nodes.

Run:
  blender --background --python blender/xy_memory_tree.py

Output:
  frontend/public/models/xy_item_memory_tree.glb
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


def make_mat(name, hx, rough=0.86, emit=None, es=0.0, alpha=1.0):
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
    obj.empty_display_size = 0.14
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


def add_cone(name, loc, radius1, radius2, depth, mat, parent=None, vertices=12, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def add_branch(name, root, mat, loc, rot, radius1, radius2, depth):
    obj = add_cone(name, loc, radius1, radius2, depth, mat, parent=root, vertices=10, rotation=rot)
    obj.scale.x = 0.9
    return obj


def build_memory_tree():
    clear_scene()

    trunk_mat = make_mat("MemoryTreeTrunk", "#6a533c")
    leaf_mat = make_mat("MemoryTreeLeaf", "#6fa66d")
    leaf_light_mat = make_mat("MemoryTreeLeafLight", "#9ecb7b")
    core_mat = make_mat("Emissive_MemoryTreeCore", "#fff0ba", rough=0.42, emit="#fff0ba", es=1.2)

    root = add_empty("MemoryTreeRoot", (0, 0, 0))

    trunk = add_cone("Trunk", (0, 0, 1.42), 0.34, 0.15, 2.84, trunk_mat, parent=root, vertices=9)
    trunk.scale.x = 0.86
    add_cone("TrunkKnot", (0.13, -0.19, 1.38), 0.08, 0.035, 0.06, core_mat, parent=root, vertices=9, rotation=(math.pi / 2, 0, 0))

    add_branch("BranchA", root, trunk_mat, (-0.38, 0, 2.54), (math.radians(58), math.radians(-6), math.radians(-35)), 0.12, 0.045, 1.05)
    add_branch("BranchB", root, trunk_mat, (0.42, 0.02, 2.72), (math.radians(58), math.radians(5), math.radians(42)), 0.11, 0.04, 0.98)
    add_branch("BranchC", root, trunk_mat, (0.03, 0.15, 2.92), (math.radians(64), math.radians(20), math.radians(4)), 0.1, 0.035, 0.85)

    canopy = add_empty("Canopy", (0, 0, 3.35), root)
    add_uv_sphere("CanopyMain", (0, 0, 0), (0.92, 0.68, 0.55), leaf_mat, canopy, segments=18, rings=8)
    add_uv_sphere("CanopyLeft", (-0.56, -0.02, -0.06), (0.52, 0.42, 0.38), leaf_light_mat, canopy, segments=16, rings=8)
    add_uv_sphere("CanopyRight", (0.56, 0.05, -0.03), (0.5, 0.4, 0.36), leaf_light_mat, canopy, segments=16, rings=8)
    add_uv_sphere("CanopyTop", (-0.08, 0.01, 0.46), (0.58, 0.45, 0.36), leaf_mat, canopy, segments=16, rings=8)
    add_uv_sphere("MemoryTreeCore", (0, -0.1, 0.02), (0.18, 0.12, 0.18), core_mat, canopy, segments=14, rings=7)

    anchors = [
        (-0.74, -0.08, 3.35),
        (-0.36, -0.18, 3.82),
        (0.12, -0.24, 3.92),
        (0.62, -0.1, 3.55),
        (0.8, 0.14, 3.12),
        (0.24, 0.28, 3.38),
        (-0.42, 0.22, 3.18),
        (-0.04, 0.02, 4.08),
    ]
    for i, loc in enumerate(anchors):
      add_empty(f"OrbAnchor_{i}", loc, root)

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    for child in root.children_recursive:
        child.select_set(True)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "xy_item_memory_tree.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
    )
    print("exported ->", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    build_memory_tree()
