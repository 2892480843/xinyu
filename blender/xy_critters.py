# -*- coding: utf-8 -*-
"""
心屿 · 灵物套件 Critters Kit (Batch 9) — procedural Blender build.

Cute low-poly toon creatures + a shrine bell for the island easter eggs:
  fox(林间小狐狸·Tail 节点) · cat(岛上橘猫·Tail 节点) · owl(灯塔猫头鹰·Emissive_Eyes)
  fish(浅滩发光小鱼·Emissive) · bell(神社祈愿铃 suzu·Frame+Bell 节点)

Same craft/naming as xy_beach.py (helpers inlined → fully headless). All face +Y
(→ glTF −Z; add rotation [0,π,0] in-engine), base-centred on ground (z=0), glow
slots named `Emissive_*`, movable parts (Tail / Bell) are SEPARATE named objects
(set_origin → pivot) so the engine can animate them.

Run:  /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/xy_critters.py
Out:  frontend/public/models/xy_critter_*.glb  (+ /tmp/xy_critters_lineup.png)
"""
import bpy, bmesh, math, os, random
from mathutils import Vector

OUT = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else
    "/Users/a111/chen/code/心屿/blender", "..", "frontend", "public", "models"))

# --------------------------------------------------------------------------- #
#  helpers (shared craft — copied from xy_beach.py)                            #
# --------------------------------------------------------------------------- #
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h, a=1.0):
    h = h.lstrip("#")
    return (s2l(int(h[0:2], 16) / 255), s2l(int(h[2:4], 16) / 255), s2l(int(h[4:6], 16) / 255), a)

def mat(name, hx, rough=0.9, emit=None, es=0.0, alpha=1.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = hexc(hx, alpha); b.inputs["Roughness"].default_value = rough
    if "Metallic" in b.inputs: b.inputs["Metallic"].default_value = metal
    if emit is not None:
        b.inputs["Emission Color"].default_value = hexc(emit); b.inputs["Emission Strength"].default_value = es
    if alpha < 1.0:
        m.blend_method = "BLEND"; b.inputs["Alpha"].default_value = alpha
    m.diffuse_color = hexc(hx, alpha)   # WORKBENCH MATERIAL view reads this
    return m

class MB:
    def __init__(self): self.mats = []; self.idx = {}
    def add(self, name, hx, **kw):
        i = len(self.mats); self.mats.append(mat(name, hx, **kw)); self.idx[name] = i; return i

def newobj(name, V, F, mats, fm=None, smooth=False):
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]): me.materials.append(m)
    if fm is not None: me.polygons.foreach_set("material_index", fm); me.update()
    for p in me.polygons: p.use_smooth = smooth
    return ob

def recalc(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()

def add_box(V, F, M, cx, cy, cz, w, d, h, mi, rz=0.0):
    hw, hd = w / 2, d / 2; ca, sa = math.cos(rz), math.sin(rz)
    def P(px, py, pz): return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)
    o = len(V)
    V += [P(-hw, -hd, 0), P(hw, -hd, 0), P(hw, hd, 0), P(-hw, hd, 0),
          P(-hw, -hd, h), P(hw, -hd, h), P(hw, hd, h), P(-hw, hd, h)]
    F += [(o + 0, o + 1, o + 5, o + 4), (o + 1, o + 2, o + 6, o + 5), (o + 2, o + 3, o + 7, o + 6),
          (o + 3, o + 0, o + 4, o + 7), (o + 4, o + 5, o + 6, o + 7), (o + 0, o + 3, o + 2, o + 1)]
    for _ in range(6): M.append(mi)

def add_cyl(V, F, M, cx, cy, cz, r, h, mi, sg=8, rz=0.0, r2=None):
    r2 = r if r2 is None else r2; ca, sa = math.cos(rz), math.sin(rz); o = len(V)
    def P(px, py, pz): return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append(P(r * math.cos(a), r * math.sin(a), 0))
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append(P(r2 * math.cos(a), r2 * math.sin(a), h))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o + j, o + j2, o + sg + j2, o + sg + j)); M.append(mi)
    t = len(V); V.append(P(0, 0, h)); b = len(V); V.append(P(0, 0, 0))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((t, o + sg + j, o + sg + j2)); M.append(mi); F.append((b, o + j2, o + j)); M.append(mi)

