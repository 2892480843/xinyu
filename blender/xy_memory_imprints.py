# -*- coding: utf-8 -*-
"""
Xinyu memory imprint kit.

Generates five small emotion-shape GLBs used by MemoryImprints in ExploreMode:
  star, shell, flower, spark, drop

Run:
  blender --background --python blender/xy_memory_imprints.py

Output:
  frontend/public/models/xy_item_imprint_*.glb
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


def add_cone(name, loc, radius1, radius2, depth, mat, parent=None, vertices=18, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def add_cylinder(name, loc, radius, depth, mat, parent=None, vertices=16, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    shade_smooth(obj)
    if parent:
        obj.parent = parent
    return obj


def make_prism_mesh(name, points, thickness, mat, parent=None, loc=(0, 0, 0), rotation=(0, 0, 0)):
    verts = []
    faces = []
    hz = thickness / 2
    for z in (-hz, hz):
        for x, y in points:
            verts.append((x, y, z))
    n = len(points)
    faces.append(tuple(range(n - 1, -1, -1)))
    faces.append(tuple(range(n, n * 2)))
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, mat)
    obj.location = loc
    obj.rotation_euler = rotation
    if parent:
        obj.parent = parent
    return obj


def star_points(outer=0.34, inner=0.15):
    pts = []
    for i in range(10):
        r = outer if i % 2 == 0 else inner
        a = math.pi / 2 + i * math.pi / 5
        pts.append((math.cos(a) * r, math.sin(a) * r))
    return pts


def export_glb(filename):
    bpy.ops.object.select_all(action="DESELECT")
    roots = [o for o in bpy.data.objects if o.parent is None]
    for obj in roots:
        obj.select_set(True)
        for child in obj.children_recursive:
            child.select_set(True)
    if roots:
        bpy.context.view_layer.objects.active = roots[0]

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
    )
    print("exported ->", path, os.path.getsize(path), "bytes")


def build_star():
    clear_scene()
    body = make_mat("ImprintStarBody", "#ffd972")
    glow = make_mat("Emissive_ImprintStar", "#fff4b0", rough=0.4, emit="#fff4b0", es=1.8)
    root = add_empty("ImprintStar")
    make_prism_mesh("StarBody", star_points(), 0.12, body, root, loc=(0, 0, 0.34), rotation=(math.pi / 2, 0, 0))
    add_uv_sphere("StarCore", (0, -0.02, 0.34), (0.12, 0.05, 0.12), glow, root, segments=14, rings=7)
    add_cylinder("StarStem", (0, 0, 0.12), 0.035, 0.24, glow, root, vertices=7)
    export_glb("xy_item_imprint_star.glb")


def build_shell():
    clear_scene()
    body = make_mat("ImprintShellBody", "#8dd5d0")
    ridge = make_mat("ImprintShellRidge", "#5baaa9")
    glow = make_mat("Emissive_ImprintShell", "#d9fffb", rough=0.38, emit="#c8fffb", es=1.4)
    root = add_empty("ImprintShell")
    add_uv_sphere("ShellBowl", (0, 0, 0.25), (0.36, 0.18, 0.26), body, root, segments=20, rings=9)
    for x in (-0.22, -0.11, 0, 0.11, 0.22):
        cyl = add_cylinder("ShellRidge", (x, -0.02, 0.32), 0.018, 0.42, ridge, root, vertices=6, rotation=(math.radians(70), 0, 0))
        cyl.scale.x = 0.7
    add_uv_sphere("ShellPearl", (0.09, -0.2, 0.25), (0.09, 0.07, 0.09), glow, root, segments=14, rings=7)
    export_glb("xy_item_imprint_shell.glb")


def build_flower():
    clear_scene()
    petal = make_mat("ImprintFlowerPetal", "#f39ac0")
    petal_deep = make_mat("ImprintFlowerPetalDeep", "#d978a8")
    stem = make_mat("ImprintFlowerStem", "#72be75")
    glow = make_mat("Emissive_ImprintFlower", "#ffe08a", rough=0.42, emit="#ffe08a", es=1.2)
    root = add_empty("ImprintFlower")
    add_cylinder("FlowerStem", (0, 0, 0.2), 0.025, 0.4, stem, root, vertices=7)
    for i in range(6):
        a = i * math.pi / 3
        x = math.cos(a) * 0.18
        z = 0.48 + math.sin(a) * 0.08
        p = add_uv_sphere("FlowerPetal", (x, -0.02, z), (0.12, 0.035, 0.17), petal if i % 2 == 0 else petal_deep, root, segments=12, rings=6)
        p.rotation_euler.y = -a * 0.25
    add_uv_sphere("FlowerCore", (0, -0.04, 0.48), (0.105, 0.06, 0.105), glow, root, segments=14, rings=7)
    export_glb("xy_item_imprint_flower.glb")


def build_spark():
    clear_scene()
    body = make_mat("ImprintSparkBody", "#ff8b61")
    glow = make_mat("Emissive_ImprintSpark", "#ffd0a3", rough=0.38, emit="#ffc28a", es=1.8)
    root = add_empty("ImprintSpark")
    make_prism_mesh("SparkBody", [(0, 0.36), (0.1, 0.08), (0.34, 0.08), (0.14, -0.08), (0.24, -0.36), (0, -0.14), (-0.24, -0.36), (-0.14, -0.08), (-0.34, 0.08), (-0.1, 0.08)], 0.12, body, root, loc=(0, 0, 0.36), rotation=(math.pi / 2, 0, 0))
    add_uv_sphere("SparkCore", (0, -0.03, 0.36), (0.11, 0.055, 0.11), glow, root, segments=14, rings=7)
    add_cone("SparkTip", (0, -0.01, 0.68), 0.055, 0.0, 0.22, glow, root, vertices=7)
    export_glb("xy_item_imprint_spark.glb")


def build_drop():
    clear_scene()
    body = make_mat("ImprintDropBody", "#7fb8f1", rough=0.72, alpha=0.88)
    glow = make_mat("Emissive_ImprintDrop", "#cce9ff", rough=0.35, emit="#bfe6ff", es=1.3)
    root = add_empty("ImprintDrop")
    add_uv_sphere("DropBody", (0, 0, 0.23), (0.21, 0.17, 0.24), body, root, segments=18, rings=9)
    add_cone("DropTip", (0, 0, 0.53), 0.16, 0.01, 0.36, body, root, vertices=18)
    add_uv_sphere("DropCore", (0.05, -0.08, 0.31), (0.075, 0.04, 0.075), glow, root, segments=12, rings=6)
    export_glb("xy_item_imprint_drop.glb")


if __name__ == "__main__":
    build_star()
    build_shell()
    build_flower()
    build_spark()
    build_drop()
