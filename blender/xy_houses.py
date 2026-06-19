# -*- coding: utf-8 -*-
"""
心屿 · 海岛村落建筑 House Kit (Batch 5) — procedural Blender build.

A cohesive, eclectic seaside village for the healing island. Per the user choice
"都要", the eight houses span THREE styles so the street reads diverse & lived-in:
  - storybook 海港 (cream plaster + warm wood + terracotta/teal roofs)
  - 和风渔村 (machiya: wood + grey-tile roof + lattice windows + noren)
  - 地中海/西式 (white-wash walls + blue domes/shutters + arches)

Each house is ONE low-poly mesh with NAMED material slots so the game can
recolor a single model into many (`Wall/Roof/Wood/Door/Trim/Stone`...) and light
the `Emissive_*` slots (warm windows / signs / lanterns) by emotion.

Style anchors + naming + pivot follow 心屿-Blender素材清单.md §0 and the existing
xy_island_home.py / xy_background.py craft. Everything deterministic (fixed seeds).

Facing: facade faces +Y (Blender) -> glTF -Z (engine rotates 180° where needed).
Pivot:  base centre on the ground (z=0), so position.y = groundHeight in game.

Run headless:  blender --background --python blender/xy_houses.py
Output -> frontend/public/models/xy_house_*.glb   (+ /tmp/xy_houses_preview.png)
"""
import bpy, bmesh, math, os

OUT = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else
    "/Users/a111/chen/code/心屿/blender", "..", "frontend", "public", "models"))

# --------------------------------------------------------------------------- #
#  helpers (same craft as xy_island_home.py / xy_background.py)                #
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
        m.blend_method = "BLEND"; b.inputs["Alpha"].default_value = alpha
    return m

class MB:
    """per-house material book: add() returns a slot index, mats feeds newobj."""
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

# -- primitive adders (append into V/F/M, base centre at (cx,cy,cz)) --------- #
def add_box(V, F, M, cx, cy, cz, w, d, h, mi, rz=0.0):
    hw, hd = w / 2, d / 2; ca, sa = math.cos(rz), math.sin(rz)
    def P(px, py, pz): return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)
    o = len(V)
    V += [P(-hw, -hd, 0), P(hw, -hd, 0), P(hw, hd, 0), P(-hw, hd, 0),
          P(-hw, -hd, h), P(hw, -hd, h), P(hw, hd, h), P(-hw, hd, h)]
    F += [(o + 0, o + 1, o + 5, o + 4), (o + 1, o + 2, o + 6, o + 5),
          (o + 2, o + 3, o + 7, o + 6), (o + 3, o + 0, o + 4, o + 7),
          (o + 4, o + 5, o + 6, o + 7), (o + 0, o + 3, o + 2, o + 1)]
    for _ in range(6): M.append(mi)

def add_gable(V, F, M, cx, cy, cz, w, d, rh, mi, oh=0.3, rz=0.0):
    """gabled roof: ridge along local X; triangular gables face ±X."""
    rw, rd = w / 2 + oh, d / 2 + oh; ca, sa = math.cos(rz), math.sin(rz)
    def P(px, py, pz): return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)
    o = len(V)
    V += [P(-rw, -rd, 0), P(rw, -rd, 0), P(rw, rd, 0), P(-rw, rd, 0), P(-rw, 0, rh), P(rw, 0, rh)]
    F += [(o + 0, o + 1, o + 5, o + 4), (o + 3, o + 2, o + 5, o + 4),
          (o + 0, o + 4, o + 3), (o + 1, o + 2, o + 5)]
    for _ in range(4): M.append(mi)

def add_cyl(V, F, M, cx, cy, cz, r, h, mi, sg=8, rz=0.0):
    ca, sa = math.cos(rz), math.sin(rz); o = len(V)
    def P(px, py, pz): return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)
    for j in range(sg):
        a = 2 * math.pi * j / sg; P0 = P(r * math.cos(a), r * math.sin(a), 0); V.append(P0)
    for j in range(sg):
        a = 2 * math.pi * j / sg; P1 = P(r * math.cos(a), r * math.sin(a), h); V.append(P1)
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o + j, o + j2, o + sg + j2, o + sg + j)); M.append(mi)
    t = len(V); V.append(P(0, 0, h)); b = len(V); V.append(P(0, 0, 0))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((t, o + sg + j, o + sg + j2)); M.append(mi)
        F.append((b, o + j2, o + j)); M.append(mi)