def add_cyl2(V, F, M, p0, p1, r, mi, sg=7, r2=None):
    r2 = r if r2 is None else r2; p0 = Vector(p0); p1 = Vector(p1); axis = p1 - p0
    if axis.length < 1e-6: return
    zc = axis.normalized(); up = Vector((0, 0, 1)) if abs(zc.z) < 0.9 else Vector((1, 0, 0))
    xc = zc.cross(up).normalized(); yc = zc.cross(xc).normalized(); o = len(V)
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append(tuple(p0 + xc * (r * math.cos(a)) + yc * (r * math.sin(a))))
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append(tuple(p1 + xc * (r2 * math.cos(a)) + yc * (r2 * math.sin(a))))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o + j, o + j2, o + sg + j2, o + sg + j)); M.append(mi)
    t = len(V); V.append(tuple(p1)); b = len(V); V.append(tuple(p0))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((t, o + sg + j, o + sg + j2)); M.append(mi); F.append((b, o + j2, o + j)); M.append(mi)

def add_cone(V, F, M, cx, cy, cz, rb, h, mi, sg=8, rz=0.0):
    ca, sa = math.cos(rz), math.sin(rz); o = len(V)
    def P(px, py, pz): return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append(P(rb * math.cos(a), rb * math.sin(a), 0))
    apx = len(V); V.append(P(0, 0, h)); bc = len(V); V.append(P(0, 0, 0))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o + j, o + j2, apx)); M.append(mi); F.append((bc, o + j2, o + j)); M.append(mi)

def add_ball(V, F, M, cx, cy, cz, rad, mi, sg=8, rg=5, sz=1.0):
    o = len(V); V.append((cx, cy, cz + rad * sz))
    for i in range(1, rg):
        phi = math.pi * i / rg; z = rad * math.cos(phi); rr = rad * math.sin(phi)
        for j in range(sg):
            a = 2 * math.pi * j / sg; V.append((cx + rr * math.cos(a), cy + rr * math.sin(a), cz + z * sz))
    s = len(V); V.append((cx, cy, cz - rad * sz))
    for j in range(sg): F.append((o, o + 1 + j, o + 1 + (j + 1) % sg)); M.append(mi)
    for i in range(rg - 2):
        b0 = o + 1 + i * sg; b1 = o + 1 + (i + 1) * sg
        for j in range(sg):
            j2 = (j + 1) % sg; F.append((b0 + j, b0 + j2, b1 + j2, b1 + j)); M.append(mi)
    b0 = o + 1 + (rg - 2) * sg
    for j in range(sg): F.append((s, b0 + (j + 1) % sg, b0 + j)); M.append(mi)
    return o   # start index (for post-squash)

def add_disc(V, F, M, cx, cy, cz, r, mi, sg=24, amp=0.0, seed=0):
    rnd = random.Random(seed); o = len(V); V.append((cx, cy, cz))
    for j in range(sg):
        a = 2 * math.pi * j / sg; rr = r * (1 + rnd.uniform(-amp, amp))
        V.append((cx + rr * math.cos(a), cy + rr * math.sin(a), cz))
    for j in range(sg): F.append((o, o + 1 + j, o + 1 + (j + 1) % sg)); M.append(mi)

def add_prism(V, F, M, pts, thick, cx, cy, cz, rz, mi, plane="xy"):
    n = len(pts); hz = thick / 2; ca, sa = math.cos(rz), math.sin(rz); o = len(V)
    for off in (-hz, hz):
        for (a, b) in pts:
            if plane == "xy": lx, ly, lz = a, b, off
            else:             lx, ly, lz = a, off, b
            V.append((cx + (lx * ca - ly * sa), cy + (lx * sa + ly * ca), cz + lz))
    F.append(tuple(o + i for i in range(n - 1, -1, -1))); M.append(mi)
    F.append(tuple(o + n + i for i in range(n))); M.append(mi)
    for i in range(n):
        j = (i + 1) % n; F.append((o + i, o + j, o + n + j, o + n + i)); M.append(mi)

def set_origin(ob, x, y, z):
    bpy.context.scene.cursor.location = (x, y, z)
    for o in bpy.data.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

def reset():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for d in list(blk):
            if d.users == 0: blk.remove(d)

def finish(name, V, F, mb, M, smooth=False):
    ob = newobj(name, V, F, mb.mats, fm=M, smooth=smooth); recalc(ob); return ob

def export(name):
    obs = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in bpy.data.objects: o.select_set(o.type == "MESH")
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name), export_format="GLB",
                              use_selection=True, export_apply=True, export_yup=True)
    print("exported ->", name, os.path.getsize(os.path.join(OUT, name)), "bytes")

def squash(V, o, sx, sy, sz, cy=0.0):
    for k in range(o, len(V)):
        x, y, z = V[k]; V[k] = (x * sx, (y - cy) * sy + cy, z * sz)

