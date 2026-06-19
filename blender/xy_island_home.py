# -*- coding: utf-8 -*-
"""
心屿 · 首页悬浮岛 (home floating island) — procedural Blender build · v2 (cartoon polish).

Rebuilds the "一座会回应你的岛屿" hero island as a single low-poly / cel-shaded glb,
deeply polished for the homepage first impression:
  - softer, iconic cartoon snow peak (clean bright cap)
  - a waterfall cascading into a small pond on the front slope
  - lush, cute, fuller forest: gumdrop pines + round broadleaf + pink blossom trees
  - flower meadows, red-cap mushrooms, grey boulders
  - warm beach ring at the coast
  - the signature teal sea-glass under-glow (hanging fronds + waterline halo)
  - glowing hex gems + floating wish-diamonds + a crystal spire
all harmonized to the project's healing sea-glass palette.

In-engine ([Island3D.tsx]) it is toonified (MeshToonMaterial + tree outlines) and the
`Emissive_*` glow group is recoloured by emotion in real time (EmotionTint).

Run headless:        blender --background --python blender/xy_island_home.py
Run inside Blender:  exec(open("blender/xy_island_home.py").read())
Output -> frontend/public/models/xy_scene_island.glb

Naming contract for the game:
  - meshes/materials prefixed `Emissive_` GLOW (emission baked in); names containing
    `gem` are EXCLUDED from the emotion-accent tint (keep their pink/gold/white variety).
  - `Terrain*` / `Trees*` get cel outlines in-engine; other toon parts do not.
Everything is deterministic (fixed seeds) so the asset is reproducible.
"""
import bpy, bmesh, math, random, os
from mathutils import Vector, noise

# --------------------------------------------------------------------------- #
#  helpers                                                                     #
# --------------------------------------------------------------------------- #
def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hexc(h, a=1.0):
    h = h.lstrip("#")
    return (s2l(int(h[0:2], 16) / 255), s2l(int(h[2:4], 16) / 255), s2l(int(h[4:6], 16) / 255), a)

