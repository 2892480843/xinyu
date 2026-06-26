# -*- coding: utf-8 -*-
"""
心屿 · 主角「记忆的守护者」Protagonist — rigged-ready build (限独立节点 + 披风节点 + 海浪贴图).

按角色设定表 1:1 复刻的 Q 版海岛旅人,本版相比初版:
  - 拆成独立节点 Body / LegL / LegR / ArmL / ArmR / Cape(枢轴在髋/肩/颈) → 游戏里 Player
    可摆腿/摆臂/跳跃,披风可随动飘 (走 GltfHero/GltfAvatar 那套)。
  - 比例调高(腿加长,OFF 上移上半身),不那么矮墩。
  - 斗篷蓝色滚边用「程序生成的海浪条纹贴图」(Decal_Wave, UV 缠绕) 还原花纹。

Faces +Y (Blender) -> glTF -Z. Body 原点在脚底中心(0,0,0),四肢/披风原点在各自枢轴。
材质槽命名 Skin/Hair/Cape/Trim/Pants/Boot/Emissive_Lamp/Decal_Wave… 供 GltfHero 着色/发光/保图。
Run headless:  blender --background --python blender/xy_protagonist.py
Output -> frontend/public/models/xy_char_protagonist.glb  (+ /tmp/xy_protagonist_view.png)
"""
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix

OUT = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else
    "/Users/a111/chen/code/心屿/blender", "..", "frontend", "public", "models"))
OFF = 0.40  # 上半身整体上移 + 腿加长 → 更高挑(约 5+ 头身,少年感)
Q = 1.8     # 网格细分系数:所有圆柱/球/锥/壳段数 ×Q → 整体更圆滑精细,去低多边形棱角

# --------------------------------------------------------------------------- #
#  helpers                                                                     #
# --------------------------------------------------------------------------- #
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexc(h, a=1.0):
    h = h.lstrip("#")
    return (s2l(int(h[0:2], 16) / 255), s2l(int(h[2:4], 16) / 255), s2l(int(h[4:6], 16) / 255), a)

def mat(name, hx, rough=0.85, emit=None, es=0.0, alpha=1.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = hexc(hx, alpha); b.inputs["Roughness"].default_value = rough
    m.diffuse_color = hexc(hx, alpha)
    if "Metallic" in b.inputs: b.inputs["Metallic"].default_value = metal
    if emit is not None:
        b.inputs["Emission Color"].default_value = hexc(emit); b.inputs["Emission Strength"].default_value = es
    if alpha < 1.0:
        m.blend_method = "BLEND"; b.inputs["Alpha"].default_value = alpha
    return m

def wave_tex_mat(name, bg="#5aa7c4", fg="#eaf7fb"):
    """蓝底白浪条纹贴图(程序生成)→ 海浪滚边花纹。"""
    W, H = 256, 48; a = np.zeros((H, W, 4), np.float32)
    cb = hexc(bg); cf = hexc(fg)
    a[:, :, 0] = cb[0]; a[:, :, 1] = cb[1]; a[:, :, 2] = cb[2]; a[:, :, 3] = 1.0
    xs = np.arange(W)
    for (ph, amp, th) in [(0.0, 9, 3), (1.7, 6, 2)]:
        yw = H * 0.5 + amp * np.sin(2 * np.pi * 3 * xs / W + ph)
        for x in range(W):
            y0 = max(0, int(yw[x] - th)); y1 = min(H, int(yw[x] + th))
            a[y0:y1, x, 0] = cf[0]; a[y0:y1, x, 1] = cf[1]; a[y0:y1, x, 2] = cf[2]
    img = bpy.data.images.new(name + "Img", W, H, alpha=True); img.pixels = a.ravel().tolist()
    img.pack()
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF"); tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img; tex.extension = "REPEAT"; tex.location = (-300, 0)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    m.diffuse_color = hexc(fg)
    return m

def swirl_tex_mat(name, bg="#2f5e70", fg="#5aa0b6"):
    """青裤整条卷纹:深青底 + 流动卷曲细条纹(程序生成,x 波被 y 调制 → 卷曲)。"""
    W, H = 128, 128; a = np.zeros((H, W, 4), np.float32)
    cb = hexc(bg); cf = hexc(fg)
    a[:, :, 0] = cb[0]; a[:, :, 1] = cb[1]; a[:, :, 2] = cb[2]; a[:, :, 3] = 1.0
    ys = np.arange(H)[:, None]; xs = np.arange(W)[None, :]
    for ph in (0.0, 1.05, 2.1):
        band = np.sin(2 * np.pi * 2 * xs / W + ph + 1.3 * np.sin(2 * np.pi * ys / H))
        mask = np.abs(band) > 0.9
        a[:, :, 0] = np.where(mask, cf[0], a[:, :, 0])
        a[:, :, 1] = np.where(mask, cf[1], a[:, :, 1])
        a[:, :, 2] = np.where(mask, cf[2], a[:, :, 2])
    img = bpy.data.images.new(name + "Img", W, H, alpha=True); img.pixels = a.ravel().tolist()
    img.pack()
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF"); tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img; tex.extension = "REPEAT"; tex.location = (-300, 0)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    m.diffuse_color = hexc(fg)
    return m

def lighthouse_tex_mat(name, bg="#cdb083"):
    """灯塔徽记贴图(程序生成):锥形白塔 + 红带 + 灯室暖光 + 屋顶,衬在背包同色底上。"""
    W, H = 64, 84; a = np.zeros((H, W, 4), np.float32)
    cbg = hexc(bg); a[:, :, 0] = cbg[0]; a[:, :, 1] = cbg[1]; a[:, :, 2] = cbg[2]; a[:, :, 3] = 1.0
    white = hexc("#f3ece0"); blue = hexc("#3f7d94"); red = hexc("#c8744f"); glow = hexc("#ffe6a0"); cx = W // 2
    def fill(y0, y1, x0, x1, c):
        a[max(0, y0):min(H, y1), max(0, x0):min(W, x1), 0] = c[0]
        a[max(0, y0):min(H, y1), max(0, x0):min(W, x1), 1] = c[1]
        a[max(0, y0):min(H, y1), max(0, x0):min(W, x1), 2] = c[2]
    fill(6, 11, cx - 13, cx + 13, blue)                                   # base
    for y in range(11, 60):                                               # tapered white tower
        hw = int(11 - 5 * (y - 11) / 49.0); fill(y, y + 1, cx - hw, cx + hw, white)
    for by in (20, 34, 48):                                               # red bands
        hw = int(11 - 5 * (by - 11) / 49.0) + 1; fill(by, by + 5, cx - hw, cx + hw, red)
    fill(60, 70, cx - 7, cx + 7, blue); fill(62, 68, cx - 4, cx + 4, glow) # lantern room + light
    fill(70, 77, cx - 9, cx + 9, red); fill(77, 81, cx - 3, cx + 3, blue)  # roof + finial
    img = bpy.data.images.new(name + "Img", W, H, alpha=True); img.pixels = a.ravel().tolist(); img.pack()
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF"); tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.location = (-300, 0)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"]); m.diffuse_color = hexc("#f3ece0")
    return m

