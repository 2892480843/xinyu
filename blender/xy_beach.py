# -*- coding: utf-8 -*-
"""
心屿 · 海滩精修与彩蛋套件 Beach Kit (Batch 8) — procedural Blender build.

A careful pass over the SE cove beach: iconic dressing + a handful of healing
easter-egg props. Same craft / naming as xy_coast.py (shared helpers inlined so
this runs fully headless):

  装饰 dressing : palm(棕榈) · rowboat(沙滩小船) · firepit(篝火堆) · sign(指路牌) · bucket(沙桶)
  彩蛋 egg      : crab(寄居蟹·ClawL/ClawR) · turtle(归海小海龟·FlipperL/FlipperR)
                   · jelly(夜光水母·Emissive) · conch(听海海螺·Emissive) · chest(藏宝箱·Lid+Emissive) · footprint(脚印)

Glow slots are named `Emissive_*` so the in-engine toonify (/emissive/i) lights +
tints them. Movable parts (claws / flippers / lid) are SEPARATE named objects so
they export as glTF nodes the engine can rotate. Everything is base-centred on the
ground (z=0) so the game can place at exGroundY directly with zero clipping.

Run headless (exports glb + a WORKBENCH lineup PNG to /tmp for eyeball-verify):
  /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/xy_beach.py
Output -> frontend/public/models/xy_beach_*.glb
"""
import bpy, bmesh, math, os, random
from mathutils import Vector

OUT = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else
    "/Users/a111/chen/code/心屿/blender", "..", "frontend", "public", "models"))

# --------------------------------------------------------------------------- #
#  helpers (shared craft — copied verbatim from xy_coast.py)                    #
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
    m.diffuse_color = hexc(hx, alpha)   # WORKBENCH MATERIAL view reads this legacy color
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

def add_rock(V, F, M, cx, cy, cz, r, mi, seed=0, sx=1.0, sy=1.0, sz=1.0, amp=0.22, sg=7, rg=5, flat=True):
    rnd = random.Random(seed); o = len(V)
    add_ball(V, F, M, cx, cy, cz, r, mi, sg, rg, sz=1.0)
    for k in range(o, len(V)):
        x, y, z = V[k]; dx, dy, dz = x - cx, y - cy, z - cz; j = 1.0 + rnd.uniform(-amp, amp)
        nz = cz + dz * sz * j
        if flat and dz < -r * 0.35: nz = max(nz, cz - r * 0.12)
        V[k] = (cx + dx * sx * j, cy + dy * sy * j, nz)

def add_disc(V, F, M, cx, cy, cz, r, mi, sg=24, amp=0.0, seed=0):
    rnd = random.Random(seed); o = len(V); V.append((cx, cy, cz))
    for j in range(sg):
        a = 2 * math.pi * j / sg; rr = r * (1 + rnd.uniform(-amp, amp))
        V.append((cx + rr * math.cos(a), cy + rr * math.sin(a), cz))
    for j in range(sg): F.append((o, o + 1 + j, o + 1 + (j + 1) % sg)); M.append(mi)

def add_ring(V, F, M, cx, cy, cz, ri, ro, mi, sg=32):
    o = len(V)
    for j in range(sg):
        a = 2 * math.pi * j / sg
        V.append((cx + ri * math.cos(a), cy + ri * math.sin(a), cz)); V.append((cx + ro * math.cos(a), cy + ro * math.sin(a), cz))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o + 2 * j, o + 2 * j2, o + 2 * j2 + 1, o + 2 * j + 1)); M.append(mi)

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

