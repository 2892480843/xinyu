# -*- coding: utf-8 -*-
"""
心屿 · 岛上生活设施 Island Life Kit (Batch 7) — procedural Blender build.

Structures that make the island feel inhabited & healing:
  well · bridge(arched) · gazebo · swing · hammock · pergola · windchime ·
  tent · stall · steppingstones · lookout

Same craft/naming as xy_houses.py / xy_coast.py. Warm-wood + sea-glass accents;
glowing bits use `Emissive_Lantern`. Deterministic. Pivot = base centre on ground
(hammock origin geometric centre). Facade/front faces +Y (Blender) -> -Z (engine).

Run headless:  blender --background --python blender/xy_island_life.py
Output -> frontend/public/models/xy_isle_*.glb  (+ /tmp/xy_isle_preview.png)
"""
import bpy, bmesh, math, os, random
from mathutils import Vector

OUT = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else
    "/Users/a111/chen/code/心屿/blender", "..", "frontend", "public", "models"))

# --------------------------------------------------------------------------- #
#  helpers (shared craft)                                                      #
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
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
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
def add_cyl2(V, F, M, p0, p1, r, mi, sg=6, r2=None):
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
def add_disc(V, F, M, cx, cy, cz, r, mi, sg=20, amp=0.0, seed=0):
    rnd = random.Random(seed); o = len(V); V.append((cx, cy, cz))
    for j in range(sg):
        a = 2 * math.pi * j / sg; rr = r * (1 + rnd.uniform(-amp, amp)); V.append((cx + rr * math.cos(a), cy + rr * math.sin(a), cz))
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
    print("exported ->", os.path.join(OUT, name), os.path.getsize(os.path.join(OUT, name)), "bytes")

WOOD = "#9c6b43"; WOODD = "#7a5a3e"; STONE = "#9aa0ab"; TEAL = "#4fa6a0"

# =============================== assets =================================== #
def build_well():
    reset(); mb = MB(); ST = mb.add("Stone", STONE); WD = mb.add("Wood", WOOD); WDD = mb.add("WoodDk", WOODD)
    RF = mb.add("Roof", TEAL); WT = mb.add("Emissive_Water", "#7fd9d2", rough=0.2, emit="#8fe6dd", es=1.0, alpha=0.8)
    V, F, M = [], [], []
    for k in range(12):                                    # 圆石井圈(逐块小石,带质感)
        a = 2 * math.pi * k / 12
        add_box(V, F, M, 1.0 * math.cos(a), 1.0 * math.sin(a), 0.0, 0.34, 0.26, 0.9, ST, rz=a)
    add_cyl(V, F, M, 0, 0, 0.86, 0.98, 0.16, WDD, 16)      # wood cap ring
    add_disc(V, F, M, 0, 0, 0.52, 0.8, WT, 18)             # water inside
    for sx in (-0.95, 0.95):
        add_box(V, F, M, sx, 0, 0.9, 0.15, 0.15, 1.9, WD)  # roof posts
    add_box(V, F, M, 0, 0, 2.8, 0.16, 0.7, 0.16, WDD)      # ridge bar
    add_prism(V, F, M, [(-1.25, -0.05), (0, 0.62), (1.25, -0.05)], 0.95, 0, 0, 2.0, 0, RF, plane="xz")  # gable roof
    add_box(V, F, M, 0, 0, 2.86, 0.12, 1.0, 0.1, WDD)      # ridge cap
    add_cyl2(V, F, M, (-0.5, 0, 2.06), (0.5, 0, 2.06), 0.05, WD, 6)    # crank axle
    add_cyl2(V, F, M, (0.5, 0, 2.06), (0.66, 0, 1.82), 0.04, WDD, 5)   # crank handle
    add_cyl(V, F, M, 0, 0, 1.3, 0.28, 0.42, WDD, 12)       # bucket
    add_cyl(V, F, M, 0, 0, 1.68, 0.3, 0.06, WD, 12)        # bucket rim
    add_cyl2(V, F, M, (0, 0, 2.02), (0, 0, 1.7), 0.02, WDD, 4)  # rope
    finish("Well", V, F, mb, M); export("xy_isle_well.glb")