class MB:
    def __init__(self): self.mats = []; self.idx = {}
    def add(self, name, hx=None, mtl=None, **kw):
        m = mtl if mtl is not None else mat(name, hx, **kw)
        i = len(self.mats); self.mats.append(m); self.idx[name] = i; return i

def mkobj(name, V, F, mats, fm, pivot, smooth=True):
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    for m in mats: me.materials.append(m)
    if fm is not None: me.polygons.foreach_set("material_index", fm); me.update()
    for p in me.polygons: p.use_smooth = smooth
    return ob

def set_origin(ob, pivot):
    ob.data.transform(Matrix.Translation((-pivot[0], -pivot[1], -pivot[2]))); ob.location = pivot

def recalc(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()

def add_box(V, F, M, cx, cy, cz, w, d, h, mi, rz=0.0, ry=0.0):  # CENTER
    hw, hd, hh = w / 2, d / 2, h / 2; ca, sa = math.cos(rz), math.sin(rz); cb, sb = math.cos(ry), math.sin(ry)
    def P(px, py, pz):
        px, pz = px * cb + pz * sb, -px * sb + pz * cb                         # 绕 Y(正面可见的倾斜,用于皱眉)
        return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)
    o = len(V)
    V += [P(-hw, -hd, -hh), P(hw, -hd, -hh), P(hw, hd, -hh), P(-hw, hd, -hh),
          P(-hw, -hd, hh), P(hw, -hd, hh), P(hw, hd, hh), P(-hw, hd, hh)]
    F += [(o, o + 1, o + 5, o + 4), (o + 1, o + 2, o + 6, o + 5), (o + 2, o + 3, o + 7, o + 6),
          (o + 3, o, o + 4, o + 7), (o + 4, o + 5, o + 6, o + 7), (o, o + 3, o + 2, o + 1)]
    for _ in range(6): M.append(mi)

def add_quad(V, F, M, pts, mi, two_sided=False):
    o = len(V); V += pts
    F.append((o, o + 1, o + 2, o + 3)); M.append(mi)
    if two_sided:
        F.append((o + 3, o + 2, o + 1, o)); M.append(mi)

def add_cyl(V, F, M, cx, cy, cz, r, h, mi, sg=12, r2=None):
    sg = max(8, round(sg * Q)); r2 = r if r2 is None else r2; o = len(V)
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append((cx + r * math.cos(a), cy + r * math.sin(a), cz))
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append((cx + r2 * math.cos(a), cy + r2 * math.sin(a), cz + h))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o + j, o + j2, o + sg + j2, o + sg + j)); M.append(mi)
    t = len(V); V.append((cx, cy, cz + h)); b = len(V); V.append((cx, cy, cz))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((t, o + sg + j, o + sg + j2)); M.append(mi); F.append((b, o + j2, o + j)); M.append(mi)

def add_cyl2(V, F, M, p0, p1, r, mi, sg=10, r2=None):
    sg = max(8, round(sg * Q)); r2 = r if r2 is None else r2; p0 = Vector(p0); p1 = Vector(p1); ax = p1 - p0
    if ax.length < 1e-6: return
    zc = ax.normalized(); up = Vector((0, 0, 1)) if abs(zc.z) < 0.9 else Vector((1, 0, 0))
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
    sg = max(6, round(sg * Q)); ca, sa = math.cos(rz), math.sin(rz)
    def P(px, py, pz): return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)
    o = len(V)
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append(P(rb * math.cos(a), rb * math.sin(a), 0))
    ap = len(V); V.append(P(0, 0, h)); bc = len(V); V.append(P(0, 0, 0))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o + j, o + j2, ap)); M.append(mi); F.append((bc, o + j2, o + j)); M.append(mi)