# ---- new helpers ----------------------------------------------------------- #
def add_frond(V, F, M, cx, cy, cz, ang, length, mi, seg=7, width=0.42, rise=0.7, droop=1.8, thick=0.03):
    """A thin double-sided drooping palm leaf (real slab, not coincident faces → valid manifold)."""
    perp = (-math.sin(ang), math.cos(ang)); o = len(V)
    for layer in (thick * 0.5, -thick * 0.5):                      # top then bottom surface
        for s in range(seg + 1):
            t = s / seg; rad = length * t
            bx = cx + math.cos(ang) * rad; by = cy + math.sin(ang) * rad
            bz = cz + rise * t - droop * t * t                     # rises then droops
            w = width * (math.sin(t * math.pi) ** 0.7) * (1 - 0.15 * t)  # widest mid-leaf
            crown = 0.03 if layer > 0 else 0.0                     # midrib raised on the top face
            V.append((bx + perp[0] * w, by + perp[1] * w, bz + layer))
            V.append((bx, by, bz + layer + crown))
            V.append((bx - perp[0] * w, by - perp[1] * w, bz + layer))
    top, bot = o, o + (seg + 1) * 3
    for s in range(seg):
        a, b = top + s * 3, top + (s + 1) * 3
        F.append((a, a + 1, b + 1, b)); M.append(mi)               # top surface
        F.append((a + 1, a + 2, b + 2, b + 1)); M.append(mi)
        a2, b2 = bot + s * 3, bot + (s + 1) * 3
        F.append((b2, b2 + 1, a2 + 1, a2)); M.append(mi)           # bottom surface (reversed)
        F.append((b2 + 1, b2 + 2, a2 + 2, a2 + 1)); M.append(mi)

def set_origin(ob, x, y, z):
    """Move an object's origin to a world point (so it rotates about that pivot in-engine)."""
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

ROCK = ["#7d8694", "#646d7a", "#8a929e"]; SAND = "#e3cda0"; SANDD = "#d8be8f"
SEAGLASS = "#7fd9d2"; CORAL = "#e8826a"; CREAM = "#f3ece0"
BEACH_YELLOW = "#f0bb4f"
JELLY_BELL = "#5fd8ff"; JELLY_BELL_GLOW = "#87efff"
JELLY_TENT = "#b795ff"; JELLY_TENT_GLOW = "#d1b9ff"
JELLY_GLOW_STRENGTH = 1.45

# ============================ 装饰 dressing =============================== #
def build_palm():
    reset(); mb = MB()
    BK = mb.add("Bark", "#9c7748"); BKD = mb.add("BarkDk", "#7d5d38")
    FR = mb.add("Frond", "#5bab63"); FRD = mb.add("FrondDk", "#46924f"); CO = mb.add("Coconut", "#6b4a2e")
    V, F, M = [], [], []
    pts = [(0.9 * (s / 6) ** 1.7, 0.0, (s / 6) * 4.3) for s in range(7)]   # curved leaning trunk
    for s in range(6):
        add_cyl2(V, F, M, pts[s], pts[s + 1], 0.32 - 0.025 * s, BK if s % 2 == 0 else BKD, 8, r2=0.32 - 0.025 * (s + 1))
    cx, cy, cz = pts[-1]
    add_ball(V, F, M, cx, cy, cz, 0.26, BKD, 7, 4)                          # crown knot
    for k in range(3):                                                     # coconuts
        a = 2.094 * k
        add_ball(V, F, M, cx + 0.2 * math.cos(a), cy + 0.2 * math.sin(a), cz - 0.18, 0.12, CO, 6, 4)
    for k in range(8):                                                     # fronds
        add_frond(V, F, M, cx, cy, cz + 0.1, 2 * math.pi * k / 8 + 0.2, 2.5, FR if k % 2 == 0 else FRD)
    finish("Palm", V, F, mb, M, smooth=True); export("xy_beach_palm.glb")