def build_bridge():
    reset(); mb = MB(); DECK = mb.add("Deck", WOOD); WDD = mb.add("WoodDk", WOODD)
    V, F, M = [], [], []
    L = 6.0; arch = 1.2; n = 12
    pts = [(-L / 2 + (i / n) * L, arch * math.sin(math.pi * i / n)) for i in range(n + 1)]
    for i in range(n):                                     # deck planks (2-tone)
        y0, z0 = pts[i]; y1, z1 = pts[i + 1]
        add_box(V, F, M, 0, (y0 + y1) / 2, (z0 + z1) / 2 - 0.08, 1.85, (L / n) * 1.02, 0.14, DECK if i % 2 else WDD)
    for side in (-0.92, 0.92):                             # arched support stringers under the deck
        for i in range(n):
            y0, z0 = pts[i]; y1, z1 = pts[i + 1]
            add_cyl2(V, F, M, (side, y0, z0 - 0.2), (side, y1, z1 - 0.2), 0.08, WDD, 5)
    for side in (-0.85, 0.85):                             # railings: posts + two rails
        for i in range(0, n + 1, 2):
            y, z = pts[i]; add_box(V, F, M, side, y, z + 0.12, 0.09, 0.09, 0.82, WDD)
        for i in range(n):
            y0, z0 = pts[i]; y1, z1 = pts[i + 1]
            add_cyl2(V, F, M, (side, y0, z0 + 0.78), (side, y1, z1 + 0.78), 0.045, DECK, 5)
            add_cyl2(V, F, M, (side, y0, z0 + 0.46), (side, y1, z1 + 0.46), 0.03, DECK, 5)
    finish("Bridge", V, F, mb, M); export("xy_isle_bridge.glb")

def build_gazebo():
    reset(); mb = MB(); WD = mb.add("Wood", WOOD); WDD = mb.add("WoodDk", WOODD); RF = mb.add("Roof", TEAL); RFD = mb.add("RoofDk", "#3c857f"); FL = mb.add("Floor", "#caa878"); LMP = mb.add("Emissive_Lantern", "#ffcf86", emit="#ffd99a", es=3.0)
    V, F, M = [], [], []
    add_cyl(V, F, M, 0, 0, 0, 2.25, 0.22, FL, 16)          # round floor (smoother)
    add_cyl(V, F, M, 0, 0, 0.22, 2.1, 0.1, WDD, 16)        # floor edge trim
    posts = [(1.9 * math.cos(2 * math.pi * k / 8), 1.9 * math.sin(2 * math.pi * k / 8)) for k in range(8)]
    for k, (px, py) in enumerate(posts):
        add_box(V, F, M, px, py, 0.22, 0.16, 0.16, 2.45, WD, rz=2 * math.pi * k / 8)
    for k in range(8):                                     # railing + balusters (entry gap at k==0)
        if k == 0: continue
        x0, y0 = posts[k]; x1, y1 = posts[(k + 1) % 8]
        add_cyl2(V, F, M, (x0, y0, 0.95), (x1, y1, 0.95), 0.05, WDD, 5)
        add_cyl2(V, F, M, (x0, y0, 0.34), (x1, y1, 0.34), 0.05, WDD, 5)
        for t in (0.34, 0.66):
            add_box(V, F, M, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.34, 0.05, 0.05, 0.62, WD)
    add_cyl(V, F, M, 0, 0, 2.6, 2.45, 0.18, WDD, 16)       # ring beam
    add_cone(V, F, M, 0, 0, 2.55, 2.75, 0.55, RFD, 16)     # flared dark eave band
    add_cone(V, F, M, 0, 0, 2.98, 2.45, 1.35, RF, 16)      # roof
    add_ball(V, F, M, 0, 0, 4.18, 0.2, WDD, 8, 5)          # finial
    add_cyl(V, F, M, 0, 0, 0.22, 1.55, 0.42, FL, 16)       # inner bench ring
    add_cyl(V, F, M, 0, 0, 0.64, 1.55, 0.06, WD, 16)       # bench seat trim
    add_box(V, F, M, 0, 0, 2.55, 0.05, 0.05, 0.45, WDD)    # lantern hook
    add_ball(V, F, M, 0, 0, 2.35, 0.16, LMP, 8, 4)         # hanging lantern
    finish("Gazebo", V, F, mb, M); export("xy_isle_gazebo.glb")

