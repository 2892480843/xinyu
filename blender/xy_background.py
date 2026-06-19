# -*- coding: utf-8 -*-
"""
心屿 · 首页背景生灵 / 天体 — procedural Blender build.

Builds the cohesive low-poly toon background assets for the home 3D scene
([Island3D.tsx]), same工艺 as the island so the global cel outline ties them together:

  - xy_creature_turtle.glb  cute sea turtle  (Body + FlipperL/FlipperR paddle nodes)
  - xy_bg_bird.glb          little bird       (Body + WingL/WingR flap nodes)
  - xy_bg_cloud.glb         puffy clouds      (Cloud1 / Cloud2 / Cloud3)
  - xy_bg_sun.glb           radiant sun       (SunCore = god-ray source + SunRays)

All face +Y (forward); on glTF (Y-up) export that becomes -Z, so the engine adds a
π / axis offset where needed (see the wiring in Island3D.tsx).

Run headless:  blender --background --python blender/xy_background.py
Output -> frontend/public/models/
"""
import bpy, math, os

OUT = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else
    "/Users/a111/chen/code/心屿/blender", "..", "frontend", "public", "models"))

# --------------------------------------------------------------------------- #
#  helpers                                                                     #
# --------------------------------------------------------------------------- #
def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hexc(h, a=1.0):
    h = h.lstrip("#")
    return (s2l(int(h[0:2], 16) / 255), s2l(int(h[2:4], 16) / 255), s2l(int(h[4:6], 16) / 255), a)

def mat(name, hx, rough=0.85, emit=None, es=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = hexc(hx); b.inputs["Roughness"].default_value = rough
    if "Metallic" in b.inputs: b.inputs["Metallic"].default_value = 0.0
    if emit is not None:
        b.inputs["Emission Color"].default_value = hexc(emit); b.inputs["Emission Strength"].default_value = es
    return m

def newobj(name, V, F, mats, fm=None, flat=True, smooth=False):
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]): me.materials.append(m)
    if fm is not None: me.polygons.foreach_set("material_index", fm); me.update()
    if smooth:
        for p in me.polygons: p.use_smooth = True
    elif flat:
        for p in me.polygons: p.use_smooth = False
    return ob

def ball(rad, cz, sg=8, rg=5):
    V = [(0, 0, cz + rad)]
    for i in range(1, rg):
        phi = math.pi * i / rg; z = cz + rad * math.cos(phi); rr = rad * math.sin(phi)
        for j in range(sg):
            a = 2 * math.pi * j / sg; V.append((rr * math.cos(a), rr * math.sin(a), z))
    s = len(V); V.append((0, 0, cz - rad)); F = []
    for j in range(sg): F.append((0, 1 + j, 1 + (j + 1) % sg))
    for i in range(rg - 2):
        b0 = 1 + i * sg; b1 = 1 + (i + 1) * sg
        for j in range(sg):
            j2 = (j + 1) % sg; F.append((b0 + j, b0 + j2, b1 + j2, b1 + j))
    b0 = 1 + (rg - 2) * sg
    for j in range(sg): F.append((s, b0 + (j + 1) % sg, b0 + j))
    return V, F

def dome(rad, sg, rg, zs):
    V = [(0, 0, rad * zs)]; F = []; FM = []
    for i in range(1, rg + 1):
        phi = (math.pi / 2) * i / rg; z = rad * math.cos(phi) * zs; rr = rad * math.sin(phi)
        for j in range(sg):
            a = 2 * math.pi * j / sg; V.append((rr * math.cos(a), rr * math.sin(a), z))
    for j in range(sg): F.append((0, 1 + j, 1 + (j + 1) % sg)); FM.append(j % 2)
    for i in range(rg - 1):
        b0 = 1 + i * sg; b1 = 1 + (i + 1) * sg
        for j in range(sg):
            j2 = (j + 1) % sg; F.append((b0 + j, b0 + j2, b1 + j2, b1 + j)); FM.append((i + j) % 2)
    return V, F, FM

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

def add_ball(V, F, M, rad, cx, cy, cz, mi, sg=7, rg=4, sy=1.0, sz=1.0):
    o = len(V); bv, bf = ball(rad, 0, sg, rg)
    for (vx, vy, vz) in bv: V.append((cx + vx, cy + vy * sy, cz + vz * sz))
    for f in bf: F.append(tuple(o + i for i in f)); M.append(mi)