def build_rowboat():
    reset(); mb = MB()
    H = mb.add("Hull", "#c46a4a"); HD = mb.add("HullDk", "#a4543a"); IN = mb.add("Inner", "#e3cda0")
    RIM = mb.add("Rim", "#8a5a3c"); SEAT = mb.add("Seat", "#caa978"); OAR = mb.add("Oar", "#b89464")
    V, F, M = [], [], []
    A, B, ztop, zbot, sg = 2.3, 0.92, 0.66, 0.0, 16
    o = len(V)
    for j in range(sg):                                                    # outer rim ring (top)
        a = 2 * math.pi * j / sg; V.append((A * math.cos(a), B * math.sin(a), ztop))
    for j in range(sg):                                                    # outer keel ring (bottom)
        a = 2 * math.pi * j / sg; V.append((A * 0.6 * math.cos(a), B * 0.5 * math.sin(a), zbot))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o + j, o + j2, o + sg + j2, o + sg + j)); M.append(H)   # outer hull
    add_disc(V, F, M, 0, 0, zbot + 0.04, A * 0.5, IN, sg)                   # floor
    o2 = len(V)
    for j in range(sg):                                                    # inner rim ring (inset)
        a = 2 * math.pi * j / sg; V.append((A * 0.9 * math.cos(a), B * 0.86 * math.sin(a), ztop - 0.05))
    for j in range(sg):                                                    # inner keel ring
        a = 2 * math.pi * j / sg; V.append((A * 0.52 * math.cos(a), B * 0.44 * math.sin(a), zbot + 0.06))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o2 + sg + j, o2 + sg + j2, o2 + j2, o2 + j)); M.append(IN)  # inner wall
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o + j, o2 + j, o2 + j2, o + j2)); M.append(RIM)             # rim cap band
    for sy in (-0.75, 0.75):                                               # thwart seats
        add_box(V, F, M, 0, sy, 0.5, 1.3, 0.2, 0.07, SEAT)
    for rx in (-1.3, 0.0, 1.3):                                            # ribs (decor)
        add_box(V, F, M, rx, 0, zbot + 0.05, 0.08, B * 1.5, 0.34, HD)
    add_cyl2(V, F, M, (-1.7, 1.2, 0.78), (1.5, 1.45, 0.78), 0.05, OAR, 6)  # oar shaft on the rim
    add_prism(V, F, M, [(0, 0.16), (0.55, 0.1), (0.55, -0.1), (0, -0.16)], 0.03, 1.95, 1.5, 0.78, 0.07, IN, plane="xy")  # oar blade
    finish("Rowboat", V, F, mb, M, smooth=True); export("xy_beach_rowboat.glb")

def build_firepit():
    reset(); mb = MB()
    R = [mb.add("Rock%d" % i, c) for i, c in enumerate(ROCK)]
    LOG = mb.add("Log", "#8a6038"); LOGD = mb.add("LogDk", "#6e4d2c"); ASH = mb.add("Ash", "#3a342f")
    EM = mb.add("Emissive_Embers", "#ff7a2c", rough=0.4, emit="#ff6a1c", es=2.6)
    EMY = mb.add("Emissive_Flame", "#ffd06a", rough=0.4, emit="#ffc24a", es=2.2)
    V, F, M = [], [], []
    for k in range(9):                                                     # stone ring
        a = 2 * math.pi * k / 9
        add_rock(V, F, M, 0.85 * math.cos(a), 0.85 * math.sin(a), 0.1, 0.3, R[k % 3], seed=k, sz=0.7, amp=0.3)
    add_disc(V, F, M, 0, 0, 0.05, 0.78, ASH, 16)                           # ash bed
    for k in range(4):                                                     # driftwood teepee
        a = 2 * math.pi * k / 4 + 0.4
        add_cyl2(V, F, M, (0.48 * math.cos(a), 0.48 * math.sin(a), 0.04), (0.0, 0.0, 0.85), 0.08, LOG if k % 2 else LOGD, 6)
    add_cone(V, F, M, 0, 0, 0.08, 0.32, 0.66, EM, 7)                       # ember core
    add_cone(V, F, M, 0, 0, 0.34, 0.18, 0.5, EMY, 6)                       # inner flame
    for k in range(3):                                                     # flat sitting-stones (step-over)
        a = 2 * math.pi * k / 3 + 0.5
        add_rock(V, F, M, 1.55 * math.cos(a), 1.55 * math.sin(a), 0.0, 0.5, R[(k + 1) % 3], seed=20 + k, sz=0.3, amp=0.18)
    finish("Firepit", V, F, mb, M, smooth=True); export("xy_beach_firepit.glb")