def build_swing():
    reset(); mb = MB(); WD = mb.add("Wood", WOOD); WDD = mb.add("WoodDk", WOODD); ROPE = mb.add("Rope", "#cabfa8"); SEAT = mb.add("Seat", "#a9794f")
    V, F, M = [], [], []
    for sx in (-1.2, 1.2):                                 # two A-frames
        add_cyl2(V, F, M, (sx - 0.5, -0.7, 0), (sx, 0, 2.2), 0.1, WD, 6)
        add_cyl2(V, F, M, (sx + 0.5, 0.7, 0), (sx, 0, 2.2), 0.1, WD, 6)
    add_cyl2(V, F, M, (-1.2, 0, 2.2), (1.2, 0, 2.2), 0.1, WDD, 6)   # top bar
    for rx in (-0.5, 0.5):
        add_cyl2(V, F, M, (rx, 0, 2.15), (rx, 0, 0.55), 0.03, ROPE, 4)  # ropes
    for sy in (-0.13, 0.13):                               # seat planks (slats)
        add_box(V, F, M, 0, sy, 0.5, 1.3, 0.2, 0.07, SEAT)
    for rx in (-0.5, 0.5):
        add_ball(V, F, M, rx, 0, 0.55, 0.05, ROPE, 6, 3)   # rope knots
    finish("Swing", V, F, mb, M); export("xy_isle_swing.glb")

def build_hammock():
    reset(); mb = MB(); WD = mb.add("Wood", WOODD); FA = mb.add("Fabric", "#e8a06a"); FB = mb.add("FabricB", "#f3ece0")
    V, F, M = [], [], []
    for sx in (-1.7, 1.7): add_cyl(V, F, M, sx, 0, 0, 0.12, 1.6, WD, 6)   # posts
    n = 10; top = 1.4; sag = 0.9
    for w2 in (-0.5, 0.5):                                 # two long edges of the sheet
        pass
    # build the sagging sheet as a grid
    grid = []
    for i in range(n + 1):
        t = i / n; x = -1.6 + t * 3.2; z = top - sag * math.sin(math.pi * t)
        grid.append((x, z))
    for i in range(n):
        x0, z0 = grid[i]; x1, z1 = grid[i + 1]; mi = FA if i % 2 == 0 else FB
        o = len(V)
        V += [(x0, -0.55, z0), (x1, -0.55, z1), (x1, 0.55, z1), (x0, 0.55, z0)]
        F.append((o, o + 1, o + 2, o + 3)); M.append(mi)
        F.append((o + 3, o + 2, o + 1, o)); M.append(mi)   # double-sided
    for sx in (-1.55, 1.55):                               # 流苏(两端垂穗)
        for fy in (-0.45, -0.15, 0.15, 0.45):
            add_cyl2(V, F, M, (sx, fy, 1.38), (sx + (0.08 if sx > 0 else -0.08), fy, 1.1), 0.02, FB, 3)
    finish("Hammock", V, F, mb, M); export("xy_isle_hammock.glb")