def add_prism(V, F, M, pts, thick, x, y, z, rz, mi, lift=0.0):
    n = len(pts); hz = thick / 2; ca, sa = math.cos(rz), math.sin(rz); o = len(V)
    for lz in (-hz, hz):
        for (px, py) in pts:
            ll = lift * max(0.0, px)
            V.append((x + px * ca - py * sa, y + px * sa + py * ca, z + lz + ll))
    F.append(tuple(o + i for i in range(n - 1, -1, -1))); M.append(mi)
    F.append(tuple(o + n + i for i in range(n))); M.append(mi)
    for i in range(n):
        j = (i + 1) % n; F.append((o + i, o + j, o + n + j, o + n + i)); M.append(mi)

def reset():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for d in list(blk):
            if d.users == 0: blk.remove(d)

def export(name, active):
    for ob in bpy.data.objects: ob.select_set(ob.type == "MESH")
    bpy.context.view_layer.objects.active = bpy.data.objects[active]
    path = os.path.join(OUT, name)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    print("exported ->", path)

# --------------------------------------------------------------------------- #
#  sea turtle                                                                 #
# --------------------------------------------------------------------------- #
def build_turtle():
    reset()
    m_sd = mat("ShellDark", "#3f7d52"); m_sl = mat("ShellLight", "#69b06d"); m_be = mat("Belly", "#ead7a6")
    m_sk = mat("TurtleSkin", "#57a268"); m_ey = mat("TurtleEye", "#23292b")
    V = []; F = []; M = []                                  # slots: 0 dark,1 light,2 belly,3 skin,4 eye
    dv, df, dfm = dome(0.6, 9, 5, 0.62); o = len(V)         # carapace (2-tone tortoiseshell)
    for (x, y, z) in dv: V.append((x, y, z + 0.1))
    for f, fm in zip(df, dfm): F.append(tuple(o + i for i in f)); M.append(fm)
    bv, bf, _ = dome(0.6, 9, 3, 0.22); o = len(V)           # belly (shallow under-dome)
    for (x, y, z) in bv: V.append((x, y, 0.1 - z))
    for f in bf: F.append(tuple(o + i for i in f)); M.append(2)
    add_ball(V, F, M, 0.15, 0, 0.50, 0.06, 3); add_ball(V, F, M, 0.16, 0, 0.60, 0.12, 3)   # neck
    add_ball(V, F, M, 0.18, 0, 0.72, 0.18, 3, 8, 5)         # head
    add_ball(V, F, M, 0.11, 0, 0.86, 0.13, 3, 6, 4)         # snout
    add_ball(V, F, M, 0.045, 0.085, 0.82, 0.24, 4, 6, 3); add_ball(V, F, M, 0.045, -0.085, 0.82, 0.24, 4, 6, 3)  # eyes
    add_ball(V, F, M, 0.07, 0, -0.62, 0.05, 3, 6, 3, sy=1.6)  # tail
    bp = [(0, 0.08), (0.16, 0.1), (0.32, 0.02), (0.36, -0.1), (0.22, -0.15), (0.06, -0.1), (0, -0.06)]
    add_prism(V, F, M, bp, 0.05, 0.34, -0.34, 0.04, -0.7, 3, lift=0.1)                      # back flippers
    add_prism(V, F, M, [(-px, py) for (px, py) in bp], 0.05, -0.34, -0.34, 0.04, 0.7, 3, lift=0.1)
    body = newobj("Body", V, F, [m_sd, m_sl, m_be, m_sk, m_ey], fm=M)
    fp = [(0, 0.1), (0.22, 0.14), (0.48, 0.06), (0.56, -0.16), (0.36, -0.24), (0.1, -0.16), (0, -0.08)]
    for nm, mir, lx in (("FlipperL", 1, 0.36), ("FlipperR", -1, -0.36)):
        V2 = []; F2 = []; M2 = []
        add_prism(V2, F2, M2, [(mir * px, py) for (px, py) in fp], 0.055, 0, 0, 0, mir * 0.5, 0, lift=0.12)
        fl = newobj(nm, V2, F2, [m_sk], fm=M2); fl.location = (lx, 0.34, 0.07)
        fl.parent = body; fl.matrix_parent_inverse = body.matrix_world.inverted()
    export("xy_creature_turtle.glb", "Body")