def build_sign():
    reset(); mb = MB()
    P = mb.add("Post", "#8a6038"); PD = mb.add("PostDk", "#6e4d2c")
    A1 = mb.add("ArrowA", CORAL); A2 = mb.add("ArrowB", SEAGLASS); A3 = mb.add("ArrowC", "#f6cf6f")
    V, F, M = [], [], []
    add_cyl(V, F, M, 0, 0, 0, 0.12, 2.0, P, 8)                             # post
    add_ball(V, F, M, 0, 0, 2.0, 0.15, PD, 7, 4)                           # rounded cap
    arrow = [(-0.7, 0.16), (0.5, 0.16), (0.5, 0.3), (0.88, 0.0), (0.5, -0.3), (0.5, -0.16), (-0.7, -0.16)]
    for (zc, ang, mi) in [(1.62, 0.4, A1), (1.26, 2.5, A2), (0.9, 4.3, A3)]:  # 3 directional planks
        add_prism(V, F, M, arrow, 0.07, 0, 0, zc, ang, mi, plane="xz")
    finish("Sign", V, F, mb, M); export("xy_beach_sign.glb")

def build_bucket():
    reset(); mb = MB()
    BK = mb.add("Bucket", CORAL); BKR = mb.add("BucketRim", "#d46a52")
    SP = mb.add("Spade", SEAGLASS); SPH = mb.add("SpadeH", BEACH_YELLOW); SD = mb.add("Sand", SAND); SDD = mb.add("SandDk", SANDD)
    V, F, M = [], [], []
    add_cyl(V, F, M, 0, 0, 0, 0.34, 0.5, BK, 12, r2=0.28)                  # tapered pail
    add_ring(V, F, M, 0, 0, 0.5, 0.28, 0.35, BKR, 16)                      # rim
    add_ball(V, F, M, 0, 0, 0.5, 0.27, SDD, 10, 4, sz=0.35)               # sand dome inside (molded)
    add_ball(V, F, M, 0.65, 0.25, 0.0, 0.34, SD, 8, 4, sz=0.5)            # spilled sand pile
    add_cone(V, F, M, 0.65, 0.25, 0.16, 0.16, 0.28, SDD, 7)               # little molded turret on pile
    add_cyl2(V, F, M, (0.55, -0.42, 0.0), (0.78, -0.62, 1.0), 0.04, SPH, 6)  # spade handle (leaning)
    add_prism(V, F, M, [(-0.13, 0.0), (0.13, 0.0), (0.1, -0.26), (-0.1, -0.26)], 0.03, 0.5, -0.36, 0.02, 0.5, SP, plane="xz")  # spade blade
    finish("Bucket", V, F, mb, M); export("xy_beach_bucket.glb")

# ============================ 彩蛋 easter eggs =========================== #
def build_conch():
    reset(); mb = MB()
    SH = mb.add("Shell", "#f3d9c0"); SHP = mb.add("ShellPink", "#f0b8c0")
    LIP = mb.add("Emissive_Pearl", "#ffe9d8", rough=0.3, emit="#ffd9c0", es=0.9)
    R = [mb.add("Rock%d" % i, c) for i, c in enumerate(ROCK)]
    V, F, M = [], [], []
    add_rock(V, F, M, 0, 0, 0.0, 0.9, R[1], seed=3, sx=1.2, sy=1.0, sz=0.4, amp=0.2)   # flat rock pedestal
    for k in range(9):                                                     # rising tapering spiral
        t = k / 8; ang = t * 3.4 * math.pi; rad = 0.5 * (1 - t)
        rr = max(0.45 * (1 - 0.85 * t), 0.06)
        add_ball(V, F, M, rad * math.cos(ang), rad * math.sin(ang), 0.5 + t * 0.7, rr, SH if k % 2 else SHP, 7, 4, sz=0.92)
    add_cone(V, F, M, 0.5, 0.0, 0.45, 0.46, 0.5, LIP, 9)                   # flared opening (pearl glow)
    finish("Conch", V, F, mb, M, smooth=True); export("xy_beach_conch.glb")