def build_pergola():
    reset(); mb = MB(); WD = mb.add("Wood", WOOD); WDD = mb.add("WoodDk", WOODD)
    LA = mb.add("FlowerA", "#f2a3c0"); LB = mb.add("FlowerB", "#d7c2ef"); LF = mb.add("Leaf", "#69ba66")
    V, F, M = [], [], []
    for (x, y) in ((-1.1, -0.6), (1.1, -0.6), (-1.1, 0.6), (1.1, 0.6)):
        add_box(V, F, M, x, y, 0, 0.16, 0.16, 2.4, WD)     # posts
    for y in (-0.6, 0.6): add_box(V, F, M, 0, y, 2.4, 2.6, 0.14, 0.14, WDD)  # beams
    for k in range(9): add_box(V, F, M, -1.1 + k * 0.275, 0, 2.5, 0.08, 1.5, 0.08, WDD)  # cross slats (denser)
    for j in range(5): add_box(V, F, M, 0, -0.8 + j * 0.4, 2.56, 2.4, 0.07, 0.07, WDD)   # lattice (other dir)
    rnd = random.Random(2)
    for _ in range(40):                                    # fuller climbing blossoms over the top
        x = rnd.uniform(-1.35, 1.35); y = rnd.uniform(-0.85, 0.85); z = 2.56 + rnd.uniform(-0.12, 0.4)
        add_ball(V, F, M, x, y, z, rnd.uniform(0.12, 0.24), rnd.choice([LA, LB, LF, LF]), 6, 3)
    for (x, y) in ((-1.1, -0.6), (1.1, -0.6), (-1.1, 0.6), (1.1, 0.6)):  # blossoms climbing the posts
        for _ in range(4):
            add_ball(V, F, M, x + rnd.uniform(-0.2, 0.2), y + rnd.uniform(-0.2, 0.2), rnd.uniform(1.0, 2.3), rnd.uniform(0.1, 0.18), rnd.choice([LA, LB, LF]), 6, 3)
    finish("Pergola", V, F, mb, M); export("xy_isle_pergola.glb")

def build_windchime():
    reset(); mb = MB(); WD = mb.add("Wood", WOOD); WDD = mb.add("WoodDk", WOODD)
    CH = mb.add("Chime", "#bfd9d4", metal=0.6, rough=0.4); TAG = mb.add("Tag", "#f3ece0"); LMP = mb.add("Emissive_Lantern", "#ffcf86", emit="#ffd99a", es=3.0)
    V, F, M = [], [], []
    add_box(V, F, M, 0, 0, 0, 0.18, 0.18, 2.2, WD)         # post
    add_box(V, F, M, 0, 0, 2.2, 1.6, 0.14, 0.14, WDD)      # cross arm
    for cx in (-0.66, -0.4, -0.14, 0.14, 0.4, 0.66):       # 6 chimes, varied length + bead caps + tags
        zb = 1.45 + 0.12 * math.cos(cx * 3)
        add_cyl2(V, F, M, (cx, 0, 2.14), (cx, 0, zb), 0.045, CH, 6)
        add_ball(V, F, M, cx, 0, 2.16, 0.06, CH, 6, 3)     # top bead
        add_prism(V, F, M, [(-0.11, 0), (0.11, 0), (0.11, -0.24), (-0.11, -0.24)], 0.02, cx, 0.0, zb - 0.04, 0, TAG, plane="xz")  # wish tag
    add_ball(V, F, M, 0, 0, 2.42, 0.17, LMP, 8, 4)         # lantern on top
    add_cyl(V, F, M, 0, 0, 2.36, 0.05, 0.1, WDD, 6)        # lantern cap
    finish("Windchime", V, F, mb, M); export("xy_isle_windchime.glb")

def build_tent():
    reset(); mb = MB(); CA = mb.add("Canvas", "#d98b5a"); CB = mb.add("CanvasB", "#e3cda0"); WD = mb.add("Wood", WOODD); MAT = mb.add("Mat", "#b7a98a")
    V, F, M = [], [], []
    # A-frame canvas (triangular prism along Y)
    add_prism(V, F, M, [(-1.4, 0), (1.4, 0), (0, 1.8)], 2.6, 0, 0, 0, 0, CA, plane="xz")
    add_prism(V, F, M, [(-1.4, 0), (-0.7, 0), (0, 1.8)], 2.62, 0, 0, 0.0, 0, CB, plane="xz")  # stripe
    add_cyl2(V, F, M, (0, -1.3, 1.8), (0, 1.3, 1.8), 0.06, WD, 5)   # ridge pole
    add_box(V, F, M, 0, -1.35, 0, 1.2, 0.05, 1.4, CB)      # door flap (front -Y)
    add_disc(V, F, M, 0, -2.2, 0.02, 0.9, MAT, 16)         # mat in front
    for ry in (1.3, -1.3):                                 # guy-lines from ridge ends to ground pegs
        for sx in (-1.0, 1.0):
            add_cyl2(V, F, M, (0, ry, 1.8), (sx * 1.6, ry * 1.5, 0.0), 0.02, WD, 3)
            add_box(V, F, M, sx * 1.6, ry * 1.5, 0.0, 0.06, 0.06, 0.22, WD)    # peg
    add_ball(V, F, M, 0, 1.3, 1.82, 0.07, WD, 6, 3)        # ridge pole tops
    add_ball(V, F, M, 0, -1.3, 1.82, 0.07, WD, 6, 3)
    finish("Tent", V, F, mb, M); export("xy_isle_tent.glb")

