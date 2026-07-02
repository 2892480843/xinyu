# -*- coding: utf-8 -*-
"""
Xinyu ritual artifact kit.

Generates dedicated low-poly collectible models that previously reused fallback
assets in the 16-item artifact registry:
  star_wish, sail, silent_shell, glyph_stone, bloom

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/xy_ritual_artifacts.py

Output:
  frontend/public/models/xy_item_*.glb
"""
import bmesh
import bpy
import math
import os
import random
from mathutils import Vector

OUT = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else
    "/Users/a111/chen/code/心屿/blender", "..", "frontend", "public", "models"))
BEACH_YELLOW = "#f0bb4f"


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


def mat(name, hx, rough=0.9, emit=None, es=0.0, alpha=1.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = hexc(hx, alpha)
    b.inputs["Roughness"].default_value = rough
    if "Metallic" in b.inputs:
        b.inputs["Metallic"].default_value = metal
    if emit is not None:
        b.inputs["Emission Color"].default_value = hexc(emit)
        b.inputs["Emission Strength"].default_value = es
    if alpha < 1.0:
        m.blend_method = "BLEND"
        b.inputs["Alpha"].default_value = alpha
    m.diffuse_color = hexc(hx, alpha)
    return m


class MB:
    def __init__(self):
        self.mats = []
        self.idx = {}

    def add(self, name, hx, **kw):
        i = len(self.mats)
        self.mats.append(mat(name, hx, **kw))
        self.idx[name] = i
        return i


def newobj(name, verts, faces, mats, fm=None, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    for material in mats:
        mesh.materials.append(material)
    if fm is not None:
        mesh.polygons.foreach_set("material_index", fm)
        mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    return ob


def recalc(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def add_box(V, F, M, cx, cy, cz, w, d, h, mi, rz=0.0):
    hw, hd = w / 2, d / 2
    ca, sa = math.cos(rz), math.sin(rz)

    def P(px, py, pz):
        return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)

    o = len(V)
    V += [
        P(-hw, -hd, 0), P(hw, -hd, 0), P(hw, hd, 0), P(-hw, hd, 0),
        P(-hw, -hd, h), P(hw, -hd, h), P(hw, hd, h), P(-hw, hd, h),
    ]
    F += [
        (o + 0, o + 1, o + 5, o + 4),
        (o + 1, o + 2, o + 6, o + 5),
        (o + 2, o + 3, o + 7, o + 6),
        (o + 3, o + 0, o + 4, o + 7),
        (o + 4, o + 5, o + 6, o + 7),
        (o + 0, o + 3, o + 2, o + 1),
    ]
    for _ in range(6):
        M.append(mi)


def add_cyl(V, F, M, cx, cy, cz, r, h, mi, sg=8, rz=0.0, r2=None):
    r2 = r if r2 is None else r2
    ca, sa = math.cos(rz), math.sin(rz)
    o = len(V)

    def P(px, py, pz):
        return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)

    for j in range(sg):
        a = 2 * math.pi * j / sg
        V.append(P(r * math.cos(a), r * math.sin(a), 0))
    for j in range(sg):
        a = 2 * math.pi * j / sg
        V.append(P(r2 * math.cos(a), r2 * math.sin(a), h))
    for j in range(sg):
        j2 = (j + 1) % sg
        F.append((o + j, o + j2, o + sg + j2, o + sg + j))
        M.append(mi)
    t = len(V)
    V.append(P(0, 0, h))
    b = len(V)
    V.append(P(0, 0, 0))
    for j in range(sg):
        j2 = (j + 1) % sg
        F.append((t, o + sg + j, o + sg + j2))
        M.append(mi)
        F.append((b, o + j2, o + j))
        M.append(mi)


def add_cyl2(V, F, M, p0, p1, r, mi, sg=7, r2=None):
    r2 = r if r2 is None else r2
    p0 = Vector(p0)
    p1 = Vector(p1)
    axis = p1 - p0
    if axis.length < 1e-6:
        return
    zc = axis.normalized()
    up = Vector((0, 0, 1)) if abs(zc.z) < 0.9 else Vector((1, 0, 0))
    xc = zc.cross(up).normalized()
    yc = zc.cross(xc).normalized()
    o = len(V)
    for j in range(sg):
        a = 2 * math.pi * j / sg
        V.append(tuple(p0 + xc * (r * math.cos(a)) + yc * (r * math.sin(a))))
    for j in range(sg):
        a = 2 * math.pi * j / sg
        V.append(tuple(p1 + xc * (r2 * math.cos(a)) + yc * (r2 * math.sin(a))))
    for j in range(sg):
        j2 = (j + 1) % sg
        F.append((o + j, o + j2, o + sg + j2, o + sg + j))
        M.append(mi)
    t = len(V)
    V.append(tuple(p1))
    b = len(V)
    V.append(tuple(p0))
    for j in range(sg):
        j2 = (j + 1) % sg
        F.append((t, o + sg + j, o + sg + j2))
        M.append(mi)
        F.append((b, o + j2, o + j))
        M.append(mi)


def add_ball(V, F, M, cx, cy, cz, rad, mi, sg=8, rg=5, sz=1.0):
    o = len(V)
    V.append((cx, cy, cz + rad * sz))
    for i in range(1, rg):
        phi = math.pi * i / rg
        z = rad * math.cos(phi)
        rr = rad * math.sin(phi)
        for j in range(sg):
            a = 2 * math.pi * j / sg
            V.append((cx + rr * math.cos(a), cy + rr * math.sin(a), cz + z * sz))
    s = len(V)
    V.append((cx, cy, cz - rad * sz))
    for j in range(sg):
        F.append((o, o + 1 + j, o + 1 + (j + 1) % sg))
        M.append(mi)
    for i in range(rg - 2):
        b0 = o + 1 + i * sg
        b1 = o + 1 + (i + 1) * sg
        for j in range(sg):
            j2 = (j + 1) % sg
            F.append((b0 + j, b0 + j2, b1 + j2, b1 + j))
            M.append(mi)
    b0 = o + 1 + (rg - 2) * sg
    for j in range(sg):
        F.append((s, b0 + (j + 1) % sg, b0 + j))
        M.append(mi)
    return o


def add_prism(V, F, M, pts, thick, cx, cy, cz, rz, mi, plane="xy"):
    n = len(pts)
    hz = thick / 2
    ca, sa = math.cos(rz), math.sin(rz)
    o = len(V)
    for off in (-hz, hz):
        for a, b in pts:
            if plane == "xy":
                lx, ly, lz = a, b, off
            else:
                lx, ly, lz = a, off, b
            V.append((cx + (lx * ca - ly * sa), cy + (lx * sa + ly * ca), cz + lz))
    F.append(tuple(o + i for i in range(n - 1, -1, -1)))
    M.append(mi)
    F.append(tuple(o + n + i for i in range(n)))
    M.append(mi)
    for i in range(n):
        j = (i + 1) % n
        F.append((o + i, o + j, o + n + j, o + n + i))
        M.append(mi)


def add_star_prism(V, F, M, cx, cy, cz, outer, inner, thick, mi):
    pts = []
    for k in range(10):
        r = outer if k % 2 == 0 else inner
        a = math.pi / 2 + k * math.pi / 5
        pts.append((r * math.cos(a), r * math.sin(a)))
    add_prism(V, F, M, pts, thick, cx, cy, cz, 0.0, mi, plane="xz")


def squash_since(V, start, sx, sy, sz, ox=0.0, oy=0.0, oz=0.0):
    for k in range(start, len(V)):
        x, y, z = V[k]
        V[k] = (ox + (x - ox) * sx, oy + (y - oy) * sy, oz + (z - oz) * sz)


def add_rock(V, F, M, cx, cy, cz, r, mi, seed=0, sx=1.0, sy=1.0, sz=1.0):
    rnd = random.Random(seed)
    start = add_ball(V, F, M, cx, cy, cz, r, mi, 9, 5)
    for k in range(start, len(V)):
        x, y, z = V[k]
        dx, dy, dz = x - cx, y - cy, z - cz
        jitter = 1.0 + rnd.uniform(-0.2, 0.18)
        nz = max(0.0, cz + dz * sz * jitter)
        V[k] = (cx + dx * sx * jitter, cy + dy * sy * jitter, nz)


def reset():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for data in list(block):
            if data.users == 0:
                block.remove(data)


def finish(name, V, F, mb, M, smooth=False):
    ob = newobj(name, V, F, mb.mats, fm=M, smooth=smooth)
    recalc(ob)
    return ob


def export(name):
    obs = [o for o in bpy.data.objects if o.type == "MESH"]
    if not obs:
        raise RuntimeError(f"No mesh objects to export for {name}")
    for o in bpy.data.objects:
        o.select_set(o.type == "MESH")
    bpy.context.view_layer.objects.active = obs[0]
    out_path = os.path.join(OUT, name)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )
    print("exported ->", out_path, os.path.getsize(out_path), "bytes")