# ============================ 🦊 fox ===================================== #
def build_fox():
    reset(); mb = MB()
    OR = mb.add("Fur", "#e8814a"); ORD = mb.add("FurDk", "#cf6d3a"); WH = mb.add("White", "#f5ede0")
    DK = mb.add("Dark", "#2a2320"); PK = mb.add("EarIn", "#caa07c")
    V, F, M = [], [], []
    add_ball(V, F, M, 0, -0.15, 0.34, 0.5, OR, 10, 5, sz=0.95)        # rump
    add_ball(V, F, M, 0, 0.2, 0.36, 0.42, OR, 9, 5, sz=0.85)         # chest
    add_ball(V, F, M, 0, 0.26, 0.22, 0.3, WH, 8, 4, sz=0.7)          # white chest patch
    for sx in (-0.2, 0.2):                                           # front legs (sitting)
        add_cyl(V, F, M, sx, 0.36, 0.0, 0.1, 0.44, OR, 7)
        add_ball(V, F, M, sx, 0.38, 0.0, 0.12, WH, 6, 3, sz=0.5)     # paw
    add_ball(V, F, M, 0, 0.3, 0.82, 0.34, OR, 10, 5, sz=0.9)         # head
    add_ball(V, F, M, 0, 0.46, 0.7, 0.2, WH, 8, 4, sz=0.7)          # white muzzle
    add_cyl2(V, F, M, (0, 0.52, 0.76), (0, 0.82, 0.7), 0.13, OR, 7, r2=0.05)  # snout
    add_ball(V, F, M, 0, 0.84, 0.7, 0.06, DK, 6, 3)                 # nose
    for sx in (-1, 1):                                              # ears
        add_cyl2(V, F, M, (sx * 0.18, 0.22, 1.02), (sx * 0.3, 0.14, 1.4), 0.15, OR, 6, r2=0.02)
        add_cyl2(V, F, M, (sx * 0.18, 0.25, 1.04), (sx * 0.27, 0.18, 1.32), 0.08, DK, 5, r2=0.02)
    for sx in (-0.14, 0.14):                                        # eyes
        add_ball(V, F, M, sx, 0.52, 0.9, 0.05, DK, 6, 3)
    finish("Body", V, F, mb, M, smooth=True)
    V2, F2, M2 = [], [], []                                          # Tail (node, sweeps to side)
    prev = (0, -0.5, 0.32); pts = [(0.15, -0.7, 0.38), (0.35, -0.78, 0.6), (0.52, -0.65, 0.85), (0.55, -0.42, 1.05)]
    for i, p in enumerate(pts):
        add_cyl2(V2, F2, M2, prev, p, 0.22 - i * 0.03, OR if i < 3 else WH, 6, r2=0.22 - (i + 1) * 0.03); prev = p
    add_ball(V2, F2, M2, pts[-1][0], pts[-1][1], pts[-1][2], 0.17, WH, 7, 4)  # fluffy tip
    ob = finish("Tail", V2, F2, mb, M2, smooth=True); set_origin(ob, 0, -0.5, 0.32)
    export("xy_critter_fox.glb")