def build_stall():
    reset(); mb = MB(); WD = mb.add("Wood", WOOD); WDD = mb.add("WoodDk", WOODD)
    CA = mb.add("Canopy", "#5aa9a0"); CB = mb.add("CanopyB", "#f3ece0"); GA = mb.add("GoodsA", "#e8826a"); GB = mb.add("GoodsB", "#f6cf6f")
    V, F, M = [], [], []
    for (x, y) in ((-1.4, -0.9), (1.4, -0.9), (-1.4, 0.9), (1.4, 0.9)):
        add_box(V, F, M, x, y, 0, 0.12, 0.12, 2.2, WD)
    add_box(V, F, M, 0, 0.2, 0.7, 3.0, 1.0, 0.5, WDD)      # counter
    # striped slanted canopy
    add_prism(V, F, M, [(-1.7, 0), (1.7, 0), (1.7, 0.5), (-1.7, 0.5)], 2.2, 0, -0.1, 2.2, 0, CA, plane="xz")
    for k in range(4):
        add_box(V, F, M, -1.1 + k * 0.75, -0.1, 2.45, 0.4, 2.2, 0.06, CB)
    for k in range(8):                                     # scalloped valance hanging off the canopy front
        add_cone(V, F, M, -1.55 + k * 0.44, 1.0, 2.35, 0.16, -0.26, CA if k % 2 else CB, 3)
    add_box(V, F, M, 0, 1.06, 2.78, 1.7, 0.08, 0.4, WDD)   # sign board
    for k in range(5):                                     # goods on the counter (fuller)
        add_ball(V, F, M, -0.9 + k * 0.45, 0.15, 0.97, 0.16, GA if k % 2 else GB, 7, 4)
    add_cyl(V, F, M, 0.95, 0.3, 0.95, 0.18, 0.4, GB, 10)   # a jar / basket
    finish("Stall", V, F, mb, M); export("xy_isle_stall.glb")

def build_steppingstones():
    reset(); mb = MB(); ST = mb.add("Stone", STONE); ST2 = mb.add("StoneB", "#b0b6c0")
    MOSS = mb.add("Moss", "#6fae5e"); WT = mb.add("Emissive_Water", "#7fd9d2", rough=0.2, emit="#8fe6dd", es=0.8, alpha=0.7)
    V, F, M = [], [], []; rnd = random.Random(6)
    for k in range(5):
        x = (k - 2) * 0.1 + rnd.uniform(-0.2, 0.2); y = -2.0 + k * 1.0; r = rnd.uniform(0.46, 0.62)
        add_disc(V, F, M, x, y, 0.02, r + 0.22, WT, 16)                   # water ripple disc
        add_cyl(V, F, M, x, y, 0, r, 0.18, ST if k % 2 else ST2, 10)      # stone
        add_disc(V, F, M, x + 0.06, y + 0.04, 0.19, r * 0.5, MOSS, 8)     # moss patch on top
    finish("SteppingStones", V, F, mb, M); export("xy_isle_steppingstones.glb")

