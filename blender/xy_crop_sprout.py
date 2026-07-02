# -*- coding: utf-8 -*-
"""
Xinyu crop sprout model.

Generates the dedicated GLB used by crop rows in Explore mode.

Run:
  blender --background --python blender/xy_crop_sprout.py

Output:
  frontend/public/models/xy_nat_crop_sprout.glb
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


def make_mat(name, hx, rough=0.82):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hexc(hx)
    bsdf.inputs["Roughness"].default_value = rough
    mat.diffuse_color = hexc(hx)
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


def add_cylinder(name, loc, radius, depth, mat, parent=None, vertices=8, rotation=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def add_leaf(name, loc, scale, rotation, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=1.0, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def build_crop_sprout():
    clear_scene()

    stem = make_mat("CropStem", "#6f9d46")
    leaf_light = make_mat("CropLeafLight", "#9bcf64")
    leaf_dark = make_mat("CropLeafDark", "#4f8f4c")
    soil = make_mat("SoilAnchorMat", "#8a6a45")

    root = add_empty("CropSproutRoot", (0, 0, 0))
    soil_node = add_empty("SoilAnchor", (0, 0, 0), root)
    stem_node = add_empty("StemCluster", (0, 0, 0), root)
    leaf_node = add_empty("LeafCluster", (0, 0, 0), root)

    add_cylinder("SoilAnchorDisk", (0, 0, 0.018), 0.2, 0.036, soil, soil_node, vertices=12, scale=(1.0, 0.72, 1.0))

    stem_specs = [
        ("StemA", (-0.06, -0.02, 0.25), 0.018, 0.45, math.radians(-7), math.radians(4)),
        ("StemB", (0.04, 0.02, 0.28), 0.016, 0.50, math.radians(5), math.radians(-5)),
        ("StemC", (0.0, -0.055, 0.22), 0.014, 0.36, math.radians(9), math.radians(3)),
    ]
    for name, loc, radius, depth, rx, ry in stem_specs:
        add_cylinder(name, loc, radius, depth, stem, stem_node, vertices=8, rotation=(rx, ry, 0))

    leaves = [
        ("LeafLightA", (-0.12, -0.04, 0.34), (0.055, 0.018, 0.19), (math.radians(25), math.radians(-45), math.radians(14)), leaf_light),
        ("LeafLightB", (0.12, 0.045, 0.38), (0.055, 0.018, 0.2), (math.radians(-25), math.radians(48), math.radians(-12)), leaf_light),
        ("LeafLightC", (-0.02, 0.12, 0.46), (0.05, 0.017, 0.17), (math.radians(-40), math.radians(-8), math.radians(54)), leaf_light),
        ("LeafDarkA", (0.0, -0.13, 0.42), (0.05, 0.016, 0.17), (math.radians(42), math.radians(4), math.radians(-50)), leaf_dark),
        ("LeafDarkB", (0.07, -0.055, 0.56), (0.042, 0.014, 0.15), (math.radians(18), math.radians(36), math.radians(8)), leaf_dark),
        ("LeafDarkC", (-0.065, 0.035, 0.52), (0.042, 0.014, 0.14), (math.radians(-18), math.radians(-36), math.radians(-8)), leaf_dark),
    ]
    for name, loc, scale, rotation, mat in leaves:
        add_leaf(name, loc, scale, rotation, mat, leaf_node)

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    for child in root.children_recursive:
        child.select_set(True)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "xy_nat_crop_sprout.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
    )
    print("exported ->", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    build_crop_sprout()