def build_star_wish():
    reset()
    mb = MB()
    PAPER = mb.add("StarPaper", "#f7cf6b")
    EDGE = mb.add("StarFold", "#e4a94d")
    CORE = mb.add("Emissive_StarCore", "#fff0a8", rough=0.35, emit="#fff0a8", es=2.2)
    RIB = mb.add("WishRibbon", "#89c8d7")
    V, F, M = [], [], []
    add_cyl(V, F, M, 0, 0, 0, 0.045, 0.42, EDGE, 6)
    add_box(V, F, M, -0.18, 0, 0.13, 0.3, 0.05, 0.06, RIB, rz=-0.35)
    add_box(V, F, M, 0.18, 0, 0.16, 0.34, 0.05, 0.06, RIB, rz=0.45)
    add_star_prism(V, F, M, 0, 0, 0.78, 0.5, 0.24, 0.16, PAPER)
    for a in (0.0, math.pi / 2):
        add_box(V, F, M, 0, 0.09, 0.75, 0.72, 0.04, 0.035, EDGE, rz=a)
    add_ball(V, F, M, 0, -0.01, 0.78, 0.16, CORE, 9, 4)
    finish("StarWish", V, F, mb, M, smooth=True)
    V2, F2, M2 = [], [], []
    add_star_prism(V2, F2, M2, 0, 0, 1.02, 0.48, 0.23, 0.08, CORE)
    top = finish("StarWishTop", V2, F2, mb, M2, smooth=True)
    top.rotation_euler.x = math.pi / 2
    export("xy_item_star_wish.glb")