def add_cone(V, F, M, cx, cy, cz, rb, h, mi, sg=8, rz=0.0):
    ca, sa = math.cos(rz), math.sin(rz); o = len(V)
    def P(px, py, pz): return (cx + (px * ca - py * sa), cy + (px * sa + py * ca), cz + pz)
    ap = P(0, 0, h)
    for j in range(sg):
        a = 2 * math.pi * j / sg; V.append(P(rb * math.cos(a), rb * math.sin(a), 0))
    apx = len(V); V.append(ap); bc = len(V); V.append(P(0, 0, 0))
    for j in range(sg):
        j2 = (j + 1) % sg; F.append((o + j, o + j2, apx)); M.append(mi)
        F.append((bc, o + j2, o + j)); M.append(mi)

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

def add_prism(V, F, M, pts, thick, cx, cy, cz, rz, mi, plane="xy"):
    """thin double-sided slab from a 2D polygon. plane 'xy' lies flat, 'xz' stands up facing ±Y."""
    n = len(pts); hz = thick / 2; ca, sa = math.cos(rz), math.sin(rz); o = len(V)
    for off in (-hz, hz):
        for (a, b) in pts:
            if plane == "xy": lx, ly, lz = a, b, off
            else:             lx, ly, lz = a, off, b   # xz: extrude along Y
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

def finish(name, V, F, mb, M):
    ob = newobj("House", V, F, mb.mats, fm=M)
    recalc(ob)
    return ob

def export(name):
    for ob in bpy.data.objects: ob.select_set(ob.type == "MESH")
    bpy.context.view_layer.objects.active = bpy.data.objects.get("House") or bpy.context.selected_objects[0]
    path = os.path.join(OUT, name)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True)
    print("exported ->", path, os.path.getsize(path), "bytes")

# --------------------------------------------------------------------------- #
#  shared detail bits                                                          #
# --------------------------------------------------------------------------- #
def cham(w, d, c):  # 倒角矩形足迹(8 点),柔化墙体四角(去生硬方块感)
    hw, hd = w / 2, d / 2
    return [(-hw + c, -hd), (hw - c, -hd), (hw, -hd + c), (hw, hd - c),
            (hw - c, hd), (-hw + c, hd), (-hw, hd - c), (-hw, -hd + c)]

def add_vprism(V, F, M, pts, cx, cy, cz, h, mi, rz=0.0):  # 2D 足迹竖直拉伸(柔角墙/柱)
    n = len(pts); ca, sa = math.cos(rz), math.sin(rz); o = len(V)
    for (px, py) in pts:
        V.append((cx + px * ca - py * sa, cy + px * sa + py * ca, cz))
    for (px, py) in pts:
        V.append((cx + px * ca - py * sa, cy + px * sa + py * ca, cz + h))
    F.append(tuple(o + i for i in range(n - 1, -1, -1))); M.append(mi)   # bottom
    F.append(tuple(o + n + i for i in range(n))); M.append(mi)           # top
    for i in range(n):
        j = (i + 1) % n; F.append((o + i, o + j, o + n + j, o + n + i)); M.append(mi)

def add_wall(V, F, M, cx, cy, cz, w, d, h, mi, c=0.3, rz=0.0):  # 柔角墙体
    add_vprism(V, F, M, cham(w, d, c), cx, cy, cz, h, mi, rz)

def roof_trim(V, F, M, cx, cy, cz, w, d, rh, mi, oh=0.35):  # 挑檐板(两长檐) + 屋脊压顶
    rd = d / 2 + oh
    add_box(V, F, M, cx, cy - rd, cz, w + 2 * oh + 0.12, 0.14, 0.24, mi)
    add_box(V, F, M, cx, cy + rd, cz, w + 2 * oh + 0.12, 0.14, 0.24, mi)
    add_box(V, F, M, cx, cy, cz + rh - 0.05, w + 2 * oh, 0.34, 0.16, mi)  # ridge cap