def add_ell(V, F, M, cx, cy, cz, rx, ry, rz, mi, sg=12, rg=8):
    sg = max(10, round(sg * Q)); rg = max(6, round(rg * Q)); o = len(V); V.append((cx, cy, cz + rz))
    for i in range(1, rg):
        phi = math.pi * i / rg; zc = math.cos(phi); sr = math.sin(phi)
        for j in range(sg):
            a = 2 * math.pi * j / sg; V.append((cx + rx * sr * math.cos(a), cy + ry * sr * math.sin(a), cz + rz * zc))
    s = len(V); V.append((cx, cy, cz - rz))
    for j in range(sg): F.append((o, o + 1 + j, o + 1 + (j + 1) % sg)); M.append(mi)
    for i in range(rg - 2):
        b0 = o + 1 + i * sg; b1 = o + 1 + (i + 1) * sg
        for j in range(sg):
            j2 = (j + 1) % sg; F.append((b0 + j, b0 + j2, b1 + j2, b1 + j)); M.append(mi)
    b0 = o + 1 + (rg - 2) * sg
    for j in range(sg): F.append((s, b0 + (j + 1) % sg, b0 + j)); M.append(mi)

def add_shell(V, F, M, cx, cy, z_top, r_top, z_bot, r_bot, mi, a0, a1, seg=30, wavy=0.0):
    seg = max(20, round(seg * Q)); o = len(V); n = seg + 1
    for i in range(n):
        a = a0 + (a1 - a0) * i / seg; V.append((cx + r_top * math.cos(a), cy + r_top * math.sin(a), z_top))
    for i in range(n):
        a = a0 + (a1 - a0) * i / seg; rb = r_bot + wavy * math.sin(a * 6)
        V.append((cx + rb * math.cos(a), cy + rb * math.sin(a), z_bot + wavy * 0.5 * math.sin(a * 6)))
    for i in range(seg):
        F.append((o + i, o + i + 1, o + n + i + 1, o + n + i)); M.append(mi)
        F.append((o + i, o + n + i, o + n + i + 1, o + i + 1)); M.append(mi)

def uv_wrap(ob, mat_name, repeat=7.0):
    """给指定材质的面按 (角度→u, 高度→v) 贴图缠绕。须在 set_origin 前调用(顶点仍为建造坐标)。"""
    me = ob.data
    mi = next((i for i, m in enumerate(me.materials) if m and m.name == mat_name), None)
    if mi is None: return
    uvl = me.uv_layers.get("UV") or me.uv_layers.new(name="UV")     # 复用同一 UV 层(可多材质各贴各的)
    zs = [me.vertices[v].co.z for p in me.polygons if p.material_index == mi for v in p.vertices]
    if not zs: return
    zlo, zhi = min(zs), max(zs); span = max(1e-4, zhi - zlo)
    for p in me.polygons:
        if p.material_index != mi: continue
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (math.atan2(co.y, co.x) / (2 * math.pi) + 0.5) * repeat
            uvl.data[li].uv = (u, (co.z - zlo) / span)

def uv_planar(ob, mat_name):
    """给指定材质的面按局部 X/Z 平面投影 UV(用于朝 +Y 的扁平 decal)。须在 set_origin 前调用。"""
    me = ob.data
    mi = next((i for i, m in enumerate(me.materials) if m and m.name == mat_name), None)
    if mi is None: return
    uvl = me.uv_layers.get("UV") or me.uv_layers.new(name="UV")
    vs = [me.vertices[v].co for p in me.polygons if p.material_index == mi for v in p.vertices]
    if not vs: return
    xlo = min(v.x for v in vs); xhi = max(v.x for v in vs); zlo = min(v.z for v in vs); zhi = max(v.z for v in vs)
    sx = max(1e-4, xhi - xlo); sz = max(1e-4, zhi - zlo)
    for p in me.polygons:
        if p.material_index != mi: continue
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = (1.0 - (co.x - xlo) / sx, (co.z - zlo) / sz)

def reset():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for d in list(blk):
            if d.users == 0: blk.remove(d)