def build_lookout():
    reset(); mb = MB(); WD = mb.add("Wood", WOOD); WDD = mb.add("WoodDk", WOODD); RF = mb.add("Roof", TEAL); RFD = mb.add("RoofDk", "#3c857f"); PL = mb.add("Plank", "#a9794f"); FLAG = mb.add("Flag", "#e8826a")
    V, F, M = [], [], []
    for (x, y) in ((-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)):
        add_box(V, F, M, x, y, 0, 0.16, 0.16, 3.2, WD)     # stilt legs
        add_cyl2(V, F, M, (x, y, 1.0), (-x * 0.5, -y * 0.5, 1.7), 0.06, WDD, 4)  # cross brace toward centre
    add_box(V, F, M, 0, 0, 3.2, 2.7, 2.7, 0.2, PL)         # platform
    for (sx, sy) in ((-1.25, 0), (1.25, 0), (0, 1.25)):    # railing on 3 sides (open front -Y) + balusters
        w, d = (0.1, 2.6) if sy == 0 else (2.6, 0.1)
        add_box(V, F, M, sx, sy, 3.4, w, d, 0.66, WDD)
        for t in (-0.8, -0.4, 0.0, 0.4, 0.8):
            add_box(V, F, M, sx + (t if sy != 0 else 0), sy + (t if sy == 0 else 0), 3.4, 0.05, 0.05, 0.6, WD)
    add_cone(V, F, M, 0, 0, 3.95, 2.0, 0.45, RFD, 6)       # roof eave band (dark)
    add_cone(V, F, M, 0, 0, 4.3, 1.7, 1.0, RF, 6)          # roof
    add_ball(V, F, M, 0, 0, 5.28, 0.13, WDD, 6, 4)         # finial knob
    add_cyl(V, F, M, 0, 0, 5.3, 0.03, 0.7, WD, 4)          # flag pole
    add_prism(V, F, M, [(0, 0), (0.5, -0.12), (0.5, -0.34), (0, -0.46)], 0.02, 0.03, 0, 5.7, 0, FLAG, plane="xz")  # pennant
    for k in range(5):                                     # ladder rungs (front -Y)
        add_box(V, F, M, 0, -1.2, 0.4 + k * 0.55, 0.7, 0.06, 0.08, PL)
    add_box(V, F, M, -0.35, -1.2, 1.6, 0.06, 0.06, 3.2, WDD); add_box(V, F, M, 0.35, -1.2, 1.6, 0.06, 0.06, 3.2, WDD)
    finish("Lookout", V, F, mb, M); export("xy_isle_lookout.glb")

# --------------------------------------------------------------------------- #
def showcase(files, out="/tmp/xy_isle_preview.png", cols=6, span=6.0):
    try:
        reset()
        for i, fn in enumerate(files):
            p = os.path.join(OUT, fn)
            if not os.path.exists(p): continue
            before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=p)
            gx = (i % cols) * span - (cols - 1) * span / 2; gy = -(i // cols) * span
            for ob in (set(bpy.data.objects) - before):
                if ob.parent is None: ob.location.x += gx; ob.location.y += gy
        rows = (len(files) + cols - 1) // cols; sc = bpy.context.scene
        cam_d = bpy.data.cameras.new("Cam"); cam_d.lens = 30
        cam = bpy.data.objects.new("Cam", cam_d); bpy.context.collection.objects.link(cam)
        cy = -(rows - 1) * span / 2; cam.location = (span * 0.5, cy + 26, 15)
        cam.rotation_euler = (Vector((0, cy, 1.6)) - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam
        sun_d = bpy.data.lights.new("Sun", "SUN"); sun_d.energy = 3.2
        sun = bpy.data.objects.new("Sun", sun_d); bpy.context.collection.objects.link(sun)
        sun.rotation_euler = (math.radians(52), math.radians(10), math.radians(40))
        sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"
        sc.display.shading.color_type = "MATERIAL"; sc.display.shading.show_shadows = True
        sc.render.resolution_x, sc.render.resolution_y = 1700, 900; sc.render.filepath = out
        bpy.ops.render.render(write_still=True); print("preview ->", out)
    except Exception as e:
        print("showcase skipped:", e)

FILES = ["xy_isle_well.glb", "xy_isle_bridge.glb", "xy_isle_gazebo.glb", "xy_isle_swing.glb",
         "xy_isle_hammock.glb", "xy_isle_pergola.glb", "xy_isle_windchime.glb", "xy_isle_tent.glb",
         "xy_isle_stall.glb", "xy_isle_steppingstones.glb", "xy_isle_lookout.glb"]

if __name__ == "__main__":
    build_well(); build_bridge(); build_gazebo(); build_swing(); build_hammock(); build_pergola()
    build_windchime(); build_tent(); build_stall(); build_steppingstones(); build_lookout()
    showcase(FILES)
    print("ALL ISLE-LIFE DONE ->", OUT)