# ============================ 🐱 cat ===================================== #
def build_cat():
    reset(); mb = MB()
    OR = mb.add("Fur", "#eb9a52"); ST = mb.add("Stripe", "#d2802f"); WH = mb.add("White", "#f5ede0")
    DK = mb.add("Dark", "#2a2320"); PK = mb.add("Pink", "#e0918f"); GR = mb.add("Eye", "#86c46e")
    V, F, M = [], [], []
    add_ball(V, F, M, 0, -0.05, 0.42, 0.45, OR, 10, 5, sz=1.1)       # sitting body
    add_ball(V, F, M, 0, 0.14, 0.3, 0.3, WH, 8, 4, sz=0.8)          # belly
    for (px, pz) in ((0, 0.85), (0.22, 0.6), (-0.22, 0.6)):          # back stripes
        add_ball(V, F, M, px, -0.32, pz, 0.12, ST, 6, 3, sz=0.6)
    add_ball(V, F, M, 0, 0.12, 0.96, 0.3, OR, 10, 5, sz=0.92)        # head
    add_ball(V, F, M, 0, 0.32, 0.9, 0.16, WH, 7, 4, sz=0.7)         # muzzle
    for sx in (-1, 1):                                              # ears
        add_cyl2(V, F, M, (sx * 0.16, 0.06, 1.18), (sx * 0.26, 0.0, 1.46), 0.14, OR, 6, r2=0.02)
        add_cyl2(V, F, M, (sx * 0.16, 0.08, 1.2), (sx * 0.23, 0.04, 1.4), 0.07, PK, 5, r2=0.02)
    for sx in (-0.12, 0.12):                                        # eyes + pupils
        add_ball(V, F, M, sx, 0.32, 1.02, 0.055, GR, 6, 3)
        add_ball(V, F, M, sx, 0.35, 1.03, 0.022, DK, 5, 2)
    add_ball(V, F, M, 0, 0.4, 0.94, 0.04, PK, 6, 3)                 # nose
    for sx in (-0.18, 0.18):                                        # front paws
        add_ball(V, F, M, sx, 0.32, 0.04, 0.13, WH, 7, 4, sz=0.55)
    finish("Body", V, F, mb, M, smooth=True)
    V2, F2, M2 = [], [], []                                          # Tail (node, curls around front)
    prev = (0.32, -0.42, 0.22); pts = [(0.48, -0.18, 0.16), (0.52, 0.22, 0.13), (0.36, 0.52, 0.13), (0.0, 0.62, 0.13), (-0.22, 0.46, 0.16)]
    for i, p in enumerate(pts):
        add_cyl2(V2, F2, M2, prev, p, 0.12 - i * 0.011, OR if i % 2 == 0 else ST, 6, r2=0.12 - (i + 1) * 0.011); prev = p
    add_ball(V2, F2, M2, pts[-1][0], pts[-1][1], pts[-1][2], 0.08, WH, 6, 3)
    ob = finish("Tail", V2, F2, mb, M2, smooth=True); set_origin(ob, 0.32, -0.42, 0.22)
    export("xy_critter_cat.glb")

# ============================ 🦉 owl ===================================== #
def build_owl():
    reset(); mb = MB()
    BR = mb.add("Feather", "#8a6f52"); BRD = mb.add("FeatherDk", "#6e5740"); BE = mb.add("Belly", "#c4a878")
    EYE = mb.add("Emissive_Eyes", "#f2d35a", rough=0.4, emit="#ffe070", es=0.8); PUP = mb.add("Pupil", "#241c14")
    BEAK = mb.add("Beak", "#d99a4a"); FT = mb.add("Feet", "#caa24a")
    V, F, M = [], [], []
    add_ball(V, F, M, 0, 0, 0.56, 0.55, BR, 11, 6, sz=1.05)          # round body
    add_ball(V, F, M, 0, 0.28, 0.5, 0.4, BE, 9, 5, sz=0.95)         # belly
    for (sx, sz2) in ((-0.12, 0.45), (0.12, 0.45), (0, 0.62), (-0.1, 0.3), (0.1, 0.3)):
        add_ball(V, F, M, sx, 0.45, sz2, 0.045, BRD, 5, 2)          # belly speckles
    for sx in (-1, 1):                                              # ear tufts
        add_cyl2(V, F, M, (sx * 0.32, -0.05, 1.0), (sx * 0.44, -0.12, 1.32), 0.1, BR, 6, r2=0.015)
    add_ball(V, F, M, 0, 0.36, 0.8, 0.37, BE, 9, 4, sz=0.55)        # facial disc
    for sx in (-0.18, 0.18):                                        # BIG eyes (discs facing +Y)
        add_cyl2(V, F, M, (sx, 0.46, 0.8), (sx, 0.56, 0.8), 0.17, EYE, 14)
        add_cyl2(V, F, M, (sx, 0.55, 0.8), (sx, 0.6, 0.8), 0.09, PUP, 10)
    add_cyl2(V, F, M, (0, 0.5, 0.68), (0, 0.63, 0.6), 0.07, BEAK, 6, r2=0.01)  # beak
    for sx in (-1, 1):                                              # folded wings
        add_ball(V, F, M, sx * 0.52, 0.0, 0.52, 0.22, BRD, 7, 5, sz=1.3)
    for sx in (-0.18, 0.18):                                        # feet
        add_ball(V, F, M, sx, 0.22, 0.0, 0.1, FT, 6, 3, sz=0.5)
        for t in (-1, 0, 1):
            add_cyl2(V, F, M, (sx, 0.22, 0.04), (sx + t * 0.08, 0.36, 0.0), 0.03, FT, 4)
    finish("Owl", V, F, mb, M, smooth=True); export("xy_critter_owl.glb")