def door(V, F, M, cx, dy, mi_door, mi_frame, w=0.9, h=1.7):
    add_box(V, F, M, cx, dy + 0.06, 0, w + 0.2, 0.12, h + 0.2, mi_frame)   # thicker frame
    add_box(V, F, M, cx, dy + 0.13, 0, w, 0.08, h, mi_door)               # leaf
    add_box(V, F, M, cx, dy + 0.15, h * 0.52, w, 0.05, 0.05, mi_frame)    # cross rail
    add_ball(V, F, M, cx + w * 0.3, dy + 0.19, h * 0.45, 0.055, mi_frame, 6, 3)  # handle
    add_box(V, F, M, cx, dy + 0.36, 0, w + 0.5, 0.55, 0.13, mi_frame)     # threshold step

def window(V, F, M, cx, dy, cz, mi_glow, mi_frame, w=0.9, h=0.9):
    add_box(V, F, M, cx, dy + 0.05, cz, w + 0.2, 0.1, h + 0.2, mi_frame)   # frame
    add_box(V, F, M, cx, dy + 0.11, cz, w, 0.06, h, mi_glow)               # glowing pane
    add_box(V, F, M, cx, dy + 0.14, cz, 0.05, 0.04, h, mi_frame)           # muntin v
    add_box(V, F, M, cx, dy + 0.14, cz + h / 2, w, 0.04, 0.05, mi_frame)   # muntin h
    add_box(V, F, M, cx, dy + 0.13, cz - h / 2 - 0.13, w + 0.36, 0.22, 0.1, mi_frame)  # sill ledge
    add_box(V, F, M, cx, dy + 0.1, cz + h / 2 + 0.15, w + 0.32, 0.16, 0.1, mi_frame)   # lintel
    for sx in (-(w / 2 + 0.2), (w / 2 + 0.2)):                             # shutters
        add_box(V, F, M, cx + sx, dy + 0.1, cz, 0.16, 0.06, h + 0.08, mi_frame)

def flowerbox(V, F, M, cx, dy, cz, mi_wood, cols):
    add_box(V, F, M, cx, dy + 0.18, cz, 1.0, 0.22, 0.18, mi_wood)
    seed = int((cx * 7 + cz * 13)) % len(cols)
    for k in range(4):
        add_ball(V, F, M, cx - 0.36 + k * 0.24, dy + 0.24, cz + 0.2, 0.11, cols[(seed + k) % len(cols)], 6, 3)

def hang_lantern(V, F, M, cx, cy, cz, mi_wood, mi_glow):
    add_box(V, F, M, cx, cy, cz, 0.04, 0.04, 0.3, mi_wood)        # short bracket drop
    add_ball(V, F, M, cx, cy, cz - 0.18, 0.12, mi_glow, 7, 4, sz=1.15)

def chimney(V, F, M, cx, cy, cz, mi, w=0.5, h=1.1):
    add_box(V, F, M, cx, cy, cz, w, w, h, mi)                              # stack
    add_box(V, F, M, cx, cy, cz + h, w + 0.16, w + 0.16, 0.18, mi)         # cap
    add_cyl(V, F, M, cx - w * 0.2, cy, cz + h + 0.18, 0.09, 0.22, mi, 8)   # pot
    add_cyl(V, F, M, cx + w * 0.2, cy, cz + h + 0.18, 0.09, 0.22, mi, 8)   # pot 2

def stone_base(V, F, M, w, d, mi, h=0.45):
    add_box(V, F, M, 0, 0, 0, w + 0.2, d + 0.2, h, mi)                     # base
    add_box(V, F, M, 0, 0, h - 0.02, w + 0.34, d + 0.34, 0.1, mi)          # water-table ledge

