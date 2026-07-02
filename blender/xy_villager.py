# -*- coding: utf-8 -*-
"""
Xinyu villager base character.

Generates a small toon NPC GLB used by island villagers. The model keeps stable
node and material names so the frontend can recolor skin, hair, shirt, pants,
and hat per NPC while keeping the existing walking/bobbing logic.

Run:
  blender --background --python blender/xy_villager.py

Output:
  frontend/public/models/xy_char_villager_base.glb
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


def make_mat(name, hx, rough=0.9, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hexc(hx, alpha)
    bsdf.inputs["Roughness"].default_value = rough
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


def add_uv_sphere(name, loc, scale, mat, parent=None, segments=20, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def add_cube(name, loc, scale, mat, parent=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    if parent:
        obj.parent = parent
    return obj


def add_cylinder(name, loc, radius, depth, mat, parent=None, vertices=16, rotation=(0, 0, 0), radius2=None):
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius2, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def add_cone(name, loc, radius1, radius2, depth, mat, parent=None, vertices=20, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def add_limb(name, loc, mat, parent, rotation=(0, 0, 0), length=0.34, radius=0.045):
    return add_cylinder(name, loc, radius, length, mat, parent=parent, vertices=14, rotation=rotation)


def build_villager():
    clear_scene()

    mats = {
        "Skin": make_mat("Skin", "#e8b48d"),
        "Hair": make_mat("Hair", "#40322b"),
        "Shirt": make_mat("Shirt", "#7fa8d8"),
        "Pants": make_mat("Pants", "#4d6576"),
        "Hat": make_mat("Hat", "#e0c074"),
        "Eye": make_mat("Eye", "#222732"),
        "Blush": make_mat("Blush", "#ff9fb0", alpha=0.62),
    }

    root = add_empty("VillagerRoot", (0, 0, 0))

    body = add_uv_sphere("Body", (0, 0, 0.46), (0.16, 0.12, 0.22), mats["Shirt"], root, segments=22, rings=10)
    body.rotation_euler[0] = 0.03

    head = add_uv_sphere("Head", (0, -0.005, 0.78), (0.205, 0.19, 0.205), mats["Skin"], root, segments=24, rings=12)

    hair = add_uv_sphere("Hair", (0, -0.018, 0.84), (0.215, 0.195, 0.105), mats["Hair"], root, segments=24, rings=8)
    hair.name = "Hair"
    hair.rotation_euler[0] = -0.08

    for i, x in enumerate([-0.11, -0.04, 0.035, 0.105]):
        tuft = add_cone(
            f"HairTuft_{i}",
            (x, -0.168, 0.8 - abs(x) * 0.28),
            0.045,
            0.004,
            0.11,
            mats["Hair"],
            root,
            vertices=10,
            rotation=(math.radians(84), 0, math.radians(-18 + i * 12)),
        )
        tuft.scale.x = 0.7

    hat = add_empty("Hat", (0, 0, 0.99), root)
    add_cylinder("HatBrim", (0, 0, 0), 0.29, 0.024, mats["Hat"], parent=hat, vertices=28, rotation=(math.pi / 2, 0, 0))
    add_cone("HatCrown", (0, 0, 0.07), 0.17, 0.02, 0.16, mats["Hat"], parent=hat, vertices=24, rotation=(math.pi / 2, 0, 0))

    add_uv_sphere("EyeL", (-0.073, -0.174, 0.79), (0.028, 0.013, 0.036), mats["Eye"], root, segments=12, rings=6)
    add_uv_sphere("EyeR", (0.073, -0.174, 0.79), (0.028, 0.013, 0.036), mats["Eye"], root, segments=12, rings=6)
    add_uv_sphere("BlushL", (-0.13, -0.17, 0.725), (0.035, 0.009, 0.02), mats["Blush"], root, segments=12, rings=6)
    add_uv_sphere("BlushR", (0.13, -0.17, 0.725), (0.035, 0.009, 0.02), mats["Blush"], root, segments=12, rings=6)

    arm_l = add_empty("ArmL", (-0.18, -0.005, 0.54), root)
    arm_r = add_empty("ArmR", (0.18, -0.005, 0.54), root)
    add_limb("ArmL_Sleeve", (-0.04, -0.002, -0.12), mats["Shirt"], arm_l, rotation=(0.28, 0.08, -0.48), length=0.24, radius=0.045)
    add_limb("ArmR_Sleeve", (0.04, -0.002, -0.12), mats["Shirt"], arm_r, rotation=(0.28, -0.08, 0.48), length=0.24, radius=0.045)
    add_uv_sphere("HandL", (-0.085, -0.01, -0.23), (0.045, 0.04, 0.045), mats["Skin"], arm_l, segments=12, rings=6)
    add_uv_sphere("HandR", (0.085, -0.01, -0.23), (0.045, 0.04, 0.045), mats["Skin"], arm_r, segments=12, rings=6)

    leg_l = add_empty("LegL", (-0.07, 0, 0.24), root)
    leg_r = add_empty("LegR", (0.07, 0, 0.24), root)
    add_limb("LegL_Pants", (0, 0, -0.12), mats["Pants"], leg_l, rotation=(0, 0.04, 0.02), length=0.26, radius=0.052)
    add_limb("LegR_Pants", (0, 0, -0.12), mats["Pants"], leg_r, rotation=(0, -0.04, -0.02), length=0.26, radius=0.052)
    add_cube("ShoeL", (0, -0.025, -0.28), (0.055, 0.09, 0.028), mats["Pants"], leg_l)
    add_cube("ShoeR", (0, -0.025, -0.28), (0.055, 0.09, 0.028), mats["Pants"], leg_r)

    # Small backpack/side pouch makes silhouettes less identical in crowds while
    # still recoloring through the Pants material.
    add_cube("BackPouch", (0.13, 0.105, 0.45), (0.055, 0.035, 0.08), mats["Pants"], root, rotation=(0, 0, 0.15))

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    for obj in bpy.data.objects:
        if obj.name != root.name:
            obj.select_set(True)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "xy_char_villager_base.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
    )
    print("exported", path)


if __name__ == "__main__":
    build_villager()