def build_jelly():
    reset(); mb = MB()
    BELL = mb.add("Emissive_Bell", JELLY_BELL, rough=0.2, emit=JELLY_BELL_GLOW, es=JELLY_GLOW_STRENGTH, alpha=0.78)
    TENT = mb.add("Emissive_Tent", JELLY_TENT, rough=0.2, emit=JELLY_TENT_GLOW, es=JELLY_GLOW_STRENGTH, alpha=0.72)
    V, F, M = [], [], []
    add_ball(V, F, M, 0, 0, 0.0, 0.7, BELL, 12, 6, sz=0.72)               # rounded bell
    for k in range(8):                                                     # frilly rim lobes
        a = 2 * math.pi * k / 8
        add_ball(V, F, M, 0.6 * math.cos(a), 0.6 * math.sin(a), -0.02, 0.12, BELL, 6, 3, sz=0.6)
    for k in range(7):                                                     # wavy drooping tentacles
        a = 2 * math.pi * k / 7; x0 = 0.45 * math.cos(a); y0 = 0.45 * math.sin(a)
        prev = (x0, y0, -0.08)
        for s in range(4):
            nx = x0 + math.sin(s * 1.3 + k) * 0.13; ny = y0 + math.cos(s * 1.1 + k) * 0.13; nz = -0.08 - (s + 1) * 0.42
            add_cyl2(V, F, M, prev, (nx, ny, nz), max(0.05 - 0.008 * s, 0.015), TENT, 5); prev = (nx, ny, nz)
    finish("Jelly", V, F, mb, M, smooth=True); export("xy_beach_jelly.glb")

def build_crab():
    reset(); mb = MB()
    SH = mb.add("Shell", "#e8704a"); SHD = mb.add("ShellDk", "#c85636"); LEG = mb.add("Leg", "#d4663e")
    EYE = mb.add("Eye", "#1c2530"); EW = mb.add("EyeW", "#f3ece0")
    # ---- BODY ----
    V, F, M = [], [], []
    add_ball(V, F, M, 0, 0, 0.32, 0.55, SH, 10, 5, sz=0.5)                 # flat round shell
    add_ball(V, F, M, 0, 0.08, 0.36, 0.5, SHD, 9, 4, sz=0.42)             # darker top patch
    for sx in (-0.18, 0.18):                                              # eye stalks (front +Y)
        add_cyl(V, F, M, sx, 0.44, 0.3, 0.05, 0.28, LEG, 6)
        add_ball(V, F, M, sx, 0.44, 0.62, 0.1, EW, 6, 3)
        add_ball(V, F, M, sx, 0.49, 0.64, 0.06, EYE, 5, 3)
    for side in (-1, 1):                                                  # 3 walking legs / side
        for k in range(3):
            hipy = 0.2 - k * 0.35
            add_cyl2(V, F, M, (side * 0.45, hipy, 0.28), (side * 0.85, hipy - 0.05, 0.34), 0.05, LEG, 5)
            add_cyl2(V, F, M, (side * 0.85, hipy - 0.05, 0.34), (side * 1.02, hipy - 0.1, 0.0), 0.045, LEG, 5)
    finish("Body", V, F, mb, M, smooth=True)
    # ---- CLAWS (separate nodes; pivot at the shoulder joint) ----
    for name, side in (("ClawL", 1), ("ClawR", -1)):
        V2, F2, M2 = [], [], []
        jx, jy = side * 0.5, 0.42; ex, ey = side * 0.96, 0.86
        add_cyl2(V2, F2, M2, (jx, jy, 0.3), (ex, ey, 0.35), 0.07, LEG, 6)         # arm
        add_ball(V2, F2, M2, ex, ey, 0.35, 0.18, SH, 7, 4, sz=0.75)              # claw base
        add_cone(V2, F2, M2, ex + side * 0.1, ey + 0.12, 0.42, 0.12, 0.3, SHD, 6)  # upper pincer
        add_cone(V2, F2, M2, ex + side * 0.1, ey + 0.12, 0.3, 0.1, 0.28, SH, 6)    # lower pincer
        ob = finish(name, V2, F2, mb, M2, smooth=True); set_origin(ob, jx, jy, 0.32)
    export("xy_beach_crab.glb")