# --------------------------------------------------------------------------- #
#  the eight houses                                                            #
# --------------------------------------------------------------------------- #
def build_cottage():  # ① storybook fisher's cottage
    reset(); mb = MB()
    WALL = mb.add("Wall", "#f0e6d2"); ROOF = mb.add("Roof", "#c8744f"); WOOD = mb.add("Wood", "#9c6b43")
    DOOR = mb.add("Door", "#5f8f8a"); STONE = mb.add("Stone", "#9aa0ab")
    GLOW = mb.add("Emissive_Window", "#ffd9a0", emit="#ffe9c4", es=2.6)
    LAMP = mb.add("Emissive_Lantern", "#ffcf86", emit="#ffd99a", es=3.2)
    FA = mb.add("FlowerA", "#f2a3c0"); FB = mb.add("FlowerB", "#f6cf6f"); FC = mb.add("FlowerC", "#d7c2ef")
    V, F, M = [], [], []
    stone_base(V, F, M, 5.0, 4.4, STONE, 0.4)
    add_wall(V, F, M, 0, 0, 0.4, 5.0, 4.4, 3.0, WALL, 0.34)
    add_gable(V, F, M, 0, 0, 3.4, 5.0, 4.4, 1.7, ROOF, oh=0.4)
    roof_trim(V, F, M, 0, 0, 3.4, 5.0, 4.4, 1.7, WOOD, oh=0.4)
    chimney(V, F, M, -1.6, -0.7, 3.6, STONE, 0.46, 1.3)
    door(V, F, M, 0.0, 2.2, DOOR, WOOD, 0.95, 1.85)
    window(V, F, M, -1.6, 2.2, 2.05, GLOW, WOOD, 0.9, 0.95)
    window(V, F, M, 1.6, 2.2, 2.05, GLOW, WOOD, 0.9, 0.95)
    flowerbox(V, F, M, -1.6, 2.2, 1.45, WOOD, [FA, FB, FC])
    flowerbox(V, F, M, 1.6, 2.2, 1.45, WOOD, [FB, FA, FC])
    hang_lantern(V, F, M, 0.8, 2.5, 3.2, WOOD, LAMP)
    finish("House", V, F, mb, M); export("xy_house_cottage.glb")

def build_loft():  # ② storybook two-story loft w/ sea-facing balcony
    reset(); mb = MB()
    WALL = mb.add("Wall", "#ecdcc0"); PLANK = mb.add("Trim", "#caa878"); ROOF = mb.add("Roof", "#4fa6a0")
    WOOD = mb.add("Wood", "#7a5a3e"); DOOR = mb.add("Door", "#b3623f"); STONE = mb.add("Stone", "#9aa0ab")
    GLOW = mb.add("Emissive_Window", "#ffd9a0", emit="#ffe9c4", es=2.6)
    V, F, M = [], [], []
    stone_base(V, F, M, 4.4, 4.4, STONE, 0.4)
    add_wall(V, F, M, 0, 0, 0.4, 4.4, 4.4, 3.0, WALL, 0.32)            # ground floor
    add_wall(V, F, M, 0, 0, 3.4, 4.2, 4.2, 2.6, PLANK, 0.3)           # upper plank floor
    add_gable(V, F, M, 0, 0, 6.0, 4.4, 4.4, 1.5, ROOF, oh=0.4)
    roof_trim(V, F, M, 0, 0, 6.0, 4.4, 4.4, 1.5, WOOD, oh=0.4)
    add_gable(V, F, M, 0, 2.0, 4.7, 1.4, 1.2, 0.6, ROOF, oh=0.15)  # dormer
    door(V, F, M, 0.0, 2.2, DOOR, WOOD, 0.95, 1.85)
    window(V, F, M, -1.3, 2.2, 2.0, GLOW, WOOD, 0.8, 0.9)
    window(V, F, M, 1.3, 2.2, 2.0, GLOW, WOOD, 0.8, 0.9)
    window(V, F, M, 0.0, 2.1, 4.65, GLOW, WOOD, 0.8, 0.8)      # dormer window
    # balcony (upper, sea-facing +Y)
    add_box(V, F, M, 0, 2.35, 3.4, 3.0, 0.9, 0.16, WOOD)
    for bx in (-1.4, -0.7, 0.0, 0.7, 1.4):
        add_box(V, F, M, bx, 2.78, 3.56, 0.1, 0.1, 0.7, WOOD)
    add_box(V, F, M, 0, 2.78, 4.2, 3.0, 0.12, 0.1, WOOD)       # top rail
    finish("House", V, F, mb, M); export("xy_house_loft.glb")

