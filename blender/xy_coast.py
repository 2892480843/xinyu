# -*- coding: utf-8 -*-
"""
心屿 · 海岸套件 Coast Kit (Batch 6) — 地形 / 海滩 / 海水 · procedural Blender build.

Set-dressing for a rich coastline on the healing island, three groups:
  §B 地形 terrain : archrock · seastack · cliff · cave · terrace · stairs · isle
  §C 海滩 beach   : tidepool · starfish · driftwood · sandcastle · coral · deckchair
                     · surfboard · tikihut · dunegrass · ball
  §D 海水 water   : wave · foam · splash · surface · fall · ring

Same craft/naming as xy_houses.py / xy_island_home.py. Water/glow slots are named
`Emissive_Water` / `Emissive_Foam` so the in-engine EmotionTint can recolor them by
emotion (the project already tints water by mood). Rocks reuse the boulder jitter
trick from xy_island_home.py. Deterministic (fixed seeds).

Pivot: terrain/beach props base-centre on ground (z=0); flat water pieces centre on
the surface (origin at z≈0). Run headless:
  blender --background --python blender/xy_coast.py
Output -> frontend/public/models/xy_terrain_*.glb / xy_beach_*.glb / xy_water_*.glb
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
    """cylinder between two 3D points (for logs / branches at any angle)."""
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

ROCK = ["#7d8694", "#646d7a", "#8a929e"]; GRASS = "#5bab63"; SAND = "#ecd7a6"
BEACH_AQUA = "#45c7d1"; BEACH_YELLOW = "#f0bb4f"

# ============================ §B 地形 terrain ============================== #
def build_archrock():
    reset(); mb = MB(); R = [mb.add("Rock%d" % i, c) for i, c in enumerate(ROCK)]; G = mb.add("Grass", GRASS)
    V, F, M = [], [], []
    for sgn in (-1, 1):                                   # two legs
        for k in range(4):
            add_rock(V, F, M, sgn * 2.2, 0, 0.4 + k * 0.95, 1.2 - k * 0.12, R[k % 3], seed=10 * sgn + k, sz=1.0, amp=0.26)
    for t in range(7):                                    # arch span (semicircle)
        a = math.pi * t / 6; x = -2.2 * math.cos(a); z = 3.8 + 1.7 * math.sin(a)
        add_rock(V, F, M, x, 0, z, 0.95, R[t % 3], seed=100 + t, amp=0.22)
    add_rock(V, F, M, 0, 0, 5.5, 0.6, G, seed=200, sz=0.5, amp=0.1)  # mossy top
    finish("Terrain", V, F, mb, M, smooth=True); export("xy_terrain_archrock.glb")

def build_seastack():
    reset(); mb = MB(); R = [mb.add("Rock%d" % i, c) for i, c in enumerate(ROCK)]; MO = mb.add("Moss", "#6fae5e"); BAR = mb.add("Barnacle", "#cdbfa6")
    V, F, M = [], [], []
    for k in range(5):                                    # tall tapered column
        add_rock(V, F, M, 0.1 * k, 0, 0.3 + k * 1.15, 1.4 - k * 0.2, R[k % 3], seed=k, sz=1.0, amp=0.24)
    add_rock(V, F, M, 0.4, 0, 5.3, 0.5, MO, seed=99, sz=0.5, amp=0.18)   # mossy cap
    for k in range(3):                                    # a shorter companion stack
        add_rock(V, F, M, 2.4, -0.3, 0.3 + k * 0.95, 1.0 - k * 0.18, R[(k + 1) % 3], seed=20 + k, amp=0.24)
    add_rock(V, F, M, 2.4, -0.3, 3.0, 0.4, MO, seed=98, sz=0.4, amp=0.16)
    rnds = random.Random(7)                               # barnacle clusters near the waterline
    for _ in range(10):
        bz = rnds.uniform(0.2, 1.2); ba = rnds.uniform(0, 6.28)
        add_ball(V, F, M, math.cos(ba) * 0.85, math.sin(ba) * 0.6, bz, rnds.uniform(0.08, 0.14), BAR, 5, 3)
    finish("Terrain", V, F, mb, M, smooth=True); export("xy_terrain_seastack.glb")

def build_cliff():
    reset(); mb = MB()
    S = [mb.add("Rock%d" % i, c) for i, c in enumerate(ROCK)]; G = mb.add("Grass", GRASS); GD = mb.add("GrassDk", "#46924f")
    V, F, M = [], [], []
    for k in range(4):                                    # stratified rock block
        add_box(V, F, M, 0.1 * k, 0.05 * k, k * 1.2, 5.0 - 0.3 * k, 4.0 - 0.2 * k, 1.25, S[k % 3])
    add_box(V, F, M, 0.4, 0.2, 4.8, 4.0, 3.4, 0.5, G)     # grassy top
    add_rock(V, F, M, -1.6, 1.4, 5.0, 0.7, GD, seed=3, sz=0.7, amp=0.2)
    add_rock(V, F, M, 1.3, -1.4, 0.3, 0.9, S[2], seed=7, sz=0.7, amp=0.26)  # talus at base
    rndc = random.Random(11)                              # grass tufts on the grassy top
    for _ in range(11):
        add_cone(V, F, M, 0.4 + rndc.uniform(-1.6, 1.6), 0.2 + rndc.uniform(-1.2, 1.2), 5.05, 0.06, rndc.uniform(0.25, 0.5), G if rndc.random() > 0.4 else GD, 3)
    finish("Terrain", V, F, mb, M); export("xy_terrain_cliff.glb")

def build_cave():
    reset(); mb = MB(); R = [mb.add("Rock%d" % i, c) for i, c in enumerate(ROCK)]
    DARK = mb.add("CaveDark", "#181d22"); G = mb.add("Grass", GRASS)
    V, F, M = [], [], []
    for (ox, oy, oz, r, sd) in [(-1.8, 0, 0.6, 1.7, 1), (1.8, 0, 0.6, 1.7, 2), (0, -0.6, 2.6, 1.9, 3),
                                (-1.4, 0.4, 2.2, 1.2, 4), (1.4, 0.4, 2.2, 1.2, 5)]:
        add_rock(V, F, M, ox, oy, oz, r, R[sd % 3], seed=sd, sz=0.95, amp=0.24)
    add_box(V, F, M, 0, 1.7, 0, 1.7, 1.2, 2.2, DARK)      # dark opening recess (+Y)
    add_ball(V, F, M, 0, 1.7, 2.2, 0.95, DARK, 10, 4, sz=0.8)
    add_rock(V, F, M, 0, -0.4, 4.0, 0.7, G, seed=9, sz=0.5, amp=0.12)  # mossy crown
    finish("Terrain", V, F, mb, M, smooth=True); export("xy_terrain_cave.glb")

def build_terrace():
    reset(); mb = MB(); G = mb.add("Grass", GRASS); GD = mb.add("GrassDk", "#46924f"); ST = mb.add("Stone", "#9aa0ab")
    V, F, M = [], [], []
    for k in range(3):                                    # grassy ledges + stone risers
        r = 3.6 - k * 0.9
        add_cyl(V, F, M, 0, k * 0.6, k * 0.8, r + 0.12, 0.5, ST, 20)       # riser
        add_disc(V, F, M, 0, k * 0.6, k * 0.8 + 0.5, r, G if k % 2 == 0 else GD, 24, amp=0.04, seed=k)
    finish("Terrace", V, F, mb, M, smooth=False); export("xy_terrain_terrace.glb")

def build_stairs():
    reset(); mb = MB(); ST = mb.add("Stone", "#9aa0ab"); MO = mb.add("Moss", "#5bab63")
    V, F, M = [], [], []
    for k in range(5):
        add_box(V, F, M, 0, k * 0.6, k * 0.4, 2.4, 0.7, 0.45, ST)
        add_box(V, F, M, (-1.0 if k % 2 else 1.0), k * 0.6, k * 0.4, 0.4, 0.7, 0.5, MO)  # mossy edge
    finish("Terrain", V, F, mb, M); export("xy_terrain_stairs.glb")

def build_isle():
    reset(); mb = MB()
    G = mb.add("Grass", GRASS); R = mb.add("Rock", "#7d8694"); TR = mb.add("Trunk", "#7a5a3e"); LF = mb.add("Leaf", "#57ac5d")
    V, F, M = [], [], []
    add_cone(V, F, M, 0, 0, -2.6, 1.9, 2.6, R, 10)        # rocky underside (apex down)
    add_disc(V, F, M, 0, 0, 0.0, 2.0, G, 22, amp=0.05, seed=1)  # grassy top
    add_cyl(V, F, M, 0, 0, 0.0, 2.0, 0.35, G, 22)         # grass rim thickness
    add_cyl(V, F, M, 0.4, 0.2, 0.35, 0.16, 1.0, TR, 6)    # little tree
    add_ball(V, F, M, 0.4, 0.2, 1.6, 0.8, LF, 8, 4); add_ball(V, F, M, 0.4, 0.2, 2.1, 0.55, LF, 7, 4)
    finish("Isle", V, F, mb, M, smooth=True); export("xy_terrain_isle.glb")

# ============================ §C 海滩 beach =============================== #
def build_starfish(name="xy_beach_starfish.glb", col="#f08a5a"):
    reset(); mb = MB(); C = mb.add("Star", col); D = mb.add("StarDot", "#ffd3a0")
    V, F, M = [], [], []
    add_ball(V, F, M, 0, 0, 0.1, 0.42, C, 8, 3, sz=0.45)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        add_cone(V, F, M, 0.62 * math.cos(a), 0.62 * math.sin(a), 0.06, 0.26, 0.14, C, 6, rz=a)
    add_ball(V, F, M, 0, 0, 0.2, 0.12, D, 6, 3, sz=0.5)
    finish("Starfish", V, F, mb, M, smooth=True); export(name)

def build_tidepool():
    reset(); mb = MB(); R = [mb.add("Rock%d" % i, c) for i, c in enumerate(ROCK)]
    W = mb.add("Emissive_Water", "#7fd9d2", rough=0.2, emit="#8fe6dd", es=1.2, alpha=0.82, metal=0.1)
    SF = mb.add("Star", "#f08a5a")
    V, F, M = [], [], []
    for k in range(8):                                    # ring of rocks
        a = 2 * math.pi * k / 8; add_rock(V, F, M, 1.5 * math.cos(a), 1.5 * math.sin(a), 0.2, 0.7, R[k % 3], seed=k, sz=0.7, amp=0.28)
    add_disc(V, F, M, 0, 0, 0.32, 1.25, W, 22, amp=0.06, seed=2)   # glowing pool
    add_ball(V, F, M, 0.9, -0.3, 0.4, 0.18, SF, 6, 3, sz=0.5)      # tiny starfish on rim
    for (sx, sy) in ((-0.7, 0.5), (0.3, 0.8), (-0.2, -0.7)):       # pebbles/shells in the pool
        add_ball(V, F, M, sx, sy, 0.34, 0.1, R[0], 6, 3, sz=0.6)
    add_ring(V, F, M, 0, 0, 0.34, 0.5, 0.72, W, 18)                # inner ripple
    finish("Tidepool", V, F, mb, M, smooth=True); export("xy_beach_tidepool.glb")

def build_driftwood():
    reset(); mb = MB(); W = mb.add("Driftwood", "#cabfa8"); WD = mb.add("DriftDk", "#a89a7e")
    V, F, M = [], [], []
    add_cyl2(V, F, M, (-1.3, -0.1, 0.28), (1.0, 0.15, 0.34), 0.26, W, 7, r2=0.2)   # main log (lying)
    add_cyl2(V, F, M, (0.3, 0.0, 0.3), (1.5, -0.4, 0.22), 0.18, WD, 7, r2=0.12)    # forked piece
    add_cyl2(V, F, M, (0.4, 0.1, 0.4), (0.7, 0.5, 0.95), 0.09, W, 5)               # branch stub up
    finish("Driftwood", V, F, mb, M); export("xy_beach_driftwood.glb")

def build_sandcastle():
    reset(); mb = MB(); S = mb.add("Sand", "#e3cda0"); SD = mb.add("SandDk", "#d8be8f"); FL = mb.add("Flag", "#e8826a"); P = mb.add("Pole", "#8a6038"); DK = mb.add("Door", "#7a6444"); WT = mb.add("Emissive_Water", "#7fd9d2", rough=0.2, emit="#8fe6dd", es=0.7, alpha=0.7)
    V, F, M = [], [], []
    add_disc(V, F, M, 0, 0, 0.02, 1.55, WT, 22)            # little moat
    add_box(V, F, M, 0, 0, 0.05, 1.6, 1.6, 0.5, S)         # sand base
    for (x, y) in ((-0.5, -0.5), (0.5, -0.5), (-0.5, 0.5), (0.5, 0.5)):
        add_cyl(V, F, M, x, y, 0.55, 0.26, 0.62, SD, 8)
        for c in range(6):                                 # crenellations on tower tops
            ca = 2 * math.pi * c / 6
            add_box(V, F, M, x + 0.22 * math.cos(ca), y + 0.22 * math.sin(ca), 1.17, 0.1, 0.1, 0.14, SD)
        add_cone(V, F, M, x, y, 1.17, 0.3, 0.32, S, 8)
    add_cyl(V, F, M, 0, 0, 0.55, 0.38, 0.95, S, 12)        # central keep
    add_box(V, F, M, 0, 0.36, 0.55, 0.28, 0.12, 0.5, DK)   # arched door (recess)
    add_ball(V, F, M, 0, 0.36, 1.05, 0.15, DK, 8, 4, sz=0.7)
    for wx in (-0.28, 0.28):                               # two windows
        add_box(V, F, M, wx, 0.33, 1.0, 0.12, 0.12, 0.16, DK)
    add_cone(V, F, M, 0, 0, 1.5, 0.44, 0.5, SD, 12)        # central roof
    add_cyl(V, F, M, 0, 0, 1.98, 0.025, 0.6, P, 4)         # flag pole
    add_prism(V, F, M, [(0, 0), (0.35, 0.08), (0.35, 0.22), (0, 0.3)], 0.02, 0.02, 0, 2.22, 0, FL, plane="xz")
    finish("Sandcastle", V, F, mb, M); export("xy_beach_sandcastle.glb")

def build_coral():
    reset(); mb = MB(); A = mb.add("CoralA", "#f3a8c4"); B = mb.add("CoralB", "#7fd9d2"); C = mb.add("CoralC", "#f6cf6f")
    V, F, M = [], [], []
    add_ball(V, F, M, 0, 0, 0.1, 0.5, B, 8, 4, sz=0.55)              # base
    for (x, y, h, r, mi, rz) in [(-0.3, 0.1, 1.3, 0.13, A, 0.2), (0.25, -0.15, 1.1, 0.12, A, -0.3),
                                 (0.05, 0.3, 0.9, 0.11, C, 0.1), (0.4, 0.2, 0.7, 0.1, B, 0.4)]:
        add_cyl(V, F, M, x, y, 0.2, r, h, mi, 6, rz=rz, r2=r * 0.5)
        add_ball(V, F, M, x + 0.08 * rz, y, 0.2 + h, r * 1.4, mi, 6, 3)
    finish("Coral", V, F, mb, M, smooth=True); export("xy_beach_coral.glb")

def build_deckchair():
    reset(); mb = MB(); WD = mb.add("Wood", "#a9794f"); FA = mb.add("FabricA", "#e8826a"); FB = mb.add("FabricB", BEACH_AQUA)
    V, F, M = [], [], []
    for sx in (-0.55, 0.55):                              # side frames
        add_box(V, F, M, sx, -0.2, 0.05, 0.08, 1.5, 0.08, WD)
        add_box(V, F, M, sx, -0.7, 0.0, 0.08, 0.08, 0.5, WD); add_box(V, F, M, sx, 0.4, 0.0, 0.08, 0.08, 0.35, WD)
    for s in range(5):                                            # striped seat slats (reclined)
        add_box(V, F, M, 0, -0.7 + s * 0.3, 0.5 - 0.02 * s, 1.0, 0.26, 0.05, FA if s % 2 else FB)
    for s in range(5):                                            # striped backrest
        add_box(V, F, M, 0, 0.52, 0.58 + s * 0.16, 1.0, 0.05, 0.14, FA if s % 2 else FB)
    for sx in (-0.55, 0.55):                                      # armrests
        add_box(V, F, M, sx, -0.05, 0.62, 0.07, 0.7, 0.07, WD)
    finish("Deckchair", V, F, mb, M); export("xy_beach_deckchair.glb")

def build_surfboard():
    reset(); mb = MB(); A = mb.add("BoardA", BEACH_AQUA); B = mb.add("BoardB", "#e8826a"); F2 = mb.add("Fin", "#7fd9d2")
    V, F, M = [], [], []
    add_ball(V, F, M, 0, 0, 1.0, 1.0, A, 8, 6, sz=1.0)            # placeholder, scaled below
    # rebuild as a flattened elongated board standing vertical
    V.clear(); F.clear(); M.clear()
    add_ball(V, F, M, 0, 0, 1.05, 1.05, A, 8, 7, sz=1.0)
    for k in range(len(V)):                                       # squash to a board: thin Y, tall Z, narrow X
        x, y, z = V[k]; V[k] = (x * 0.42, y * 0.13, 1.05 + (z - 1.05) * 1.0)
    add_box(V, F, M, 0, 0, 0.7, 0.32, 0.04, 0.5, B)               # color stripe
    add_prism(V, F, M, [(0, 0), (0.22, -0.18), (0.0, -0.22)], 0.04, 0, 0.0, 0.06, 0, F2, plane="xz")  # fin near base
    finish("Surfboard", V, F, mb, M, smooth=True); export("xy_beach_surfboard.glb")

def build_tikihut():
    reset(); mb = MB(); P = mb.add("Post", "#8a6038"); TH = mb.add("Thatch", "#cdb074"); THD = mb.add("ThatchDk", "#b3955a")
    V, F, M = [], [], []
    for (x, y) in ((-1.3, -1.3), (1.3, -1.3), (-1.3, 1.3), (1.3, 1.3)):
        add_cyl(V, F, M, x, y, 0, 0.16, 2.4, P, 6)
    add_box(V, F, M, 0, 0, 2.3, 3.2, 3.2, 0.16, P)               # top frame
    add_cone(V, F, M, 0, 0, 2.46, 2.7, 1.5, TH, 4)               # thatch roof
    add_cone(V, F, M, 0, 0, 2.9, 1.6, 1.0, THD, 4)               # upper thatch tier
    add_cone(V, F, M, 0, 0, 3.5, 0.8, 0.7, TH, 4)                # top thatch tier
    add_box(V, F, M, 0, -0.9, 0.35, 2.0, 0.5, 0.12, P)           # bench seat
    for bx in (-0.8, 0.8):
        add_box(V, F, M, bx, -0.9, 0, 0.12, 0.5, 0.35, P)        # bench legs
    add_box(V, F, M, 0, 1.3, 1.4, 2.6, 0.12, 0.12, P)            # back crossbeam
    finish("Tikihut", V, F, mb, M, smooth=True); export("xy_beach_tikihut.glb")

def build_dunegrass():
    reset(); mb = MB(); G = mb.add("DuneGrass", "#bcd49a"); GD = mb.add("DuneGrassDk", "#9cbf86")
    V, F, M = [], [], []; rnd = random.Random(4)
    for _ in range(12):
        a = rnd.uniform(0, 6.28); rr = rnd.uniform(0, 0.3); x = rr * math.cos(a); y = rr * math.sin(a)
        h = rnd.uniform(0.5, 0.95); lean = rnd.uniform(-0.3, 0.3)
        add_cone(V, F, M, x + lean, y, 0, 0.04, h, G if rnd.random() > 0.4 else GD, 3, rz=rnd.uniform(0, 3))
    finish("DuneGrass", V, F, mb, M); export("xy_beach_dunegrass.glb")

def build_ball():
    reset(); mb = MB(); cols = [mb.add("PanelA", "#e8826a"), mb.add("PanelB", BEACH_YELLOW), mb.add("PanelC", "#7fd9d2")]
    V, F, M = [], [], []
    add_ball(V, F, M, 0, 0, 0.4, 0.4, cols[0], 10, 6)
    me_start = 0
    # recolor faces into vertical wedges for a beach-ball look
    ob = newobj("BeachBall", V, F, mb.mats, fm=M, smooth=True)
    for p in ob.data.polygons:
        c = Vector((0, 0, 0))
        for vi in p.vertices: c += ob.data.vertices[vi].co
        c /= len(p.vertices); ang = math.atan2(c.y, c.x)
        p.material_index = cols[int((ang + math.pi) / (2 * math.pi) * 6) % 3]
    ob.data.update(); recalc(ob); export("xy_beach_ball.glb")

# ============================ §D 海水 water =============================== #
def build_wave():
    reset(); mb = MB()
    W = mb.add("Emissive_Water", "#7fd9d2", rough=0.2, emit="#8fe6dd", es=0.8, alpha=0.8, metal=0.1)
    FM = mb.add("Emissive_Foam", "#ffffff", rough=0.3, emit="#eaf7f7", es=0.6, alpha=0.95)
    V, F, M = [], [], []
    # curling water wall: a water slab + a horizontal rolling crest tube + foam
    add_prism(V, F, M, [(-1.5, 0), (1.5, 0), (1.5, 1.1), (-1.5, 1.1)], 0.6, 0, 0, 0, 0, W, plane="xz")
    add_cyl2(V, F, M, (-1.5, 0.15, 1.25), (1.5, 0.15, 1.25), 0.42, W, 8, r2=0.42)  # rolling crest along X
    for k in range(7):                                   # foam crest blobs
        add_ball(V, F, M, -1.4 + k * 0.47, 0.2, 1.55, 0.28, FM, 6, 3, sz=0.8)
    add_disc(V, F, M, 0, -0.7, 0.02, 1.7, FM, 18, amp=0.12, seed=1)   # foam wash at base
    finish("Wave", V, F, mb, M, smooth=True); export("xy_water_wave.glb")

def build_foam():
    reset(); mb = MB(); FM = mb.add("Emissive_Foam", "#ffffff", rough=0.35, emit="#eaf7f7", es=0.5, alpha=0.92)
    V, F, M = [], [], []
    add_disc(V, F, M, 0, 0, 0.02, 1.5, FM, 28, amp=0.18, seed=3)
    add_ring(V, F, M, 0, 0, 0.05, 1.45, 1.8, FM, 28)
    rnf = random.Random(8)                                # bubbly foam clumps
    for _ in range(16):
        a = rnf.uniform(0, 6.28); rr = rnf.uniform(0.3, 1.65)
        add_ball(V, F, M, rr * math.cos(a), rr * math.sin(a), 0.06, rnf.uniform(0.08, 0.2), FM, 5, 3, sz=0.7)
    finish("Foam", V, F, mb, M, smooth=True); export("xy_water_foam.glb")

def build_splash():
    reset(); mb = MB()
    W = mb.add("Emissive_Water", "#9fe6df", rough=0.2, emit="#b7f0ea", es=1.0, alpha=0.85)
    FM = mb.add("Emissive_Foam", "#ffffff", rough=0.3, emit="#eaf7f7", es=0.6, alpha=0.95)
    V, F, M = [], [], []
    add_cone(V, F, M, 0, 0, 0, 0.5, 1.3, W, 8)            # central column
    for k in range(7):
        a = 2 * math.pi * k / 7; r = 0.8 + 0.2 * (k % 2)
        add_ball(V, F, M, r * math.cos(a), r * math.sin(a), 0.6 + 0.4 * (k % 3), 0.16, FM, 6, 3)
    add_ring(V, F, M, 0, 0, 0.02, 0.7, 1.1, FM, 20)
    finish("Splash", V, F, mb, M, smooth=True); export("xy_water_splash.glb")

def build_surface():
    reset(); mb = MB()
    W = mb.add("Emissive_Water", "#7fd9d2", rough=0.18, emit="#8fe6dd", es=0.9, alpha=0.7, metal=0.1)
    V, F, M = [], [], []
    # low-poly faceted shallow-water tile (two stacked hex facets = soft ripple)
    add_disc(V, F, M, 0, 0, 0.0, 4.0, W, 6, amp=0.0)
    add_disc(V, F, M, 0, 0, 0.05, 2.4, W, 6, amp=0.0)
    finish("WaterSurface", V, F, mb, M, smooth=False); export("xy_water_surface.glb")

def build_fall():
    reset(); mb = MB()
    W = mb.add("Emissive_Water", "#dff3f5", rough=0.25, emit="#e9f6f7", es=0.9, alpha=0.9)
    WD = mb.add("Emissive_WaterStreak", "#bfe9ec", rough=0.25, emit="#cdeef0", es=0.7, alpha=0.9)
    FM = mb.add("Emissive_Foam", "#ffffff", rough=0.3, emit="#eaf7f7", es=0.6, alpha=0.95)
    V, F, M = [], [], []
    add_box(V, F, M, 0, 0, 0, 1.4, 0.25, 3.0, W)          # main ribbon
    add_box(V, F, M, -0.45, 0.02, 0, 0.18, 0.28, 3.0, WD)  # streaks
    add_box(V, F, M, 0.4, 0.02, 0, 0.16, 0.28, 3.0, WD)
    for k in range(5):
        add_ball(V, F, M, -0.6 + k * 0.3, 0, 0.1, 0.24, FM, 6, 3, sz=0.8)   # base foam
    add_disc(V, F, M, 0, 0, 0.02, 1.1, FM, 16, amp=0.15, seed=2)
    finish("Waterfall", V, F, mb, M, smooth=True); export("xy_water_fall.glb")

def build_ring():
    reset(); mb = MB(); FM = mb.add("Emissive_Foam", "#ffffff", rough=0.35, emit="#eaf7f7", es=0.5, alpha=0.9)
    V, F, M = [], [], []
    add_ring(V, F, M, 0, 0, 0.02, 0.8, 1.0, FM, 32)
    finish("RippleRing", V, F, mb, M, smooth=False); export("xy_water_ring.glb")

# --------------------------------------------------------------------------- #
#  showcase                                                                    #
# --------------------------------------------------------------------------- #
def showcase(files, out="/tmp/xy_coast_preview.png", cols=6, span=5.5):
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
        cam_d = bpy.data.cameras.new("Cam"); cam_d.lens = 28
        cam = bpy.data.objects.new("Cam", cam_d); bpy.context.collection.objects.link(cam)
        cy = -(rows - 1) * span / 2
        cam.location = (span * 0.6, cy + 30, 18)
        cam.rotation_euler = (Vector((0, cy, 1.5)) - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam
        sun_d = bpy.data.lights.new("Sun", "SUN"); sun_d.energy = 3.0
        sun = bpy.data.objects.new("Sun", sun_d); bpy.context.collection.objects.link(sun)
        sun.rotation_euler = (math.radians(52), math.radians(10), math.radians(40))
        sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"
        sc.display.shading.color_type = "MATERIAL"; sc.display.shading.show_shadows = True
        sc.render.resolution_x, sc.render.resolution_y = 1700, 1000; sc.render.filepath = out
        bpy.ops.render.render(write_still=True); print("preview ->", out)
    except Exception as e:
        print("showcase skipped:", e)

FILES = ["xy_terrain_archrock.glb", "xy_terrain_seastack.glb", "xy_terrain_cliff.glb", "xy_terrain_cave.glb",
         "xy_terrain_terrace.glb", "xy_terrain_stairs.glb", "xy_terrain_isle.glb",
         "xy_beach_tidepool.glb", "xy_beach_starfish.glb", "xy_beach_driftwood.glb", "xy_beach_sandcastle.glb",
         "xy_beach_coral.glb", "xy_beach_deckchair.glb", "xy_beach_surfboard.glb", "xy_beach_tikihut.glb",
         "xy_beach_dunegrass.glb", "xy_beach_ball.glb",
         "xy_water_wave.glb", "xy_water_foam.glb", "xy_water_splash.glb", "xy_water_surface.glb",
         "xy_water_fall.glb", "xy_water_ring.glb"]

if __name__ == "__main__":
    build_archrock(); build_seastack(); build_cliff(); build_cave(); build_terrace(); build_stairs(); build_isle()
    build_tidepool(); build_starfish(); build_driftwood(); build_sandcastle(); build_coral()
    build_deckchair(); build_surfboard(); build_tikihut(); build_dunegrass(); build_ball()
    build_wave(); build_foam(); build_splash(); build_surface(); build_fall(); build_ring()
    showcase(FILES)
    print("ALL COAST DONE ->", OUT)