def build_turtle():
    reset(); mb = MB()
    SH = mb.add("Shell", "#5b8f6e"); SHP = mb.add("ShellPat", "#3f6e52"); SK = mb.add("Skin", "#7fae8a")
    EYE = mb.add("Eye", "#1c2530"); BELLY = mb.add("Belly", "#e7dcab")
    # ---- BODY ----
    V, F, M = [], [], []
    add_ball(V, F, M, 0, 0, 0.16, 0.6, SH, 12, 6, sz=0.55)                # domed shell
    for (px, py) in ((0, 0.0), (0.28, 0.18), (-0.28, 0.18), (0.28, -0.18), (-0.28, -0.18), (0, 0.34), (0, -0.34)):
        add_ball(V, F, M, px, py, 0.4, 0.12, SHP, 6, 3, sz=0.5)           # scute pattern
    add_disc(V, F, M, 0, 0, 0.02, 0.58, BELLY, 16)                        # belly plate
    add_ball(V, F, M, 0, 0.62, 0.14, 0.2, SK, 8, 5, sz=0.85)             # head (+Y)
    for sx in (-0.08, 0.08):
        add_ball(V, F, M, sx, 0.74, 0.2, 0.04, EYE, 5, 3)
    add_cone(V, F, M, 0, -0.78, 0.12, 0.1, 0.28, SK, 6, rz=-math.pi / 2)  # tail (-Y)
    for sx in (-1, 1):                                                    # back flippers (part of body)
        add_ball(V, F, M, sx * 0.5, -0.42, 0.06, 0.18, SK, 6, 3, sz=0.35)
    finish("Body", V, F, mb, M, smooth=True)
    # ---- FRONT FLIPPERS (separate nodes; paddle) ----
    for name, sx in (("FlipperL", -1), ("FlipperR", 1)):
        V2, F2, M2 = [], [], []
        add_ball(V2, F2, M2, sx * 0.58, 0.36, 0.08, 0.26, SK, 7, 4, sz=0.3)
        ob = finish(name, V2, F2, mb, M2, smooth=True); set_origin(ob, sx * 0.42, 0.3, 0.12)
    export("xy_beach_turtle.glb")