def build_round():  # ③ 地中海 white round tower w/ blue dome
    reset(); mb = MB()
    WALL = mb.add("Wall", "#f4efe6"); ROOF = mb.add("Roof", "#3f7bc4"); WOOD = mb.add("Wood", "#8a6a46")
    DOOR = mb.add("Door", "#2f6fb0"); STONE = mb.add("Stone", "#b9b0a0")
    GLOW = mb.add("Emissive_Window", "#ffe1ad", emit="#ffe9c4", es=2.4)
    V, F, M = [], [], []
    add_cyl(V, F, M, 0, 0, 0, 2.3, 0.4, STONE, 20)            # stone base ring
    add_cyl(V, F, M, 0, 0, 0.4, 2.16, 0.16, STONE, 20)        # base molding ring
    add_cyl(V, F, M, 0, 0, 0.4, 2.1, 3.6, WALL, 20)           # white drum (smoother)
    add_cyl(V, F, M, 0, 0, 3.82, 2.3, 0.2, WOOD, 20)          # cornice ring under roof
    add_cone(V, F, M, 0, 0, 4.0, 2.4, 1.7, ROOF, 22)          # blue conical roof
    add_ball(V, F, M, 0, 0, 5.6, 0.2, ROOF, 8, 5)            # finial
    # arched door (box + half-ball top) on +Y
    add_box(V, F, M, 0, 2.0, 0.4, 1.0, 0.18, 1.6, DOOR)
    add_ball(V, F, M, 0, 2.05, 2.0, 0.52, DOOR, 10, 4, sz=0.7)
    # 2 small windows on the front (+Y) + 2 round portholes on the sides
    window(V, F, M, -0.95, 1.78, 2.5, GLOW, WOOD, 0.5, 0.6)
    window(V, F, M, 0.95, 1.78, 2.5, GLOW, WOOD, 0.5, 0.6)
    for sx in (-2.0, 2.0):
        add_ball(V, F, M, sx, 0.0, 2.4, 0.3, GLOW, 8, 4, sz=0.9)
    finish("House", V, F, mb, M); export("xy_house_round.glb")

def build_shop():  # ④ storybook seaside store w/ striped awning + sign
    reset(); mb = MB()
    WALL = mb.add("Wall", "#efe4ce"); ROOF = mb.add("Roof", "#b3623f"); WOOD = mb.add("Wood", "#8a6038")
    AWN_A = mb.add("Awning", "#e8826a"); AWN_B = mb.add("AwningB", "#f3ece0"); STONE = mb.add("Stone", "#9aa0ab")
    GLOW = mb.add("Emissive_Window", "#ffd9a0", emit="#ffe9c4", es=2.6)
    SIGN = mb.add("Emissive_Sign", "#fff0c0", emit="#ffe9a8", es=2.8)
    CRATE = mb.add("Crate", "#b98a52"); BARREL = mb.add("Barrel", "#8a6038")
    V, F, M = [], [], []
    stone_base(V, F, M, 6.0, 4.6, STONE, 0.35)
    add_wall(V, F, M, 0, 0, 0.35, 6.0, 4.6, 3.0, WALL, 0.34)
    add_gable(V, F, M, 0, 0, 3.35, 6.0, 4.6, 1.4, ROOF, oh=0.45)
    roof_trim(V, F, M, 0, 0, 3.35, 6.0, 4.6, 1.4, WOOD, oh=0.45)
    # open shopfront: big glowing window + counter on +Y
    add_box(V, F, M, -1.2, 2.2, 1.0, 2.4, 0.12, 2.0, GLOW)
    add_box(V, F, M, -1.2, 2.45, 0.35, 2.6, 0.5, 1.0, WOOD)          # counter
    door(V, F, M, 1.7, 2.2, WOOD, WOOD, 0.9, 1.85)
    # striped awning over the front (base slab + alternating stripes proud of it)
    add_box(V, F, M, -1.0, 2.9, 2.5, 4.0, 1.2, 0.12, AWN_A)
    for sx in (-2.6, -1.6, -0.6, 0.4, 1.4):
        add_box(V, F, M, sx, 2.9, 2.54, 0.5, 1.2, 0.1, AWN_B)
    # hanging sign
    add_box(V, F, M, 2.6, 2.4, 2.7, 0.08, 0.6, 0.5, WOOD)
    add_box(V, F, M, 2.6, 2.75, 2.1, 0.9, 0.1, 0.5, SIGN)
    # crates + barrel by the door
    add_box(V, F, M, 2.4, 2.9, 0.35, 0.6, 0.6, 0.6, CRATE)
    add_box(V, F, M, 2.4, 2.9, 0.95, 0.5, 0.5, 0.5, CRATE)
    add_cyl(V, F, M, 1.2, 3.1, 0.35, 0.34, 0.8, BARREL, 10)
    finish("House", V, F, mb, M); export("xy_house_shop.glb")