# --------------------------------------------------------------------------- #
#  build (parts -> named objects, parented to Body)                            #
# --------------------------------------------------------------------------- #
def build():
    mb = MB()
    SKIN = mb.add("Skin", "#f4d6b8"); SKDK = mb.add("SkinDk", "#e6bd9a")
    HAIR = mb.add("Hair", "#2b3242"); HAIRH = mb.add("HairHi", "#3d4860")
    EYE = mb.add("Eye", "#28324c"); EWHITE = mb.add("EyeWhite", "#f6f8fa"); EHI = mb.add("Emissive_EyeHi", "#ffffff", emit="#ffffff", es=1.2); EYELINE = mb.add("EyeLine", "#1c2336")
    BLUSH = mb.add("Blush", "#f0a0a0"); MOUTH = mb.add("Mouth", "#8a4a48")
    CAPE = mb.add("Cape", "#f5eeda"); CAPESH = mb.add("CapeShade", "#e6dcc2"); HOOD = mb.add("Hood", "#efe6cf")
    TRIM = mb.add("Trim", mtl=wave_tex_mat("Decal_Wave", bg="#4fb0cc", fg="#eef9fc"))   # 更亮海玻璃蓝·白浪滚边
    INNER = mb.add("Inner", "#f0e7d0")
    STRAP = mb.add("Strap", "#7a5230"); STRAPD = mb.add("StrapDk", "#5a3c22"); BUCK = mb.add("Buckle", "#c9a85c", metal=0.4, rough=0.5)
    SATCH = mb.add("Satchel", "#cdb083"); SATFL = mb.add("SatchelFlap", "#bda072"); LH = mb.add("Decal_Lighthouse", mtl=lighthouse_tex_mat("Decal_Lighthouse", bg="#cdb083"))
    PANT = mb.add("Pants", "#3f7d94"); PANTD = mb.add("PantsDk", "#316072")   # 更深更蓝的青裤
    SWIRL = mb.add("Decal_PantSwirl", mtl=swirl_tex_mat("Decal_PantSwirl", bg="#2f5e70", fg="#5aa0b6"))   # 整条裤卷纹
    BOOT = mb.add("Boot", "#ecdcb8"); BOOTC = mb.add("BootCuff", "#dcc796"); SOLE = mb.add("BootSole", "#6f5a44"); LACE = mb.add("Lace", "#c0ad84")  # 暖柔米靴
    BRASS = mb.add("Lantern", "#c2a25a", metal=0.5, rough=0.45); LGLOW = mb.add("Emissive_Lamp", "#ffd98f", emit="#ffe6b0", es=4.0)
    SHELL = mb.add("Shell", "#f0e0cf"); SHBLUE = mb.add("ShellBlue", "#7fc0d4"); CORD = mb.add("Cord", "#6f4a2c")
    CAPEBLUE = mb.add("CapeBlueSheer", "#79bdcb", alpha=0.64)
    PEARL = mb.add("Pearl", "#eaf8f6", rough=0.42)
    GOLDPIN = mb.add("GoldPin", "#d0a75a", metal=0.55, rough=0.46)
    TASSBLUE = mb.add("TasselBlue", "#4f9eb8")
    mats = mb.mats
    parts = {}
    def P(n):
        parts.setdefault(n, ([], [], [])); return parts[n]
    HIP = 0.86 + OFF; SH = 1.28 + OFF                                          # hip / shoulder z

    # ---------------- legs: thigh(LegL/R, pivot=hip) + shin(ShinL/R, pivot=knee) ---------------- #
    # 拆两段 → 游戏里小腿可绕膝相对大腿弯曲(真·屈膝),告别剪刀直棍。膝接缝由挽裤脚那圈盖住。
    KNEE = 0.60
    for sx, nm in ((-1, "LegL"), (1, "LegR")):                                            # 大腿(枢轴在髋)
        V, F, M = P(nm); x = 0.135 * sx
        add_cyl2(V, F, M, (x, 0, HIP), (x, 0, KNEE - 0.03), 0.135, SWIRL, 10, r2=0.122)   # thigh(整条卷纹)
    for sx, snm in ((-1, "ShinL"), (1, "ShinR")):                                         # 小腿+靴(枢轴在膝)
        V, F, M = P(snm); x = 0.135 * sx
        add_cyl2(V, F, M, (x, 0, KNEE + 0.02), (x, 0.0, 0.44), 0.13, TRIM, 12, r2=0.144)  # 挽裤脚(海浪纹,盖膝缝)
        add_cyl2(V, F, M, (x, 0.0, 0.46), (x, 0.03, 0.12), 0.125, BOOT, 10, r2=0.13)      # boot shaft
        add_cyl(V, F, M, x, 0.03, 0.42, 0.135, 0.07, BOOTC, 10)                            # boot cuff
        add_box(V, F, M, x, 0.12, 0.07, 0.16, 0.3, 0.13, BOOT)                             # foot
        add_ell(V, F, M, x, 0.27, 0.06, 0.085, 0.09, 0.07, BOOT, 8, 5)                     # toe
        add_box(V, F, M, x, 0.13, 0.005, 0.18, 0.34, 0.04, SOLE)                           # sole
        for lz in (0.18, 0.27, 0.36):
            add_box(V, F, M, x, 0.12, lz, 0.1, 0.03, 0.02, LACE)

    # ---------------- arms: upper(ArmL/R, pivot=shoulder) + fore(ForeArmL/R, pivot=elbow) ---------------- #
    # 拆两段 → 小臂可绕肘相对大臂弯曲(屈肘),摆臂自然带肘;灯笼随小臂(右)摆动。
    hand = {}; ELB = {}
    for sx, nm in ((-1, "ArmL"), (1, "ArmR")):                                           # 大臂(枢轴在肩)
        V, F, M = P(nm)
        sh = (0.2 * sx, 0.0, SH); el = (0.31 * sx, 0.02, 0.88 + OFF)
        add_cyl2(V, F, M, sh, el, 0.1, INNER, 9, r2=0.086)                               # upper-arm sleeve
        ELB[sx] = el
    for sx, fnm in ((-1, "ForeArmL"), (1, "ForeArmR")):                                  # 小臂+手(枢轴在肘)
        V, F, M = P(fnm)
        el = ELB[sx]; wr = (0.34 * sx, 0.06, 0.66 + OFF)
        add_cyl2(V, F, M, el, wr, 0.084, INNER, 9, r2=0.07)                              # forearm sleeve(盖肘缝)
        add_cyl(V, F, M, wr[0], wr[1], wr[2] - 0.02, 0.075, 0.05, SKDK, 9)               # cuff band
        hpos = (wr[0], wr[1] + 0.02, wr[2] - 0.07)
        add_ell(V, F, M, hpos[0], hpos[1], hpos[2], 0.078, 0.088, 0.09, SKIN, 9, 6)      # hand (mitten)
        add_ell(V, F, M, hpos[0] - 0.05 * sx, hpos[1] + 0.02, hpos[2] + 0.012, 0.03, 0.042, 0.052, SKIN, 6, 5)  # thumb
        hand[sx] = hpos
    # lantern hangs from the right fore-arm (built into ForeArmR so it swings with the forearm)
    V, F, M = P("ForeArmR"); hx, hy, hz = hand[1]
    add_cyl2(V, F, M, (hx, hy, hz), (hx + 0.02, hy + 0.04, hz - 0.12), 0.012, BRASS, 5)
    lx, ly = hx + 0.02, hy + 0.04
    add_cyl(V, F, M, lx, ly, hz - 0.30, 0.07, 0.02, BRASS, 10)
    add_cyl(V, F, M, lx, ly, hz - 0.14, 0.05, 0.0, BRASS, 8)
    add_ell(V, F, M, lx, ly, hz - 0.22, 0.06, 0.06, 0.08, LGLOW, 10, 6)
    for j in range(4):
        a = math.pi / 4 + j * math.pi / 2
        add_cyl2(V, F, M, (lx + 0.06 * math.cos(a), ly + 0.06 * math.sin(a), hz - 0.30),
                 (lx + 0.06 * math.cos(a), ly + 0.06 * math.sin(a), hz - 0.14), 0.008, BRASS, 4)
    add_cyl(V, F, M, lx, ly, hz - 0.32, 0.055, 0.03, BRASS, 10)

    # ---------------- cape (independent node, pivot at neck) ---------------- #
    V, F, M = P("Cape"); A0, A1 = 0.62, 2 * math.pi - 0.62
    add_shell(V, F, M, 0, 0, 1.24 + OFF, 0.27, 0.80 + OFF, 0.4, CAPE, A0, A1, seg=34, wavy=0.06)     # 更长更飘
    add_shell(V, F, M, 0, 0, 0.88 + OFF, 0.39, 0.78 + OFF, 0.4, TRIM, A0, A1, seg=34, wavy=0.06)     # textured wave trim
    add_shell(V, F, M, 0, 0, 1.22 + OFF, 0.26, 0.98 + OFF, 0.34, CAPESH, A0, A1, seg=28)
    add_cyl(V, F, M, 0, -0.02, 1.2 + OFF, 0.26, 0.08, TRIM, 16, r2=0.24)                  # collar(海浪纹)
    for sx in (-1, 1):                                                                    # shoulder drape caps
        add_ell(V, F, M, 0.2 * sx, 0.0, SH, 0.12, 0.12, 0.11, CAPE, 10, 6)

    # ---------------- reference polish: sheer side cape tails + back lighthouse mark ---------------- #
    for sx, nm in ((-1, "CapeSideTailL"), (1, "CapeSideTailR")):
        V, F, M = P(nm)
        add_quad(V, F, M, [
            (0.24 * sx, -0.02, 1.18 + OFF),
            (0.43 * sx, -0.04, 1.08 + OFF),
            (0.48 * sx, -0.08, 0.62 + OFF),
            (0.27 * sx, -0.06, 0.76 + OFF),
        ], CAPEBLUE)
        add_cyl2(V, F, M, (0.26 * sx, -0.055, 0.78 + OFF), (0.47 * sx, -0.075, 0.62 + OFF), 0.009, TRIM, 5, r2=0.006)
        add_cyl2(V, F, M, (0.43 * sx, -0.04, 1.08 + OFF), (0.48 * sx, -0.08, 0.62 + OFF), 0.008, TRIM, 5, r2=0.005)

    V, F, M = P("CapeBackEmblem")
    qcx, qy, qcz, qw, qh = 0.0, -0.335, 1.06 + OFF, 0.24, 0.22
    add_quad(V, F, M, [
        (qcx - qw / 2, qy, qcz - qh / 2),
        (qcx + qw / 2, qy, qcz - qh / 2),
        (qcx + qw / 2, qy, qcz + qh / 2),
        (qcx - qw / 2, qy, qcz + qh / 2),
    ], LH)

    # ---------------- body (torso/head/hair/face/straps/satchel/amulet) ---------------- #
    V, F, M = P("body")
    add_ell(V, F, M, 0, 0, 0.88 + OFF, 0.22, 0.16, 0.13, PANT, 12, 7)                     # hips
    add_cyl2(V, F, M, (0, 0, 0.92 + OFF), (0, 0.01, 1.34 + OFF), 0.2, INNER, 14, r2=0.19) # torso (inner top)
    add_ell(V, F, M, 0, 0.02, 1.2 + OFF, 0.2, 0.15, 0.16, INNER, 14, 7)                   # chest
    add_cyl(V, F, M, 0, 0, 1.3 + OFF, 0.07, 0.08, SKIN, 10)                               # neck
    HZ = 1.54 + OFF
    add_ell(V, F, M, 0, 0, HZ, 0.205, 0.2, 0.225, SKIN, 16, 11)                           # head
    fy = 0.185
    add_ell(V, F, M, 0, fy + 0.03, HZ - 0.04, 0.02, 0.02, 0.018, SKDK, 6, 4)              # nose(共用)
    for bx in (-0.135, 0.135):                                                            # 腮红(共用)
        add_ell(V, F, M, bx, fy - 0.01, HZ - 0.04, 0.04, 0.012, 0.03, BLUSH, 7, 4)
    # hair
    add_ell(V, F, M, 0, -0.03, HZ + 0.04, 0.225, 0.215, 0.215, HAIR, 16, 10)
    add_ell(V, F, M, 0, -0.12, HZ - 0.04, 0.2, 0.16, 0.2, HAIR, 12, 8)
    for k, bx in enumerate((-0.16, -0.08, 0.0, 0.08, 0.16)):
        add_cone(V, F, M, bx, 0.18 - abs(bx) * 0.12, HZ + 0.18, 0.075, -0.16 - 0.02 * (k % 2), HAIR, 5)
    spikes = [(-0.2, -0.05, HZ + 0.1, 0.6, 0.3), (0.2, -0.05, HZ + 0.1, -0.6, 0.3), (-0.13, -0.2, HZ + 0.08, 0.25, 0.6),
              (0.13, -0.2, HZ + 0.08, -0.25, 0.6), (0.0, -0.23, HZ + 0.12, 0.0, 0.6), (-0.22, 0.0, HZ, 0.8, 0.1), (0.22, 0.0, HZ, -0.8, 0.1)]
    for (sxp, syp, szp, dx, dz) in spikes:
        add_cyl2(V, F, M, (sxp, syp, szp), (sxp + dx * 0.1, syp - 0.04, szp + dz * 0.1), 0.075, HAIR, 5, r2=0.03)
    add_cyl2(V, F, M, (0.02, -0.04, HZ + 0.23), (0.06, 0.0, HZ + 0.38), 0.018, HAIR, 5, r2=0.006)    # ahoge
    add_cyl2(V, F, M, (0.06, 0.0, HZ + 0.38), (0.13, 0.02, HZ + 0.42), 0.012, HAIR, 4, r2=0.004)
    add_cyl2(V, F, M, (-0.18, -0.04, HZ + 0.1), (-0.27, -0.08, HZ + 0.18), 0.04, HAIRH, 5, r2=0.005)
    add_ell(V, F, M, 0, 0.0, HZ + 0.17, 0.18, 0.16, 0.11, HAIR, 12, 6)                    # 顶部蓬松发量
    for sx in (-1, 1):                                                                    # 面颊侧发(框脸,垂在脸侧)
        add_cyl2(V, F, M, (0.2 * sx, 0.11, HZ + 0.05), (0.2 * sx, 0.15, HZ - 0.16), 0.055, HAIR, 6, r2=0.028)
    add_box(V, F, M, 0.17, 0.1, HZ + 0.12, 0.05, 0.04, 0.11, TRIM, rz=0.3)                # hair clip
    add_box(V, F, M, 0.17, 0.11, HZ + 0.12, 0.02, 0.02, 0.13, SHBLUE, rz=0.3)
    Vh, Fh, Mh = P("HairWhorl")                                                           # 参考图头顶卷翘发束
    add_cyl2(Vh, Fh, Mh, (-0.025, -0.025, HZ + 0.21), (0.01, -0.01, HZ + 0.39), 0.017, HAIR, 5, r2=0.008)
    add_cyl2(Vh, Fh, Mh, (0.01, -0.01, HZ + 0.39), (0.09, 0.03, HZ + 0.42), 0.012, HAIR, 5, r2=0.004)
    add_cyl2(Vh, Fh, Mh, (-0.04, -0.035, HZ + 0.23), (-0.10, -0.01, HZ + 0.34), 0.011, HAIRH, 5, r2=0.004)
    add_ell(Vh, Fh, Mh, 0.17, 0.13, HZ + 0.12, 0.028, 0.012, 0.028, GOLDPIN, 7, 4)
    add_ell(Vh, Fh, Mh, 0.19, 0.14, HZ + 0.105, 0.018, 0.01, 0.018, SHBLUE, 6, 4)
    # hood (down behind neck)
    add_ell(V, F, M, 0, -0.2, 1.28 + OFF, 0.19, 0.14, 0.17, HOOD, 12, 7)
    add_ell(V, F, M, 0, -0.16, 1.24 + OFF, 0.15, 0.1, 0.13, CAPESH, 10, 6)
    # crossbody straps + buckles + belt (on chest surface, shown in the cape's open front)
    add_cyl2(V, F, M, (-0.16, 0.21, 1.23 + OFF), (0.13, 0.205, 0.93 + OFF), 0.036, STRAP, 6)
    add_cyl2(V, F, M, (0.16, 0.21, 1.23 + OFF), (-0.13, 0.205, 0.93 + OFF), 0.036, STRAPD, 6)
    add_box(V, F, M, 0, 0.24, 1.07 + OFF, 0.085, 0.04, 0.085, BUCK)
    add_cyl(V, F, M, 0, 0.0, 0.85 + OFF, 0.205, 0.07, STRAP, 16, r2=0.205)                # waist belt
    add_box(V, F, M, 0, 0.205, 0.88 + OFF, 0.08, 0.04, 0.08, BUCK)
    # travel satchel (left hip)
    sxh = -0.28
    add_cyl2(V, F, M, (0.16, 0.16, 1.26 + OFF), (sxh, 0.06, 0.86 + OFF), 0.03, SATFL, 6)
    add_box(V, F, M, sxh, 0.08, 0.74 + OFF, 0.24, 0.14, 0.26, SATCH, rz=0.1)
    add_box(V, F, M, sxh, 0.16, 0.84 + OFF, 0.25, 0.06, 0.14, SATFL, rz=0.1)
    qcx, qy, qcz, qw, qh = sxh, 0.235, 0.79 + OFF, 0.17, 0.21       # 灯塔徽记(decal 贴图,朝 +Y)
    _o = len(V)
    V += [(qcx - qw / 2, qy, qcz - qh / 2), (qcx + qw / 2, qy, qcz - qh / 2), (qcx + qw / 2, qy, qcz + qh / 2), (qcx - qw / 2, qy, qcz + qh / 2)]
    F.append((_o, _o + 1, _o + 2, _o + 3)); M.append(LH)
    add_box(V, F, M, sxh, 0.2, 0.74 + OFF, 0.04, 0.02, 0.04, BUCK, rz=0.1)
    Vc, Fc, Mc = P("SatchelShellCharm")
    add_cyl2(Vc, Fc, Mc, (sxh - 0.13, 0.18, 0.88 + OFF), (sxh - 0.15, 0.20, 0.75 + OFF), 0.006, GOLDPIN, 5)
    add_ell(Vc, Fc, Mc, sxh - 0.15, 0.215, 0.73 + OFF, 0.046, 0.018, 0.052, SHELL, 9, 5)
    for dx in (-0.024, -0.012, 0.0, 0.012, 0.024):
        add_cyl2(Vc, Fc, Mc, (sxh - 0.15, 0.235, 0.76 + OFF), (sxh - 0.15 + dx, 0.238, 0.70 + OFF), 0.0035, GOLDPIN, 4, r2=0.002)
    add_ell(Vc, Fc, Mc, sxh - 0.15, 0.23, 0.66 + OFF, 0.014, 0.01, 0.025, SHBLUE, 6, 4)
    # shell amulet
    add_cyl2(V, F, M, (-0.12, 0.15, 1.26 + OFF), (0, 0.2, 1.12 + OFF), 0.012, CORD, 5)
    add_cyl2(V, F, M, (0.12, 0.15, 1.26 + OFF), (0, 0.2, 1.12 + OFF), 0.012, CORD, 5)
    add_ell(V, F, M, 0, 0.22, 1.09 + OFF, 0.055, 0.03, 0.05, SHELL, 9, 5)
    add_box(V, F, M, 0, 0.24, 1.09 + OFF, 0.012, 0.012, 0.06, SHBLUE)
    Vp, Fp, Mp = P("PearlPendant")
    add_ell(Vp, Fp, Mp, 0, 0.23, 1.18 + OFF, 0.024, 0.018, 0.024, PEARL, 8, 5)
    add_ell(Vp, Fp, Mp, 0, 0.235, 1.145 + OFF, 0.017, 0.012, 0.017, GOLDPIN, 7, 4)
    add_ell(Vp, Fp, Mp, 0, 0.24, 1.075 + OFF, 0.064, 0.022, 0.058, SHELL, 10, 5)
    for dx in (-0.035, -0.018, 0.0, 0.018, 0.035):
        add_cyl2(Vp, Fp, Mp, (0, 0.255, 1.12 + OFF), (dx, 0.258, 1.04 + OFF), 0.0035, GOLDPIN, 4, r2=0.002)
    add_ell(Vp, Fp, Mp, 0, 0.25, 1.00 + OFF, 0.014, 0.01, 0.024, SHBLUE, 6, 4)
    Vt, Ft, Mt = P("CloakCordTassels")
    for sx in (-1, 1):
        add_cyl2(Vt, Ft, Mt, (0.07 * sx, 0.225, 1.25 + OFF), (0.15 * sx, 0.22, 1.06 + OFF), 0.008, CORD, 5)
        add_ell(Vt, Ft, Mt, 0.15 * sx, 0.23, 1.05 + OFF, 0.018, 0.012, 0.018, GOLDPIN, 6, 4)
        add_cone(Vt, Ft, Mt, 0.15 * sx, 0.235, 0.99 + OFF, 0.024, -0.105, TASSBLUE, 7, rz=sx * 0.08)
        add_ell(Vt, Ft, Mt, 0.15 * sx, 0.24, 0.89 + OFF, 0.012, 0.008, 0.020, SHBLUE, 6, 4)

    # ---------------- 4 套可切换表情(眼/眉/嘴独立节点,游戏内按状态切 .visible) ---------------- #
    def add_eyes(VV, FF, MM, eyeH, lidZ, browZ, browRy):
        for ex in (-0.088, 0.088):
            si = 1 if ex < 0 else -1
            add_ell(VV, FF, MM, ex, fy + 0.008, HZ + 0.012, 0.056, 0.032, eyeH, EWHITE, 10, 6)                       # 眼白
            add_ell(VV, FF, MM, ex, fy + 0.028, HZ + 0.006, 0.048, 0.03, eyeH * 0.9, EYE, 10, 6)                     # 虹膜
            add_ell(VV, FF, MM, ex - 0.014 * si, fy + 0.05, HZ + max(0.03, eyeH * 0.5), 0.021, 0.013, 0.027, EHI, 7, 5)  # 主高光
            add_ell(VV, FF, MM, ex + 0.02 * si, fy + 0.046, HZ - 0.014, 0.011, 0.008, 0.014, EHI, 6, 4)  # 第二小高光:眼神更水灵清亮
            add_box(VV, FF, MM, ex, fy + 0.042, HZ + lidZ, 0.094, 0.02, 0.02, EYELINE, rz=si * 0.12)                 # 上眼睑
            add_box(VV, FF, MM, ex, fy + 0.022, HZ + browZ, 0.08, 0.02, 0.016, HAIR, ry=si * browRy)                 # 眉(绕Y倾斜)
    V, F, M = P("Face_Cheerful"); add_eyes(V, F, M, 0.082, 0.084, 0.128, -0.06)           # 开心:大圆眼·眉微挑·张口笑
    add_ell(V, F, M, 0, fy + 0.025, HZ - 0.085, 0.058, 0.022, 0.032, MOUTH, 9, 5)
    add_ell(V, F, M, 0, fy + 0.04, HZ - 0.092, 0.034, 0.012, 0.018, BLUSH, 7, 4)
    V, F, M = P("Face_Calm"); add_eyes(V, F, M, 0.056, 0.052, 0.116, 0.0)                 # 平静:半垂柔眼·眉平·抿嘴微笑
    add_ell(V, F, M, 0, fy + 0.022, HZ - 0.082, 0.044, 0.016, 0.014, MOUTH, 9, 5)
    V, F, M = P("Face_Determined"); add_eyes(V, F, M, 0.064, 0.05, 0.10, 0.34)            # 坚定:眯眼·眉压低内收·抿平嘴
    add_box(V, F, M, 0, fy + 0.028, HZ - 0.085, 0.072, 0.02, 0.018, MOUTH)
    V, F, M = P("Face_Curious"); add_eyes(V, F, M, 0.098, 0.10, 0.146, -0.12)             # 好奇:睁大眼·眉高挑·小圆嘴
    add_ell(V, F, M, 0, fy + 0.03, HZ - 0.085, 0.03, 0.024, 0.03, MOUTH, 8, 6)

    # ---------------- assemble: objects + pivots + parenting ---------------- #
    pivots = {"body": (0, 0, 0), "LegL": (-0.135, 0, HIP), "LegR": (0.135, 0, HIP),
              "ShinL": (-0.135, 0, KNEE), "ShinR": (0.135, 0, KNEE),
              "ArmL": (-0.2, 0, SH), "ArmR": (0.2, 0, SH), "ForeArmL": ELB[-1], "ForeArmR": ELB[1],
              "Cape": (0, 0, 1.24 + OFF),
              "CapeSideTailL": (0, 0, 1.24 + OFF), "CapeSideTailR": (0, 0, 1.24 + OFF),
              "CapeBackEmblem": (0, 0, 1.24 + OFF), "HairWhorl": (0, 0, HZ + 0.28),
              "CloakCordTassels": (0, 0, 0), "PearlPendant": (0, 0, 0), "SatchelShellCharm": (0, 0, 0),
              "Face_Cheerful": (0, 0, 0), "Face_Calm": (0, 0, 0), "Face_Determined": (0, 0, 0), "Face_Curious": (0, 0, 0)}
    objs = {}
    for nm, (V, F, M) in parts.items():
        oname = "Body" if nm == "body" else nm
        ob = mkobj(oname, V, F, mats, M, pivots[nm])
        set_origin(ob, pivots[nm])                                # 先移原点(腿/披风变为局部居中)再 UV
        if nm == "Cape": uv_wrap(ob, "Decal_Wave", repeat=7.0)    # 斗篷海浪滚边 + 领口
        if nm in ("body", "CapeBackEmblem"): uv_planar(ob, "Decal_Lighthouse")        # 背包/披风灯塔徽记
        if nm in ("LegL", "LegR"): uv_wrap(ob, "Decal_PantSwirl", repeat=4.0)   # 大腿裤卷纹
        if nm in ("ShinL", "ShinR"): uv_wrap(ob, "Decal_Wave", repeat=5.0)      # 挽裤脚海浪滚边
        recalc(ob); objs[nm] = ob
    body = objs["body"]
    # 一级:大腿/大臂/披风/4 表情 挂躯干(body 在原点,identity)
    for nm in ("LegL", "LegR", "ArmL", "ArmR", "Cape", "HairWhorl", "CloakCordTassels", "PearlPendant", "SatchelShellCharm",
               "Face_Cheerful", "Face_Calm", "Face_Determined", "Face_Curious"):
        objs[nm].parent = body
    bpy.context.view_layer.update()                               # 刷新 matrix_world,供二级 parent_inverse 取准
    # 二级:小腿挂大腿、小臂挂大臂(parent_inverse 保持世界位姿;游戏内各自绕膝/肘旋转 → 屈膝屈肘)
    for child, par in (("ShinL", "LegL"), ("ShinR", "LegR"), ("ForeArmL", "ArmL"), ("ForeArmR", "ArmR")):
        objs[child].parent = objs[par]
        objs[child].matrix_parent_inverse = objs[par].matrix_world.inverted()
    for child in ("CapeSideTailL", "CapeSideTailR", "CapeBackEmblem"):
        objs[child].parent = objs["Cape"]
        objs[child].matrix_parent_inverse = objs["Cape"].matrix_world.inverted()
    return body