def mat(name, hx, rough=0.9, emit=None, es=0.0, alpha=1.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
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
    return m

def newobj(name, V, F, mats, flat=True, fm=None, smooth=False):
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
        me.materials.append(m)
    if fm is not None:
        me.polygons.foreach_set("material_index", fm); me.update()
    if smooth:
        for p in me.polygons: p.use_smooth = True
    elif flat:
        for p in me.polygons: p.use_smooth = False
    return ob

def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

# -- primitive geometry (return verts, faces) ------------------------------- #
def radial(zfn, rmax, rings, seg):
    V = [(0, 0, zfn(0, 0))]; F = []
    for i in range(1, rings + 1):
        r = rmax * i / rings
        for j in range(seg):
            a = 2 * math.pi * j / seg
            V.append((r * math.cos(a), r * math.sin(a), zfn(r * math.cos(a), r * math.sin(a))))
    for j in range(seg):
        F.append((0, 1 + j, 1 + (j + 1) % seg))
    for i in range(rings - 1):
        b0 = 1 + i * seg; b1 = 1 + (i + 1) * seg
        for j in range(seg):
            j2 = (j + 1) % seg; F.append((b0 + j, b0 + j2, b1 + j2, b1 + j))
    return V, F

def cone(rb, h, z0, sg=8):
    V = [(0, 0, z0 + h)]
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append((rb * math.cos(a), rb * math.sin(a), z0))
    F = [(0, 1 + j, 1 + (j + 1) % sg) for j in range(sg)]
    c = len(V); V.append((0, 0, z0)); F += [(c, 1 + (j + 1) % sg, 1 + j) for j in range(sg)]
    return V, F

def cyl(r, h, z0, sg=6):
    V = []
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append((r * math.cos(a), r * math.sin(a), z0))
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append((r * math.cos(a), r * math.sin(a), z0 + h))
    F = []
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((j, j2, sg + j2, sg + j))
    t = len(V); V.append((0, 0, z0 + h)); b = len(V); V.append((0, 0, z0))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((t, sg + j, sg + j2)); F.append((b, j2, j))
    return V, F

def ball(rad, cz, sg=6, rg=4):
    V = [(0, 0, cz + rad)]
    for i in range(1, rg):
        phi = math.pi * i / rg; z = cz + rad * math.cos(phi); rr = rad * math.sin(phi)
        for j in range(sg):
            a = 2 * math.pi * j / sg; V.append((rr * math.cos(a), rr * math.sin(a), z))
    s = len(V); V.append((0, 0, cz - rad)); F = []
    for j in range(sg):
        F.append((0, 1 + j, 1 + (j + 1) % sg))
    for i in range(rg - 2):
        b0 = 1 + i * sg; b1 = 1 + (i + 1) * sg
        for j in range(sg):
            j2 = (j + 1) % sg; F.append((b0 + j, b0 + j2, b1 + j2, b1 + j))
    b0 = 1 + (rg - 2) * sg
    for j in range(sg):
        F.append((s, b0 + (j + 1) % sg, b0 + j))
    return V, F

def gem(rb, body, tip, sg=6):
    V = []
    for j in range(sg):
        a = 2 * math.pi * j / sg + math.pi / 6; V.append((rb * math.cos(a), rb * math.sin(a), 0))
    for j in range(sg):
        a = 2 * math.pi * j / sg + math.pi / 6; V.append((rb * math.cos(a), rb * math.sin(a), body))
    F = []
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((j, j2, sg + j2, sg + j))
    ap = len(V); V.append((0, 0, body + tip))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((sg + j, sg + j2, ap))
    bt = len(V); V.append((0, 0, 0))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((bt, j2, j))
    return V, F

def octa(r):
    return ([(0, 0, r), (0, 0, -r), (r, 0, 0), (-r, 0, 0), (0, r, 0), (0, -r, 0)],
            [(0, 2, 4), (0, 4, 3), (0, 3, 5), (0, 5, 2), (1, 4, 2), (1, 3, 4), (1, 5, 3), (1, 2, 5)])

# -- instancing into one mesh ----------------------------------------------- #
def addg(V, F, M, vs, fs, mi):
    o = len(V); V.extend(vs)
    for f in fs:
        F.append(tuple(o + i for i in f)); M.append(mi)

def place(V, F, M, tV, tF, tM, x, y, z, sx, sy, sz, rz):
    ca, sa = math.cos(rz), math.sin(rz); o = len(V)
    for (vx, vy, vz) in tV:
        vx *= sx; vy *= sy; vz *= sz
        V.append((x + vx * ca - vy * sa, y + vx * sa + vy * ca, z + vz))
    for k, f in enumerate(tF):
        F.append(tuple(o + i for i in f)); M.append(tM[k] if tM is not None else 0)

# --------------------------------------------------------------------------- #
#  terrain fields                                                             #
# --------------------------------------------------------------------------- #
R = 10.0
PEAKS = [((-0.4, 1.5), 7.4, 2.85),   # iconic hero peak
         (( 2.6, 0.1), 3.4, 1.9)]    # gentle shoulder
PC = (1.0, -4.2); PR = 1.0; PLEV = 0.58   # pond centre / small radius / water level (front slope)

def land_h(x, y):
    r = math.hypot(x, y); r01 = min(r / R, 1.0)
    base = 1.05 * (1.0 - r01 * r01)
    m = 0.0
    for (cx, cy), ph, ps in PEAKS:
        d = math.hypot(x - cx, y - cy); m += ph * math.exp(-(d * d) / (2 * ps * ps))
    n = noise.noise(Vector((x * 0.40, y * 0.40, 0.0))) * 0.42 + noise.noise(Vector((x * 0.95, y * 0.95, 3.1))) * 0.16
    h = base + m + n * (0.30 + 0.12 * m)
    if r01 > 0.64:
        # 外圈做一圈很宽的平坦沙滩台地（清楚露出沙滩），再到岛缘缓降入海
        BEACH = 0.44
        if r01 < 0.90:
            t = smoothstep(0.64, 0.78, r01)
            h = h * (1.0 - t) + BEACH * t
        else:
            # 收到 native 0（= hull 边沿 hull_z(R)=0），地形与岛底在岛缘对齐、不再互相穿插
            h = BEACH * max(0.0, 1.0 - (r01 - 0.90) / 0.10)
    dp = math.hypot(x - PC[0], y - PC[1])           # carve pond basin
    if dp < PR:
        t = dp / PR; basin = PLEV - 0.5 * (1.0 - t * t); bl = smoothstep(1.0, 0.42, t)
        h = h * (1.0 - bl) + basin * bl
    return max(h, -0.4)

def hull_z(x, y):
    r = math.hypot(x, y); r01 = min(r / R, 1.0)
    return -5.4 * math.sqrt(max(0.0, 1.0 - r01 * r01)) * (0.58 + 0.42 * (1.0 - r01))

def blocked(x, y):                                  # keep pond clear of all flora
    return math.hypot(x - PC[0], y - PC[1]) < PR + 0.6

def tree_clear(x, y):                               # 只在瀑布→小池塘的小走廊留空，其余前坡照样长满树
    return math.hypot(x - 0.95, y + 3.4) < 1.3      # （收窄后，不再留一大片平坦空地被照成「水」）

# --------------------------------------------------------------------------- #
#  build                                                                      #
# --------------------------------------------------------------------------- #
def reset_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for d in list(blk):
            if d.users == 0:
                blk.remove(d)

def build():
    # ---- harmonized sea-glass healing palette ----
    m_grass = mat("Grass", "#5cab46"); m_grassD = mat("GrassDk", "#458f37")  # 更偏黄绿、抗青色环境光，不被照成「水」
    m_rock  = mat("Rock", "#9a9cab"); m_snow = mat("Snow", "#f5fafb", rough=0.7)
    m_sand  = mat("Sand", "#ecd7a6"); m_hull = mat("Hull", "#c2ac82", rough=0.95)  # 岛底改沙岩色，自然海岛基座（非青色发光盘）
    m_trunk = mat("TreeTrunk", "#7a5a3e"); m_pd = mat("PineDark", "#3c8a50"); m_pl = mat("PineLight", "#69ba66")
    m_la = mat("LeafA", "#57ac5d"); m_lb = mat("LeafB", "#88cf78")
    m_ba = mat("BlossomA", "#f4a9c8"); m_bb = mat("BlossomB", "#ffd3e2")
    m_bould = mat("Boulder", "#9097a6")
    m_pond = mat("PondWater", "#7fd9d2", rough=0.25, emit="#8fe6dd", es=0.5, alpha=0.82, metal=0.1)
    m_fall = mat("Waterfall", "#e9f6f7", rough=0.3, emit="#dff3f5", es=0.8, alpha=0.95)
    m_foam = mat("Foam", "#ffffff", rough=0.4)
    m_stem = mat("FlowerStem", "#5a8a4e")
    m_flc = [mat("FlowerA", "#f5a8c4"), mat("FlowerB", "#f7d272"), mat("FlowerC", "#eef3f7"), mat("FlowerD", "#c9b6e6")]
    m_ms = mat("MushStem", "#efe7d3"); m_mc = mat("MushCap", "#d9594c")
    m_glow = mat("Emissive_SeaGlow", "#2fe0d2", 0.35, emit="#46f0e2", es=7.0)
    m_glowS = mat("Emissive_SeaGlowSoft", "#bff7f2", 0.3, emit="#9ff0ea", es=2.2, alpha=0.42)
    m_halo = mat("Emissive_Halo", "#5ff0e6", 0.3, emit="#7ff6ec", es=4.0, alpha=0.7)
    m_gp = mat("Emissive_GemPink", "#f49ac6", 0.35, emit="#ff8fc4", es=4.0)
    m_gg = mat("Emissive_GemGold", "#f5c86b", 0.35, emit="#ffcf73", es=4.0)
    m_gw = mat("Emissive_GemWhite", "#cfeefb", 0.3, emit="#bfeefc", es=4.5)
    m_wish = mat("Emissive_Wish", "#eafcff", 0.25, emit="#dff7ff", es=6.0)
    m_spire = mat("Emissive_Crystal", "#9fe9e4", 0.2, emit="#7fe8e0", es=3.4, alpha=0.85)

    # ---- terrain : grass(2-tone) / rock / clean snow cap / warm beach ----
    tv, tf = radial(land_h, R, 30, 64)
    terr = newobj("Terrain", tv, tf, [m_grass, m_grassD, m_rock, m_snow, m_sand])
    me = terr.data
    for p in me.polygons:
        c = Vector((0, 0, 0))
        for vi in p.vertices:
            c += me.vertices[vi].co
        c /= len(p.vertices); x, y, z = c; nz = p.normal.z; r01 = math.hypot(x, y) / R
        sn = noise.noise(Vector((x * 0.5, y * 0.5, 9.0))); gp = noise.noise(Vector((x * 0.7, y * 0.7, 5.0)))
        if r01 > 0.64 and z < 0.85:                  p.material_index = 4   # 很宽的平坦沙滩
        elif z > (2.55 + 0.9 * sn) and nz > 0.24:    p.material_index = 3   # clean snow cap
        elif z > 1.3 and nz < 0.82:                  p.material_index = 2   # rock on steeps
        else:                                        p.material_index = 0 if gp > 0.0 else 1
    me.update()

    # ---- hull (underside dome) ----
    hv, hf = radial(hull_z, R, 16, 64); newobj("Hull", hv, hf, m_hull)

    # ---- pond water + waterfall + foam ----
    seg = 44; pv = [(PC[0], PC[1], PLEV)]; pf = []
    for j in range(seg):
        a = 2 * math.pi * j / seg; pv.append((PC[0] + PR * 0.9 * math.cos(a), PC[1] + PR * 0.9 * math.sin(a), PLEV))
    for j in range(seg):
        pf.append((0, 1 + j, 1 + (j + 1) % seg))
    newobj("PondWater", pv, pf, [m_pond], smooth=True)

    # lily pads + a lotus bud (charm on the now-visible pond)
    m_lily = mat("LilyPad", "#4f9e63"); m_lotus = mat("Lotus", "#f6b6d0")
    LV = []; LF = []; LM = []; random.seed(5)
    for _ in range(5):
        a = random.uniform(0, 6.28); rr = random.uniform(0.25, PR * 0.6)
        lx = PC[0] + rr * math.cos(a); ly = PC[1] + rr * math.sin(a); pr = random.uniform(0.24, 0.42); sgn = 9
        o = len(LV); LV.append((lx, ly, PLEV + 0.02))
        for j in range(sgn):
            ang = 2 * math.pi * j / sgn + 0.3; LV.append((lx + pr * math.cos(ang), ly + pr * math.sin(ang), PLEV + 0.02))
        for j in range(sgn):
            LF.append((o, o + 1 + j, o + 1 + (j + 1) % sgn)); LM.append(0)
    o = len(LV); bv, bf = ball(0.15, 0, 6, 3)
    for (vx, vy, vz) in bv: LV.append((PC[0] - 0.5, PC[1] + 0.35, PLEV + 0.14 + vz))
    for f in bf: LF.append(tuple(o + i for i in f)); LM.append(1)
    newobj("LilyPads", LV, LF, [m_lily, m_lotus], fm=LM)

    fall_pts = [(0.85, -2.7, 2.5), (0.92, -3.3, 1.7), (0.98, -3.9, 1.0), (1.0, -4.4, 0.58)]; Wf = 0.55
    fv = []; ff = []
    for (x, y, z) in fall_pts:
        fv.append((x - Wf / 2, y, z)); fv.append((x + Wf / 2, y, z))
    for i in range(len(fall_pts) - 1):
        a = 2 * i; ff.append((a, a + 1, a + 3, a + 2))
    newobj("Waterfall", fv, ff, [m_fall], flat=False)

    FV = []; FF = []
    for (bx, by, bz, br) in [(0.88, -2.65, 2.55, 0.32), (1.0, -4.4, 0.62, 0.46), (0.86, -4.35, 0.6, 0.32), (1.14, -4.4, 0.6, 0.3)]:
        o = len(FV); bv, bf = ball(br, 0, 6, 3)
        for (vx, vy, vz) in bv: FV.append((bx + vx, by + vy, bz + vz))
        for f in bf: FF.append(tuple(o + i for i in f))
    newobj("Foam", FV, FF, [m_foam], smooth=True)

    # ---- forest : gumdrop pines + round broadleaf + blossom (kept low so the peak leads) ----
    def pine_t():
        V = []; F = []; M = []
        addg(V, F, M, *cyl(0.1, 0.5, 0.0, 5), 0)
        addg(V, F, M, *cone(0.98, 1.25, 0.42, 8), 1)
        addg(V, F, M, *cone(0.76, 1.1, 1.18, 8), 2)
        addg(V, F, M, *cone(0.52, 0.98, 1.92, 8), 2)
        return V, F, M
    def broad_t():
        V = []; F = []; M = []
        addg(V, F, M, *cyl(0.15, 0.85, 0.0, 6), 0)
        addg(V, F, M, *ball(1.02, 1.5, 8, 5), 1)
        addg(V, F, M, *ball(0.7, 1.32, 6, 4), 2)
        addg(V, F, M, *ball(0.66, 1.95, 6, 4), 2)
        return V, F, M
    def bloss_t():
        V = []; F = []; M = []
        addg(V, F, M, *cyl(0.12, 0.7, 0.0, 6), 0)
        addg(V, F, M, *ball(0.8, 1.3, 7, 4), 1)
        addg(V, F, M, *ball(0.55, 1.78, 6, 4), 2)
        return V, F, M
    pV, pF, pM = pine_t(); bV, bF, bM = broad_t(); sV, sF, sM = bloss_t()

    random.seed(11)
    PV = []; PF = []; PM = []; n = 0; tr = 0
    while n < 130 and tr < 6000:
        tr += 1; a = random.uniform(0, 6.28); rr = R * math.sqrt(random.uniform(0.02, 0.38))
        x = rr * math.cos(a); y = rr * math.sin(a); h = land_h(x, y)
        if h < 0.28 or h > 3.5 or rr < 1.2 or blocked(x, y) or tree_clear(x, y):
            continue
        if h > 2.7 and random.random() > 0.3:
            continue
        s = random.uniform(0.62, 1.36) * (1.0 + 0.1 * (2.0 - min(h, 2.0)))
        place(PV, PF, PM, pV, pF, pM, x, y, h - 0.1, s, s, s, random.uniform(0, 6.28))
        n += 1
    newobj("TreesPine", PV, PF, [m_trunk, m_pd, m_pl], fm=PM)

    BV = []; BF = []; BM = []; n = 0; tr = 0
    while n < 16 and tr < 2500:
        tr += 1; a = random.uniform(0, 6.28); rr = R * math.sqrt(random.uniform(0.1, 0.34))
        x = rr * math.cos(a); y = rr * math.sin(a); h = land_h(x, y)
        if h < 0.3 or h > 1.9 or blocked(x, y) or tree_clear(x, y):
            continue
        place(BV, BF, BM, bV, bF, bM, x, y, h - 0.1, random.uniform(0.92, 1.5), random.uniform(0.92, 1.5), random.uniform(0.92, 1.5), random.uniform(0, 6.28))
        n += 1
    newobj("TreesBroadleaf", BV, BF, [m_trunk, m_la, m_lb], fm=BM)

    SV = []; SF = []; SM = []; n = 0; tr = 0
    while n < 12 and tr < 2500:
        tr += 1; a = random.uniform(0, 6.28); rr = R * math.sqrt(random.uniform(0.12, 0.31))
        x = rr * math.cos(a); y = rr * math.sin(a); h = land_h(x, y)
        if h < 0.35 or h > 2.0 or blocked(x, y) or tree_clear(x, y):
            continue
        place(SV, SF, SM, sV, sF, sM, x, y, h - 0.1, random.uniform(0.85, 1.25), random.uniform(0.85, 1.25), random.uniform(0.85, 1.25), random.uniform(0, 6.28))
        n += 1
    newobj("TreesBlossom", SV, SF, [m_trunk, m_ba, m_bb], fm=SM)

    # ---- boulders ----
    RV = []; RF = []; RM = []; random.seed(21); n = 0; tr = 0
    while n < 18 and tr < 1500:
        tr += 1; a = random.uniform(0, 6.28); rr = R * math.sqrt(random.uniform(0.04, 0.36))
        x = rr * math.cos(a); y = rr * math.sin(a); h = land_h(x, y)
        if h < 0.2 or h > 3.2 or blocked(x, y):
            continue
        jr = random.Random(100 + n); rv, rf = ball(1.0, 0, 6, 4)
        rv = [(vx * (1 + jr.uniform(-0.24, 0.24)), vy * (1 + jr.uniform(-0.24, 0.24)), vz * (1 + jr.uniform(-0.15, 0.3))) for (vx, vy, vz) in rv]
        s = random.uniform(0.32, 0.8)
        place(RV, RF, RM, rv, rf, None, x, y, h - 0.05 * s, s, s, s * random.uniform(0.6, 0.85), random.uniform(0, 6.28))
        n += 1
    newobj("Rocks", RV, RF, [m_bould])

    # ---- flowers (pastel dots) ----
    fl_V, fl_F, fl_M = [], [], []
    addg(fl_V, fl_F, fl_M, *cyl(0.02, 0.2, 0.0, 4), 0)
    addg(fl_V, fl_F, fl_M, *ball(0.12, 0.24, 6, 3), 1)
    FLV = []; FLF = []; FLM = []; random.seed(71); n = 0; tr = 0
    while n < 130 and tr < 4000:
        tr += 1; a = random.uniform(0, 6.28); rr = R * math.sqrt(random.uniform(0.05, 0.36))
        x = rr * math.cos(a); y = rr * math.sin(a); h = land_h(x, y)
        if h < 0.3 or h > 2.5 or blocked(x, y):
            continue
        col = random.choice([0, 0, 1, 2, 3]); s = random.uniform(0.7, 1.35); o = len(FLV)
        for (vx, vy, vz) in fl_V: FLV.append((x + vx * s, y + vy * s, (h - 0.04) + vz * s))
        for f, mi in zip(fl_F, fl_M): FLF.append(tuple(o + i for i in f)); FLM.append(0 if mi == 0 else 1 + col)
        n += 1
    newobj("Flowers", FLV, FLF, [m_stem] + m_flc, fm=FLM)

    # ---- mushrooms (cute red caps, small clusters) ----
    mu_V, mu_F, mu_M = [], [], []
    addg(mu_V, mu_F, mu_M, *cyl(0.07, 0.2, 0.0, 6), 0)
    addg(mu_V, mu_F, mu_M, *ball(0.19, 0.24, 7, 3), 1)
    MV = []; MF = []; MM = []; random.seed(91); n = 0; tr = 0
    while n < 22 and tr < 2500:
        tr += 1; a = random.uniform(0, 6.28); rr = R * math.sqrt(random.uniform(0.06, 0.30))
        x = rr * math.cos(a); y = rr * math.sin(a); h = land_h(x, y)
        if h < 0.35 or h > 2.3 or blocked(x, y):
            continue
        for _ in range(random.randint(1, 3)):
            ox = random.uniform(-0.28, 0.28); oy = random.uniform(-0.28, 0.28); s = random.uniform(0.55, 1.0)
            place(MV, MF, MM, mu_V, mu_F, mu_M, x + ox, y + oy, land_h(x + ox, y + oy) - 0.03, s, s, s * 0.85, random.uniform(0, 6.28))
        n += 1
    newobj("Mushrooms", MV, MF, [m_ms, m_mc], fm=MM)

    # ---- under-glow REMOVED entirely ----
    # The hanging fronds + soft bloom balls + waterline halo were a translucent青色 wash that
    # covered the beach/ground and made the island read as a "glowing disc". A clean island
    # (terrain + beach + forest sitting in the sea) is what's wanted; keep only tiny gem accents below.
    _ = (m_glow, m_glowS, m_halo)  # materials kept defined but unused
    _ = m_halo  # material kept defined but unused

    # ---- glowing hex gems (kept colourful) ----
    EV = []; EF = []; EM = []; random.seed(41); n = 0; tr = 0
    while n < 18 and tr < 1500:
        tr += 1; a = random.uniform(0, 6.28); rr = R * math.sqrt(random.uniform(0.06, 0.78))
        x = rr * math.cos(a); y = rr * math.sin(a); h = land_h(x, y)
        if h < 0.3 or h > 3.0 or blocked(x, y):
            continue
        gv, gf = gem(0.2, 0.32, 0.26); o = len(EV); ci = random.choice([0, 0, 1, 2])
        s = random.uniform(0.7, 1.2); rz = random.uniform(0, 6.28); ca, sa = math.cos(rz), math.sin(rz)
        for (vx, vy, vz) in gv: EV.append((x + (vx * s) * ca - (vy * s) * sa, y + (vx * s) * sa + (vy * s) * ca, (h + 0.32) + vz * s))
        for f in gf: EF.append(tuple(o + i for i in f)); EM.append(ci)
        n += 1
    newobj("Emissive_Gems", EV, EF, [m_gp, m_gg, m_gw], fm=EM)

    # ---- floating wish-diamonds ----
    WV = []; WF = []; random.seed(57); n = 0; tr = 0
    while n < 10 and tr < 1200:
        tr += 1; a = random.uniform(0, 6.28); rr = R * math.sqrt(random.uniform(0.05, 0.7))
        x = rr * math.cos(a); y = rr * math.sin(a); h = land_h(x, y)
        if h > 4.0:
            continue
        ov, of = octa(random.uniform(0.3, 0.48)); o = len(WV); rz = random.uniform(0, 6.28); ca, sa = math.cos(rz), math.sin(rz)
        zz = h + random.uniform(1.8, 3.2)
        for (vx, vy, vz) in ov: WV.append((x + vx * ca - vy * sa, y + vx * sa + vy * ca, zz + vz))
        for f in of: WF.append(tuple(o + i for i in f))
        n += 1
    newobj("Emissive_Wishes", WV, WF, [m_wish])

    # ---- crystal spire REMOVED ---- (tall left crystals poked through the treeline → read as 穿模)
    _ = m_spire  # material kept defined but unused

def fix_hull_normals():
    hull = bpy.data.objects["Hull"]; me = hull.data
    if sum(p.normal.z for p in me.polygons) / len(me.polygons) > 0:
        bm = bmesh.new(); bm.from_mesh(me)
        for f in bm.faces:
            f.normal_flip()
        bm.to_mesh(me); bm.free(); me.update()

def setup_view():
    cam_d = bpy.data.cameras.new("Cam"); cam_d.lens = 46; cam_d.passepartout_alpha = 0.0
    cam = bpy.data.objects.new("Cam", cam_d); bpy.context.collection.objects.link(cam)
    cam.location = (0.6, -24.5, 9.2)
    cam.rotation_euler = (Vector((0, 0, 3.4)) - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    sc = bpy.context.scene; sc.render.resolution_x, sc.render.resolution_y = 1200, 940; sc.render.engine = "BLENDER_EEVEE"
    sun_d = bpy.data.lights.new("Sun", "SUN"); sun_d.energy = 3.0; sun_d.color = (1.0, 0.97, 0.88)
    sun = bpy.data.objects.new("Sun", sun_d); bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(52), math.radians(8), math.radians(-46))
    w = bpy.data.worlds[0] if bpy.data.worlds else bpy.data.worlds.new("W")
    bpy.context.scene.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = hexc("#43b7c6")
    if bpy.context.screen:
        for area in bpy.context.screen.areas:
            if area.type == "VIEW_3D":
                sp = area.spaces[0]; sp.shading.type = "RENDERED"
                sp.region_3d.view_perspective = "CAMERA"; sp.overlay.show_overlays = False

def export_glb():
    here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else \
        "/Users/a111/chen/code/心屿/blender"
    out = os.path.normpath(os.path.join(here, "..", "frontend", "public", "models", "xy_scene_island.glb"))
    for ob in bpy.data.objects:
        ob.select_set(ob.type == "MESH")
    bpy.context.view_layer.objects.active = bpy.data.objects["Terrain"]
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    print("exported ->", out, os.path.getsize(out), "bytes")
    return out

if __name__ == "__main__":
    reset_scene()
    build()
    fix_hull_normals()
    setup_view()
    export_glb()