def build_chest():
    reset(); mb = MB()
    WD = mb.add("Wood", "#9c6b3c"); WDD = mb.add("WoodDk", "#7a5230")
    MET = mb.add("Metal", "#c9a24a"); METD = mb.add("MetalDk", "#8a6f2e"); SD = mb.add("Sand", SAND)
    GLOW = mb.add("Emissive_Glow", "#ffe39a", rough=0.3, emit="#ffd56a", es=2.4)
    GEM = mb.add("Emissive_Gem", "#9be8ff", rough=0.2, emit="#bdf0ff", es=1.9)
    # ---- BODY (sand mound + box + bands + glowing contents) ----
    V, F, M = [], [], []
    add_disc(V, F, M, 0, 0, 0.0, 1.35, SD, 18, amp=0.08, seed=2)          # half-buried sand
    add_box(V, F, M, 0, 0, 0.08, 1.4, 0.9, 0.6, WD)                       # chest box
    add_box(V, F, M, 0, 0, 0.06, 1.46, 0.96, 0.12, METD)                  # bottom band
    for bx in (-0.55, 0.55):
        add_box(V, F, M, bx, 0, 0.08, 0.13, 0.96, 0.6, MET)              # vertical straps
    add_ball(V, F, M, 0, 0, 0.6, 0.32, GLOW, 8, 4, sz=0.6)               # glowing treasure (seen when open)
    for (gx, gy) in ((-0.42, 0.1), (0.4, -0.12), (0.12, 0.22)):
        add_ball(V, F, M, gx, gy, 0.64, 0.1, GEM, 6, 3)
    finish("Body", V, F, mb, M, smooth=False)
    # ---- LID (separate node; hinge at the back-top edge) ----
    V2, F2, M2 = [], [], []
    add_box(V2, F2, M2, 0, 0, 0.7, 1.4, 0.9, 0.16, WD)                   # lid slab
    add_box(V2, F2, M2, 0, 0, 0.84, 1.46, 0.96, 0.05, MET)              # lid trim
    for bx in (-0.55, 0.55):
        add_box(V2, F2, M2, bx, 0, 0.7, 0.13, 0.96, 0.2, MET)
    add_box(V2, F2, M2, 0, 0.43, 0.74, 0.3, 0.1, 0.16, METD)            # lock plate (front +Y)
    ob = finish("Lid", V2, F2, mb, M2, smooth=False); set_origin(ob, 0, -0.45, 0.78)  # hinge at back
    export("xy_beach_chest.glb")

def build_footprint():
    reset(); mb = MB()
    FP = mb.add("Footprint", "#cbb583")                                  # pressed-sand (darker)
    V, F, M = [], [], []
    for sx in (-0.17, 0.17):
        add_ball(V, F, M, sx, 0, 0.0, 0.16, FP, 8, 3, sz=0.12)          # flat sole oval
        for k in range(5):
            add_ball(V, F, M, sx + (k - 2) * 0.05, 0.22, 0.0, 0.03, FP, 5, 2, sz=0.3)  # toe dots
    finish("Footprint", V, F, mb, M, smooth=True); export("xy_beach_footprint.glb")

# ============================ build + showcase =========================== #
BUILDERS = [build_palm, build_rowboat, build_firepit, build_sign, build_bucket,
            build_conch, build_jelly, build_crab, build_turtle, build_chest, build_footprint]
GLBS = ["xy_beach_palm.glb", "xy_beach_rowboat.glb", "xy_beach_firepit.glb", "xy_beach_sign.glb",
        "xy_beach_bucket.glb", "xy_beach_conch.glb", "xy_beach_jelly.glb", "xy_beach_crab.glb",
        "xy_beach_turtle.glb", "xy_beach_chest.glb", "xy_beach_footprint.glb"]

def render_lineup():
    reset()
    x = 0.0
    for n in GLBS:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, n))
        for o in [ob for ob in bpy.data.objects if ob not in before and ob.parent is None]:
            o.location.x += x
        x += 4.2
    cam_data = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cx = (x - 4.2) / 2
    cam.location = (cx, -42, 14); cam_data.lens = 26
    cam.rotation_euler = (math.radians(73), 0, 0)
    bpy.context.scene.camera = cam
    sun_data = bpy.data.lights.new("Sun", "SUN"); sun_data.energy = 3.5
    sun = bpy.data.objects.new("Sun", sun_data); bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(55), math.radians(20), math.radians(30))
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "MATERIAL"
    sc.render.resolution_x = 2200; sc.render.resolution_y = 760
    sc.render.filepath = "/tmp/xy_beach_lineup.png"
    bpy.ops.render.render(write_still=True)
    print("rendered -> /tmp/xy_beach_lineup.png")

def build_all():
    for b in BUILDERS:
        b()
    render_lineup()
    print("DONE — all beach assets built.")

if __name__ == "__main__":
    build_all()