def build_cafe():  # ⑤ cliff café / tea house w/ deck terrace + string lights
    reset(); mb = MB()
    WALL = mb.add("Wall", "#f1e7d3"); ROOF = mb.add("Roof", "#4fa6a0"); WOOD = mb.add("Wood", "#8a6038")
    DECK = mb.add("Trim", "#b08a5a"); DOOR = mb.add("Door", "#c8744f"); STONE = mb.add("Stone", "#9aa0ab")
    GLOW = mb.add("Emissive_Window", "#ffd9a0", emit="#ffe9c4", es=2.6)
    LAMP = mb.add("Emissive_Lantern", "#ffd58c", emit="#ffd99a", es=3.4)
    CHAIR = mb.add("Chair", "#7a9c8e"); TABLE = mb.add("Table", "#caa878")
    V, F, M = [], [], []
    stone_base(V, F, M, 5.0, 4.0, STONE, 0.4)
    add_wall(V, F, M, 0, -0.6, 0.4, 5.0, 3.2, 2.9, WALL, 0.32)
    add_gable(V, F, M, 0, -0.6, 3.3, 5.0, 3.2, 1.3, ROOF, oh=0.4)
    roof_trim(V, F, M, 0, -0.6, 3.3, 5.0, 3.2, 1.3, WOOD, oh=0.4)
    add_box(V, F, M, -1.2, 1.05, 1.0, 2.2, 0.12, 1.9, GLOW)        # big window
    door(V, F, M, 1.4, 1.05, DOOR, WOOD, 0.9, 1.8)
    # deck terrace out front (+Y)
    add_box(V, F, M, 0, 2.8, 0.3, 5.0, 3.2, 0.16, DECK)
    for (tx, ty) in ((-1.4, 2.6), (1.4, 3.0)):
        add_cyl(V, F, M, tx, ty, 0.46, 0.1, 0.7, WOOD, 6)          # table leg
        add_cyl(V, F, M, tx, ty, 1.16, 0.45, 0.1, TABLE, 12)       # table top
        for ox in (-0.62, 0.62):                                   # a chair each side
            add_box(V, F, M, tx + ox, ty, 0.46, 0.38, 0.38, 0.46, CHAIR)   # seat block
            back_x = tx + ox + (0.2 if ox > 0 else -0.2)           # backrest on the outer edge
            add_box(V, F, M, back_x, ty, 0.92, 0.07, 0.38, 0.5, CHAIR)
    # string of warm lights along the eave
    for k in range(6):
        add_ball(V, F, M, -2.0 + k * 0.8, 2.9, 2.3 - 0.12 * math.sin(k), 0.09, LAMP, 6, 3)
    finish("House", V, F, mb, M); export("xy_house_cafe.glb")

def build_lightkeeper():  # ⑥ lightkeeper's hut (matches the lighthouse)
    reset(); mb = MB()
    WALL = mb.add("Wall", "#f4f1ec"); BAND = mb.add("Trim", "#c0473e"); ROOF = mb.add("Roof", "#48515c")
    WOOD = mb.add("Wood", "#8a6038"); DOOR = mb.add("Door", "#c0473e"); STONE = mb.add("Stone", "#9aa0ab")
    GLOW = mb.add("Emissive_Window", "#ffd9a0", emit="#ffe9c4", es=2.6)
    V, F, M = [], [], []
    stone_base(V, F, M, 4.0, 3.6, STONE, 0.4)
    add_wall(V, F, M, 0, 0, 0.4, 4.0, 3.6, 2.6, WALL, 0.3)
    add_wall(V, F, M, 0, 0, 1.7, 4.04, 3.64, 0.45, BAND, 0.3)      # red band (chamfered ring)
    add_gable(V, F, M, 0, 0, 3.0, 4.0, 3.6, 1.3, ROOF, oh=0.35)
    roof_trim(V, F, M, 0, 0, 3.0, 4.0, 3.6, 1.3, WOOD, oh=0.35)
    chimney(V, F, M, 1.3, -0.6, 3.2, STONE, 0.42, 1.0)
    door(V, F, M, 0.0, 1.8, DOOR, WOOD, 0.9, 1.8)
    window(V, F, M, -1.3, 1.8, 1.9, GLOW, WOOD, 0.8, 0.85)
    window(V, F, M, 1.3, 1.8, 1.9, GLOW, WOOD, 0.8, 0.85)
    # low stone garden wall out front
    add_box(V, F, M, 0, 3.2, 0, 4.6, 0.3, 0.7, STONE)
    finish("House", V, F, mb, M); export("xy_house_lightkeeper.glb")