# --------------------------------------------------------------------------- #
def export_glb():
    body = bpy.data.objects["Body"]
    for ob in bpy.data.objects: ob.select_set(False)
    body.select_set(True)
    for ch in body.children_recursive: ch.select_set(True)
    bpy.context.view_layer.objects.active = body
    path = os.path.join(OUT, "xy_char_protagonist.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True)
    print("exported ->", path, os.path.getsize(path), "bytes")

def _hide_faces_except(keep):
    for nm in ("Face_Cheerful", "Face_Calm", "Face_Determined", "Face_Curious"):
        ob = bpy.data.objects.get(nm)
        if ob: ob.hide_render = (nm != keep)

def render_view(out="/tmp/xy_protagonist_view.png"):
    try:
        sc = bpy.context.scene
        cam_d = bpy.data.cameras.new("Cam"); cam_d.lens = 60
        cam = bpy.data.objects.new("Cam", cam_d); bpy.context.collection.objects.link(cam)
        sc.camera = cam
        sun_d = bpy.data.lights.new("Sun", "SUN"); sun_d.energy = 3.2
        sun = bpy.data.objects.new("Sun", sun_d); bpy.context.collection.objects.link(sun)
        sun.rotation_euler = (math.radians(55), math.radians(10), math.radians(150))
        sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"
        sc.display.shading.color_type = "TEXTURE"; sc.display.shading.show_shadows = True
        # 全身(默认开心表情)
        _hide_faces_except("Face_Cheerful")
        cam.location = (2.4, 4.4, 1.5)                       # +X/+Y front-3/4 (sees +Y face)
        cam.rotation_euler = (Vector((0, 0, 1.0)) - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
        sc.render.resolution_x, sc.render.resolution_y = 700, 1000; sc.render.filepath = out
        bpy.ops.render.render(write_still=True); print("preview ->", out)
        # 4 表情头部特写
        HEADZ = 1.54 + OFF
        cam.location = (0.95, 1.85, HEADZ + 0.05)
        cam.rotation_euler = (Vector((0, 0, HEADZ)) - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
        sc.render.resolution_x, sc.render.resolution_y = 520, 520
        for f in ("Face_Cheerful", "Face_Calm", "Face_Determined", "Face_Curious"):
            _hide_faces_except(f); sc.render.filepath = "/tmp/xy_face_%s.png" % f
            bpy.ops.render.render(write_still=True)
        print("faces rendered")
    except Exception as e:
        print("render skipped:", e)

if __name__ == "__main__":
    reset(); build(); export_glb(); render_view()
    print("PROTAGONIST DONE ->", OUT)