# ============================ 🐟 fish ==================================== #
def build_fish():
    reset(); mb = MB()
    BODY = mb.add("Emissive_Fish", "#6fd8cf", rough=0.3, emit="#8fe8df", es=1.3, alpha=0.96)
    FIN = mb.add("Emissive_Fin", "#bfeee8", rough=0.3, emit="#d6f5f0", es=1.0, alpha=0.82)
    EYE = mb.add("Eye", "#15202a")
    V, F, M = [], [], []
    o = add_ball(V, F, M, 0, 0, 0, 0.3, BODY, 9, 5); squash(V, o, 0.5, 1.55, 0.8)   # fish body
    o2 = add_ball(V, F, M, 0, -0.42, 0, 0.2, FIN, 7, 4); squash(V, o2, 0.18, 1.0, 1.5, cy=-0.42)  # tail fan
    o3 = add_ball(V, F, M, 0, 0.0, 0.22, 0.12, FIN, 6, 3); squash(V, o3, 1.0, 1.6, 0.5)  # dorsal fin
    for sx in (-0.1, 0.1):
        add_ball(V, F, M, sx, 0.26, 0.04, 0.03, EYE, 5, 2)
    finish("Fish", V, F, mb, M, smooth=True); export("xy_critter_fish.glb")

# ============================ ⛩️ bell (suzu) ============================= #
def build_bell():
    reset(); mb = MB()
    WD = mb.add("Wood", "#7a5230"); WDD = mb.add("WoodDk", "#5e3f24")
    GOLD = mb.add("Emissive_Bell", "#d8b24a", rough=0.4, emit="#e8c25a", es=0.55, metal=0.3)
    RP = mb.add("Rope", "#d05858"); RPW = mb.add("RopeW", "#f5ede0")
    V, F, M = [], [], []
    for sx in (-1, 1):                                              # posts
        add_cyl(V, F, M, sx * 0.9, 0, 0, 0.1, 2.4, WD, 8)
        add_ball(V, F, M, sx * 0.9, 0, 2.42, 0.13, WDD, 7, 4)
    add_box(V, F, M, 0, 0, 2.34, 2.2, 0.18, 0.2, WD)                # crossbar
    finish("Frame", V, F, mb, M, smooth=False)
    V2, F2, M2 = [], [], []                                          # rope + bell (Bell node, swings)
    zc = 2.34
    for i in range(6):
        add_cyl(V2, F2, M2, 0, 0, zc - 0.22, 0.09, 0.22, RP if i % 2 == 0 else RPW, 7); zc -= 0.22
    bz = zc
    add_ball(V2, F2, M2, 0, 0, bz - 0.04, 0.26, GOLD, 10, 6)        # bell body
    add_box(V2, F2, M2, 0, 0, bz - 0.3, 0.38, 0.12, 0.06, WDD)      # slit band
    add_ball(V2, F2, M2, 0, 0, bz - 0.36, 0.06, GOLD, 6, 3)         # knob
    for sx in (-0.1, 0.0, 0.1):                                     # tassels
        add_cyl(V2, F2, M2, sx, 0, bz - 0.56, 0.03, 0.26, RP, 5)
    ob = finish("Bell", V2, F2, mb, M2, smooth=True); set_origin(ob, 0, 0, 2.34)
    export("xy_critter_bell.glb")

# ============================ build + showcase =========================== #
BUILDERS = [build_fox, build_cat, build_owl, build_fish, build_bell]
GLBS = ["xy_critter_fox.glb", "xy_critter_cat.glb", "xy_critter_owl.glb", "xy_critter_fish.glb", "xy_critter_bell.glb"]

def render_lineup():
    reset(); x = 0.0
    for n in GLBS:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, n))
        for o in [ob for ob in bpy.data.objects if ob not in before and ob.parent is None]:
            o.location.x += x
        x += 3.6
    cam_data = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = ((x - 3.6) / 2, -16, 6); cam_data.lens = 30
    cam.rotation_euler = (math.radians(76), 0, 0); bpy.context.scene.camera = cam
    sun_data = bpy.data.lights.new("Sun", "SUN"); sun_data.energy = 3.5
    sun = bpy.data.objects.new("Sun", sun_data); bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(55), math.radians(15), math.radians(35))
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "MATERIAL"
    sc.render.resolution_x = 1900; sc.render.resolution_y = 620
    sc.render.filepath = "/tmp/xy_critters_lineup.png"
    bpy.ops.render.render(write_still=True); print("rendered -> /tmp/xy_critters_lineup.png")

def build_all():
    for b in BUILDERS: b()
    render_lineup()
    print("DONE — all critters built.")

if __name__ == "__main__":
    build_all()