def build_machiya():  # ⑦ 和风 machiya: wood + grey tile roof + lattice + noren
    reset(); mb = MB()
    WALL = mb.add("Wall", "#e9ddc6"); WOOD = mb.add("Wood", "#6f5235"); WOODD = mb.add("Trim", "#4f3b25")
    ROOF = mb.add("Roof", "#5a6470"); STONE = mb.add("Stone", "#9aa0ab")
    GLOW = mb.add("Emissive_Window", "#ffe1ad", emit="#ffe9c4", es=2.2)
    NOREN = mb.add("Door", "#3f7b8f"); LAMP = mb.add("Emissive_Lantern", "#ffcf86", emit="#ffd99a", es=3.0)
    V, F, M = [], [], []
    stone_base(V, F, M, 5.2, 4.0, STONE, 0.3)
    add_wall(V, F, M, 0, 0, 0.3, 5.2, 4.0, 2.7, WALL, 0.3)
    add_wall(V, F, M, 0, 0, 0.3, 5.24, 4.04, 0.5, WOODD, 0.3)     # dark base trim
    # low-pitch tile roof (gentle) + thick eave fascia
    add_gable(V, F, M, 0, 0, 3.0, 5.2, 4.0, 1.0, ROOF, oh=0.6)
    add_box(V, F, M, 0, 0, 3.95, 5.4, 0.42, 0.18, WOODD)         # ridge cap (鬼瓦感)
    add_box(V, F, M, 0, 2.6, 2.9, 5.6, 0.18, 0.3, WOODD)          # eave fascia +Y
    add_box(V, F, M, 0, -2.6, 2.9, 5.6, 0.18, 0.3, WOODD)
    # lattice (障子) windows: glow pane + wood grid posts
    for cx in (-1.5, 1.5):
        add_box(V, F, M, cx, 2.0, 1.1, 1.4, 0.1, 1.3, GLOW)
        for gx in (-0.45, 0.0, 0.45):
            add_box(V, F, M, cx + gx, 2.07, 1.1, 0.06, 0.05, 1.3, WOOD)
        add_box(V, F, M, cx, 2.07, 1.75, 1.4, 0.05, 0.06, WOOD)
        add_box(V, F, M, cx, 2.07, 1.1, 1.4, 0.05, 0.06, WOOD)
    # noren (暖帘) over the door (hanging cloth = thin standing slab on +Y)
    add_box(V, F, M, 0, 2.05, 1.2, 1.2, 0.06, 1.0, NOREN)
    add_box(V, F, M, 0, 2.0, 0.3, 1.0, 0.12, 1.0, WOODD)          # door recess
    # corner posts
    for (px, py) in ((-2.55, 1.95), (2.55, 1.95)):
        add_box(V, F, M, px, py, 0.3, 0.2, 0.2, 2.7, WOOD)
    # a hanging paper lantern by the door
    hang_lantern(V, F, M, 1.4, 2.4, 2.6, WOOD, LAMP)
    finish("House", V, F, mb, M); export("xy_house_machiya.glb")