# --------------------------------------------------------------------------- #
#  little bird                                                                 #
# --------------------------------------------------------------------------- #
def build_bird():
    reset()
    m_bd = mat("BirdBody", "#8fb3d4"); m_bl = mat("BirdBelly", "#eff5f9"); m_bk = mat("BirdBeak", "#f0a85a"); m_ey = mat("BirdEye", "#23292b")
    V = []; F = []; M = []
    add_ball(V, F, M, 0.13, 0, 0, 0, 0, 8, 5, sy=1.5, sz=0.95)        # body ovoid
    add_ball(V, F, M, 0.1, 0, 0.02, -0.05, 1, 7, 4, sy=1.2, sz=0.8)   # belly
    add_ball(V, F, M, 0.095, 0, 0.15, 0.08, 0, 7, 4)                  # head
    add_ball(V, F, M, 0.035, 0, 0.25, 0.06, 2, 5, 3, sy=2.4)          # beak
    add_ball(V, F, M, 0.025, 0.045, 0.2, 0.11, 3, 5, 3); add_ball(V, F, M, 0.025, -0.045, 0.2, 0.11, 3, 5, 3)  # eyes
    add_prism(V, F, M, [(0, 0.04), (0.07, 0.02), (0.1, -0.12), (0, -0.1), (-0.1, -0.12), (-0.07, 0.02)], 0.02, 0, -0.16, 0.05, 0, 0)  # tail
    body = newobj("Body", V, F, [m_bd, m_bl, m_bk, m_ey], fm=M)
    wp = [(0, 0.06), (0.15, 0.05), (0.3, -0.02), (0.32, -0.12), (0.17, -0.13), (0.04, -0.09), (0, -0.04)]
    for nm, mir, lx in (("WingL", 1, 0.07), ("WingR", -1, -0.07)):
        V2 = []; F2 = []; M2 = []
        add_prism(V2, F2, M2, [(mir * px, py) for (px, py) in wp], 0.018, 0, 0, 0, 0, 0)
        w = newobj(nm, V2, F2, [m_bd], fm=M2); w.location = (lx, 0.02, 0.06)
        w.parent = body; w.matrix_parent_inverse = body.matrix_world.inverted()
    export("xy_bg_bird.glb", "Body")

# --------------------------------------------------------------------------- #
#  puffy clouds                                                                #
# --------------------------------------------------------------------------- #
def build_clouds():
    reset()
    m_cloud = mat("Cloud", "#f5fafb", rough=0.9)
    def cloud(name, spec, zflat=0.6, off=(0, 0, 0)):
        V = []; F = []
        for (cx, cy, cz, r) in spec:
            o = len(V); bv, bf = ball(r, 0, 7, 4)
            for (vx, vy, vz) in bv: V.append((off[0] + cx + vx, off[1] + cy + vy, off[2] + cz + vz * zflat))
            for f in bf: F.append(tuple(o + i for i in f))
        return newobj(name, V, F, [m_cloud])
    cloud("Cloud1", [(-0.55, 0, 0, 0.32), (-0.15, 0, 0.06, 0.44), (0.28, 0, 0.03, 0.36), (0.62, 0, -0.02, 0.26), (0.05, 0, -0.05, 0.30)])
    cloud("Cloud2", [(-0.28, 0, 0, 0.26), (0.1, 0, 0.05, 0.36), (0.42, 0, 0, 0.24)], off=(0, 0, -1.4))
    cloud("Cloud3", [(-0.92, 0, 0, 0.28), (-0.5, 0, 0.06, 0.42), (-0.05, 0, 0.09, 0.48), (0.42, 0, 0.04, 0.4), (0.86, 0, -0.02, 0.3), (0.12, 0, -0.06, 0.34)], off=(0, 0, 1.5))
    export("xy_bg_cloud.glb", "Cloud1")

# --------------------------------------------------------------------------- #
#  radiant sun                                                                 #
# --------------------------------------------------------------------------- #
def build_sun():
    reset()
    m_core = mat("Emissive_SunCore", "#fff3cf", rough=0.3, emit="#fff0c0", es=5.0)
    m_rays = mat("Emissive_SunRays", "#ffe6a0", rough=0.3, emit="#ffdf8c", es=3.2)
    cv, cf = ball(0.8, 0, 12, 8); newobj("SunCore", cv, cf, [m_core], smooth=True)
    RV = []; RF = []
    for k in range(10):                                    # 10 soft petals in the XZ plane (disc normal +Y)
        ang = 2 * math.pi * k / 10; ca, sa = math.cos(ang), math.sin(ang); o = len(RV); bv, bf = ball(0.14, 0, 6, 3)
        for (vx, vy, vz) in bv:
            x = vx * 2.8 + 1.02; y = vy; z = vz
            RV.append((x * ca - z * sa, y, x * sa + z * ca))
        for f in bf: RF.append(tuple(o + i for i in f))
    newobj("SunRays", RV, RF, [m_rays], smooth=True)
    export("xy_bg_sun.glb", "SunCore")

if __name__ == "__main__":
    build_turtle()
    build_bird()
    build_clouds()
    build_sun()
    print("all background assets exported to", OUT)