def build_sail():
    reset()
    mb = MB()
    HULL = mb.add("SailHull", "#9d6845")
    HULLD = mb.add("SailHullDark", "#6f4934")
    CLOTH = mb.add("SailCloth", BEACH_YELLOW)
    STRIPE = mb.add("SailStripe", "#63a8b8")
    MAST = mb.add("SailMast", "#8a5b3b")
    V, F, M = [], [], []
    hull_pts = [(-0.72, 0.0), (-0.48, 0.22), (0.48, 0.22), (0.72, 0.0), (0.46, -0.18), (-0.46, -0.18)]
    add_prism(V, F, M, hull_pts, 0.24, 0, 0, 0.12, 0, HULL, plane="xy")
    add_box(V, F, M, 0, 0.02, 0.22, 1.0, 0.08, 0.08, HULLD)
    add_cyl(V, F, M, -0.16, 0, 0.22, 0.035, 1.08, MAST, 6)
    add_prism(V, F, M, [(0, 0.0), (0.68, 0.22), (0.0, 0.88)], 0.06, -0.12, 0.02, 0.42, 0, CLOTH, plane="xz")
    add_prism(V, F, M, [(0.04, 0.04), (0.44, 0.18), (0.04, 0.32)], 0.065, -0.08, 0.055, 0.54, 0, STRIPE, plane="xz")
    add_cyl2(V, F, M, (-0.18, 0, 0.22), (0.58, 0, 0.48), 0.025, MAST, 5)
    finish("SmallSail", V, F, mb, M)
    export("xy_item_sail.glb")


def build_silent_shell():
    reset()
    mb = MB()
    OUTER = mb.add("SilentShellOuter", "#53657b")
    RIDGE = mb.add("SilentShellRidge", "#3f4c60")
    INNER = mb.add("SilentShellInner", "#d9d0c5")
    PEARL = mb.add("Emissive_SilentPearl", "#d9fbff", rough=0.3, emit="#bff8ff", es=0.9)
    V, F, M = [], [], []
    body = add_ball(V, F, M, 0, 0, 0.28, 0.52, OUTER, 12, 5, sz=0.72)
    squash_since(V, body, 1.35, 0.72, 0.72, 0, 0, 0.28)
    for x in (-0.44, -0.22, 0.0, 0.22, 0.44):
        add_cyl2(V, F, M, (x * 0.65, 0.27, 0.12), (x, 0.1, 0.57), 0.025, RIDGE, 5)
    add_cyl2(V, F, M, (-0.6, 0.18, 0.16), (0.6, 0.18, 0.16), 0.035, INNER, 7)
    pearl = add_ball(V, F, M, 0.18, 0.34, 0.18, 0.09, PEARL, 7, 3)
    squash_since(V, pearl, 1.15, 0.8, 0.8, 0.18, 0.34, 0.18)
    finish("SilentShell", V, F, mb, M, smooth=True)
    export("xy_item_silent_shell.glb")