def build_villa():  # ⑧ 地中海 villa: white walls + blue shutters + small dome + bougainvillea
    reset(); mb = MB()
    WALL = mb.add("Wall", "#f5f0e7"); ROOF = mb.add("Roof", "#e7decb"); SHUT = mb.add("Trim", "#2f6fb0")
    WOOD = mb.add("Wood", "#8a6a46"); DOOR = mb.add("Door", "#2f6fb0"); STONE = mb.add("Stone", "#cbbfa8")
    DOME = mb.add("Dome", "#3f7bc4")
    GLOW = mb.add("Emissive_Window", "#ffe1ad", emit="#ffe9c4", es=2.3)
    FA = mb.add("FlowerA", "#d6457f"); FB = mb.add("FlowerB", "#e86fa0")
    V, F, M = [], [], []
    stone_base(V, F, M, 5.4, 5.0, STONE, 0.4)
    add_wall(V, F, M, 0, 0, 0.4, 5.4, 5.0, 3.2, WALL, 0.36)
    add_box(V, F, M, 0, 0, 3.52, 5.62, 5.22, 0.14, ROOF)          # cornice ledge
    add_box(V, F, M, 0, 0, 3.6, 5.4, 5.0, 0.35, ROOF)             # flat parapet roof
    add_box(V, F, M, 0, 0, 3.95, 4.4, 4.0, 0.3, WALL)             # roof terrace wall
    add_ball(V, F, M, -1.3, -1.0, 3.95, 1.0, DOME, 12, 6, sz=0.85)  # small blue dome
    # arched door + blue shutters
    add_box(V, F, M, 0, 2.5, 0.4, 1.1, 0.18, 1.9, DOOR)
    add_ball(V, F, M, 0, 2.55, 2.3, 0.58, DOOR, 10, 4, sz=0.7)
    for cx in (-1.7, 1.7):
        add_box(V, F, M, cx, 2.5, 1.9, 1.0, 0.1, 1.1, GLOW)
        add_box(V, F, M, cx - 0.6, 2.56, 1.9, 0.18, 0.06, 1.1, SHUT)   # shutters
        add_box(V, F, M, cx + 0.6, 2.56, 1.9, 0.18, 0.06, 1.1, SHUT)
    # bougainvillea spilling over the door
    for (bx, bz, r) in ((-0.7, 2.8, 0.3), (0.0, 3.0, 0.34), (0.7, 2.8, 0.3), (0.4, 2.6, 0.24)):
        add_ball(V, F, M, bx, 2.55, bz, r, FA if (bx < 0) else FB, 7, 4)
    finish("House", V, F, mb, M); export("xy_house_villa.glb")

# --------------------------------------------------------------------------- #
#  headless showcase render (re-import all, grid, workbench)                   #
# --------------------------------------------------------------------------- #
def showcase(files):
    try:
        reset()
        cols = 4
        for i, fn in enumerate(files):
            p = os.path.join(OUT, fn)
            if not os.path.exists(p): continue
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=p)
            gx = (i % cols) * 7 - (cols - 1) * 3.5; gy = -(i // cols) * 7
            for ob in (set(bpy.data.objects) - before):
                if ob.parent is None: ob.location.x += gx; ob.location.y += gy
        rows = (len(files) + cols - 1) // cols
        sc = bpy.context.scene
        cam_d = bpy.data.cameras.new("Cam"); cam_d.lens = 30
        cam = bpy.data.objects.new("Cam", cam_d); bpy.context.collection.objects.link(cam)
        cy = -(rows - 1) * 3.5
        cam.location = (22, 24, 15)                      # +X / +Y corner so facades (+Y) face the camera
        from mathutils import Vector
        cam.rotation_euler = (Vector((-1, cy, 2.8)) - Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam
        sun_d = bpy.data.lights.new("Sun", "SUN"); sun_d.energy = 3.0
        sun = bpy.data.objects.new("Sun", sun_d); bpy.context.collection.objects.link(sun)
        sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(40))
        sc.render.engine = "BLENDER_WORKBENCH"
        sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "MATERIAL"
        sc.display.shading.show_shadows = True
        sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
        sc.render.filepath = "/tmp/xy_houses_preview.png"
        bpy.ops.render.render(write_still=True)
        print("preview ->", sc.render.filepath)
    except Exception as e:
        print("showcase render skipped:", e)

FILES = ["xy_house_cottage.glb", "xy_house_loft.glb", "xy_house_round.glb", "xy_house_shop.glb",
         "xy_house_cafe.glb", "xy_house_lightkeeper.glb", "xy_house_machiya.glb", "xy_house_villa.glb"]

if __name__ == "__main__":
    build_cottage(); build_loft(); build_round(); build_shop()
    build_cafe(); build_lightkeeper(); build_machiya(); build_villa()
    showcase(FILES)
    print("ALL HOUSES DONE ->", OUT)