def build_glyph_stone():
    reset()
    mb = MB()
    STONE = mb.add("GlyphStoneBody", "#747c88")
    STONED = mb.add("GlyphStoneDark", "#586170")
    GLYPH = mb.add("Emissive_Glyph", "#8fe9dd", rough=0.4, emit="#8ff4e6", es=1.6)
    V, F, M = [], [], []
    add_rock(V, F, M, 0, 0, 0.5, 0.55, STONE, seed=14, sx=0.88, sy=0.72, sz=0.95)
    add_cyl2(V, F, M, (-0.34, 0.27, 0.08), (0.34, 0.27, 0.08), 0.04, STONED, 6)
    add_cyl2(V, F, M, (0.0, 0.48, 0.28), (0.0, 0.53, 0.78), 0.026, GLYPH, 6)
    add_cyl2(V, F, M, (-0.2, 0.52, 0.58), (0.2, 0.52, 0.58), 0.024, GLYPH, 6)
    add_cyl2(V, F, M, (-0.15, 0.51, 0.42), (0.12, 0.51, 0.68), 0.02, GLYPH, 6)
    add_ball(V, F, M, 0.0, 0.55, 0.82, 0.045, GLYPH, 6, 3)
    finish("GlyphStone", V, F, mb, M, smooth=True)
    V2, F2, M2 = [], [], []
    add_cyl2(V2, F2, M2, (0.0, -0.54, 0.28), (0.0, -0.58, 0.78), 0.035, GLYPH, 7)
    add_cyl2(V2, F2, M2, (-0.22, -0.57, 0.58), (0.22, -0.57, 0.58), 0.032, GLYPH, 7)
    add_cyl2(V2, F2, M2, (-0.17, -0.56, 0.42), (0.14, -0.56, 0.68), 0.028, GLYPH, 7)
    add_ball(V2, F2, M2, 0.0, -0.6, 0.82, 0.055, GLYPH, 7, 3)
    finish("GlyphBack", V2, F2, mb, M2, smooth=True)
    export("xy_item_glyph_stone.glb")


def build_bloom():
    reset()
    mb = MB()
    STEM = mb.add("BloomStem", "#5fa960")
    LEAF = mb.add("BloomLeaf", "#77bd6d")
    PETAL = mb.add("BloomPetal", "#ee9ab7")
    PETALD = mb.add("BloomPetalDeep", "#d678a2")
    CORE = mb.add("Emissive_BloomCore", "#ffd76f", rough=0.45, emit="#ffd76f", es=0.8)
    V, F, M = [], [], []
    add_cyl(V, F, M, 0, 0, 0, 0.035, 0.78, STEM, 7)
    add_prism(V, F, M, [(0, 0), (0.34, 0.08), (0.1, 0.18)], 0.035, -0.04, 0, 0.36, -0.65, LEAF, plane="xz")
    add_prism(V, F, M, [(0, 0), (0.3, -0.08), (0.08, -0.18)], 0.035, 0.06, 0, 0.5, 0.75, LEAF, plane="xz")
    center = (0, 0, 0.88)
    for k in range(6):
        a = k * math.pi / 3
        px = math.cos(a) * 0.23
        py = math.sin(a) * 0.08
        pz = 0.88 + math.sin(a) * 0.12
        start = add_ball(V, F, M, px, py, pz, 0.18, PETAL if k % 2 == 0 else PETALD, 7, 4, sz=0.85)
        squash_since(V, start, 0.72, 0.48, 1.25, px, py, pz)
    add_ball(V, F, M, center[0], center[1] - 0.01, center[2], 0.11, CORE, 8, 4)
    finish("Bloom", V, F, mb, M, smooth=True)
    export("xy_item_bloom.glb")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    build_star_wish()
    build_sail()
    build_silent_shell()
    build_glyph_stone()
    build_bloom()
