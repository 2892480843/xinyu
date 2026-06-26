# -*- coding: utf-8 -*-
"""
Xinyu protagonist action pack.

Pipeline:
  1. Generate the base model with blender/xy_protagonist.py when the mesh changes.
  2. Run this script to add reusable NLA animation clips to xy_char_protagonist.glb.

Run:
  blender --background --python blender/xy_protagonist_actions.py

Output:
  frontend/public/models/xy_char_protagonist.glb
"""

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "frontend" / "public" / "models" / "xy_char_protagonist.glb"
CLIPS = ["WalkLoop", "Jump", "Wave", "Flute", "Sit"]


def r(deg: float) -> float:
    return math.radians(deg)


def obj(name: str):
    return bpy.data.objects.get(name)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model():
    bpy.ops.import_scene.gltf(filepath=str(MODEL))


def clear_old_tracks():
    for ob in bpy.context.scene.objects:
        if not ob.animation_data:
            continue
        for track in list(ob.animation_data.nla_tracks):
            if track.name in CLIPS:
                ob.animation_data.nla_tracks.remove(track)
        ob.animation_data.action = None

    for action in list(bpy.data.actions):
        if any(action.name == clip or action.name.startswith(f"{clip}_") for clip in CLIPS):
            bpy.data.actions.remove(action)


def material(name: str, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = 0.82
    return mat


def local_parent(parent, child, location, rotation=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)):
    child.parent = parent
    child.matrix_parent_inverse.identity()
    child.location = location
    child.rotation_mode = "XYZ"
    child.rotation_euler = rotation
    child.scale = scale
    return child


def ensure_flute_prop():
    existing = obj("Prop_Flute")
    if existing:
        existing.scale = (0.0, 0.0, 0.0)
        return existing

    body = obj("Body")
    if not body:
        raise RuntimeError("Body node not found; run xy_protagonist.py before adding actions.")

    flute = bpy.data.objects.new("Prop_Flute", None)
    bpy.context.collection.objects.link(flute)
    local_parent(body, flute, (0.0, 0.22, 1.84), rotation=(0.0, 0.0, 0.0), scale=(0.0, 0.0, 0.0))

    bamboo = material("Flute_Bamboo", (0.78, 0.60, 0.32, 1.0))
    band = material("Flute_Band", (0.22, 0.15, 0.08, 1.0))
    tassel = material("Flute_Tassel", (0.82, 0.12, 0.10, 1.0))

    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.018, depth=0.56)
    body_mesh = bpy.context.object
    body_mesh.name = "Flute_Body"
    body_mesh.data.materials.append(bamboo)
    local_parent(flute, body_mesh, (0.0, 0.0, 0.0), rotation=(0.0, r(90), 0.0))

    for i, x in enumerate((-0.21, 0.21)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.0205, depth=0.028)
        ring = bpy.context.object
        ring.name = f"Flute_Ring_{i + 1}"
        ring.data.materials.append(band)
        local_parent(flute, ring, (x, 0.0, 0.0), rotation=(0.0, r(90), 0.0))

    for i, x in enumerate((-0.10, -0.02, 0.07, 0.16)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.0065, depth=0.006)
        hole = bpy.context.object
        hole.name = f"Flute_Hole_{i + 1}"
        hole.data.materials.append(band)
        local_parent(flute, hole, (x, 0.020, 0.0), rotation=(r(90), 0.0, 0.0), scale=(1.0, 1.0, 0.45))

    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.020, radius2=0.004, depth=0.14)
    tail = bpy.context.object
    tail.name = "Flute_Tassel"
    tail.data.materials.append(tassel)
    local_parent(flute, tail, (0.30, -0.045, -0.055), rotation=(r(8), 0.0, r(12)))

    return flute


def keyed_action(ob, clip: str, end: int, keys):
    if not ob:
        return

    ob.rotation_mode = "XYZ"
    base_loc = ob.location.copy()
    base_rot = ob.rotation_euler.copy()
    base_scale = ob.scale.copy()

    ob.animation_data_create()
    action = bpy.data.actions.new(f"{clip}_{ob.name}")
    action.frame_range = (1, end)
    ob.animation_data.action = action

    for frame, spec in keys:
        loc = spec.get("loc", (0.0, 0.0, 0.0))
        rot = spec.get("rot", (0.0, 0.0, 0.0))
        scale = spec.get("scale", (1.0, 1.0, 1.0))

        if "loc_abs" in spec:
            ob.location = spec["loc_abs"]
        else:
            ob.location = (
                base_loc.x + loc[0],
                base_loc.y + loc[1],
                base_loc.z + loc[2],
            )

        ob.rotation_euler = (
            base_rot.x + rot[0],
            base_rot.y + rot[1],
            base_rot.z + rot[2],
        )

        if "scale_abs" in spec:
            ob.scale = spec["scale_abs"]
        else:
            ob.scale = (
                base_scale.x * scale[0],
                base_scale.y * scale[1],
                base_scale.z * scale[2],
            )

        ob.keyframe_insert("location", frame=frame)
        ob.keyframe_insert("rotation_euler", frame=frame)
        ob.keyframe_insert("scale", frame=frame)

    track = ob.animation_data.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 1, action)
    strip.name = clip
    strip.frame_start = 1
    strip.frame_end = end

    ob.animation_data.action = None
    ob.location = base_loc
    ob.rotation_euler = base_rot
    ob.scale = base_scale


def add_walk_loop():
    end = 33
    body_keys = [
        (1, {"loc": (0, 0, 0), "rot": (0, 0, 0)}),
        (9, {"loc": (0, 0, 0.045), "rot": (r(1.2), 0, r(2.0))}),
        (17, {"loc": (0, 0, 0.0), "rot": (0, 0, 0)}),
        (25, {"loc": (0, 0, 0.045), "rot": (r(1.2), 0, r(-2.0))}),
        (33, {"loc": (0, 0, 0), "rot": (0, 0, 0)}),
    ]
    keyed_action(obj("Body"), "WalkLoop", end, body_keys)
    keyed_action(obj("LegL"), "WalkLoop", end, [(1, {"rot": (r(28), 0, 0)}), (9, {"rot": (0, 0, 0)}), (17, {"rot": (r(-30), 0, 0)}), (25, {"rot": (0, 0, 0)}), (33, {"rot": (r(28), 0, 0)})])
    keyed_action(obj("LegR"), "WalkLoop", end, [(1, {"rot": (r(-30), 0, 0)}), (9, {"rot": (0, 0, 0)}), (17, {"rot": (r(28), 0, 0)}), (25, {"rot": (0, 0, 0)}), (33, {"rot": (r(-30), 0, 0)})])
    keyed_action(obj("ShinL"), "WalkLoop", end, [(1, {"rot": (r(8), 0, 0)}), (9, {"rot": (r(38), 0, 0)}), (17, {"rot": (r(12), 0, 0)}), (25, {"rot": (r(18), 0, 0)}), (33, {"rot": (r(8), 0, 0)})])
    keyed_action(obj("ShinR"), "WalkLoop", end, [(1, {"rot": (r(12), 0, 0)}), (9, {"rot": (r(18), 0, 0)}), (17, {"rot": (r(8), 0, 0)}), (25, {"rot": (r(38), 0, 0)}), (33, {"rot": (r(12), 0, 0)})])
    keyed_action(obj("ArmL"), "WalkLoop", end, [(1, {"rot": (r(-22), 0, r(5))}), (9, {"rot": (r(8), 0, r(6))}), (17, {"rot": (r(24), 0, r(5))}), (25, {"rot": (r(8), 0, r(6))}), (33, {"rot": (r(-22), 0, r(5))})])
    keyed_action(obj("ArmR"), "WalkLoop", end, [(1, {"rot": (r(24), 0, r(-5))}), (9, {"rot": (r(8), 0, r(-6))}), (17, {"rot": (r(-22), 0, r(-5))}), (25, {"rot": (r(8), 0, r(-6))}), (33, {"rot": (r(24), 0, r(-5))})])
    keyed_action(obj("ForeArmL"), "WalkLoop", end, [(1, {"rot": (r(-34), 0, 0)}), (9, {"rot": (r(-26), 0, 0)}), (17, {"rot": (r(-42), 0, 0)}), (25, {"rot": (r(-28), 0, 0)}), (33, {"rot": (r(-34), 0, 0)})])
    keyed_action(obj("ForeArmR"), "WalkLoop", end, [(1, {"rot": (r(-42), 0, 0)}), (9, {"rot": (r(-28), 0, 0)}), (17, {"rot": (r(-34), 0, 0)}), (25, {"rot": (r(-26), 0, 0)}), (33, {"rot": (r(-42), 0, 0)})])
    keyed_action(obj("Cape"), "WalkLoop", end, [(1, {"rot": (r(-7), 0, 0)}), (9, {"rot": (r(-13), 0, r(2))}), (17, {"rot": (r(-8), 0, 0)}), (25, {"rot": (r(-13), 0, r(-2))}), (33, {"rot": (r(-7), 0, 0)})])


def add_jump():
    end = 56
    keyed_action(obj("Body"), "Jump", end, [
        (1, {"loc": (0, 0, 0), "scale": (1, 1, 1)}),
        (8, {"loc": (0, 0, -0.08), "scale": (1.08, 0.92, 1.08)}),
        (16, {"loc": (0, 0, 0.18), "scale": (0.96, 1.08, 0.96)}),
        (30, {"loc": (0, 0, 0.48), "rot": (r(-3), 0, 0)}),
        (42, {"loc": (0, 0, 0.18), "rot": (r(3), 0, 0)}),
        (50, {"loc": (0, 0, -0.055), "scale": (1.10, 0.90, 1.10)}),
        (56, {"loc": (0, 0, 0), "scale": (1, 1, 1)}),
    ])
    for name, side in [("LegL", -1), ("LegR", 1)]:
        keyed_action(obj(name), "Jump", end, [(1, {"rot": (0, 0, 0)}), (8, {"rot": (r(24), 0, 0)}), (16, {"rot": (r(-34 - side * 8), 0, 0)}), (30, {"rot": (r(-58 - side * 8), 0, 0)}), (42, {"rot": (r(-18), 0, 0)}), (50, {"rot": (r(18), 0, 0)}), (56, {"rot": (0, 0, 0)})])
    for name, side in [("ShinL", -1), ("ShinR", 1)]:
        keyed_action(obj(name), "Jump", end, [(1, {"rot": (r(5), 0, 0)}), (8, {"rot": (r(42), 0, 0)}), (16, {"rot": (r(62), 0, 0)}), (30, {"rot": (r(78 + side * 8), 0, 0)}), (42, {"rot": (r(44), 0, 0)}), (50, {"rot": (r(28), 0, 0)}), (56, {"rot": (r(5), 0, 0)})])
    keyed_action(obj("ArmL"), "Jump", end, [(1, {"rot": (r(8), 0, r(5))}), (8, {"rot": (r(28), 0, r(8))}), (16, {"rot": (r(-92), 0, r(16))}), (30, {"rot": (r(-104), 0, r(20))}), (42, {"rot": (r(-52), 0, r(10))}), (56, {"rot": (r(8), 0, r(5))})])
    keyed_action(obj("ArmR"), "Jump", end, [(1, {"rot": (r(8), 0, r(-5))}), (8, {"rot": (r(28), 0, r(-8))}), (16, {"rot": (r(-92), 0, r(-16))}), (30, {"rot": (r(-104), 0, r(-20))}), (42, {"rot": (r(-52), 0, r(-10))}), (56, {"rot": (r(8), 0, r(-5))})])
    keyed_action(obj("Cape"), "Jump", end, [(1, {"rot": (0, 0, 0)}), (8, {"rot": (r(7), 0, 0)}), (16, {"rot": (r(-16), 0, 0)}), (30, {"rot": (r(-34), 0, 0)}), (42, {"rot": (r(-18), 0, 0)}), (56, {"rot": (0, 0, 0)})])


def add_wave():
    end = 52
    keyed_action(obj("Body"), "Wave", end, [(1, {"rot": (0, 0, 0)}), (12, {"rot": (r(-2), 0, r(5))}), (28, {"rot": (r(-1), 0, r(7))}), (42, {"rot": (r(-2), 0, r(5))}), (52, {"rot": (0, 0, 0)})])
    keyed_action(obj("ArmL"), "Wave", end, [(1, {"rot": (r(8), 0, r(5))}), (12, {"rot": (r(-108), 0, r(30))}), (20, {"rot": (r(-112), 0, r(44))}), (28, {"rot": (r(-108), 0, r(20))}), (36, {"rot": (r(-112), 0, r(44))}), (44, {"rot": (r(-106), 0, r(30))}), (52, {"rot": (r(8), 0, r(5))})])
    keyed_action(obj("ForeArmL"), "Wave", end, [(1, {"rot": (r(-28), 0, 0)}), (12, {"rot": (r(-74), 0, 0)}), (20, {"rot": (r(-118), 0, 0)}), (28, {"rot": (r(-66), 0, 0)}), (36, {"rot": (r(-116), 0, 0)}), (44, {"rot": (r(-76), 0, 0)}), (52, {"rot": (r(-28), 0, 0)})])
    keyed_action(obj("ArmR"), "Wave", end, [(1, {"rot": (r(8), 0, r(-5))}), (24, {"rot": (r(12), 0, r(-6))}), (52, {"rot": (r(8), 0, r(-5))})])


def add_flute():
    end = 76
    flute = ensure_flute_prop()
    keyed_action(obj("Body"), "Flute", end, [(1, {"rot": (0, 0, 0)}), (18, {"loc": (0, 0, 0.015), "rot": (r(-1), 0, 0)}), (38, {"loc": (0, 0, 0.025), "rot": (r(-2), 0, 0)}), (58, {"loc": (0, 0, 0.015), "rot": (r(-1), 0, 0)}), (76, {"rot": (0, 0, 0)})])
    keyed_action(obj("ArmL"), "Flute", end, [(1, {"rot": (r(8), 0, r(5))}), (10, {"rot": (r(-108), 0, r(28))}), (38, {"rot": (r(-114), 0, r(30))}), (66, {"rot": (r(-108), 0, r(28))}), (76, {"rot": (r(8), 0, r(5))})])
    keyed_action(obj("ArmR"), "Flute", end, [(1, {"rot": (r(8), 0, r(-5))}), (10, {"rot": (r(-104), 0, r(-28))}), (38, {"rot": (r(-110), 0, r(-30))}), (66, {"rot": (r(-104), 0, r(-28))}), (76, {"rot": (r(8), 0, r(-5))})])
    keyed_action(obj("ForeArmL"), "Flute", end, [(1, {"rot": (r(-28), 0, 0)}), (10, {"rot": (r(-62), 0, 0)}), (30, {"rot": (r(-70), 0, r(2))}), (50, {"rot": (r(-58), 0, r(-2))}), (66, {"rot": (r(-62), 0, 0)}), (76, {"rot": (r(-28), 0, 0)})])
    keyed_action(obj("ForeArmR"), "Flute", end, [(1, {"rot": (r(-28), 0, 0)}), (10, {"rot": (r(-62), 0, 0)}), (30, {"rot": (r(-58), 0, r(-2))}), (50, {"rot": (r(-70), 0, r(2))}), (66, {"rot": (r(-62), 0, 0)}), (76, {"rot": (r(-28), 0, 0)})])
    keyed_action(flute, "Flute", end, [
        (1, {"scale_abs": (0.0, 0.0, 0.0)}),
        (8, {"scale_abs": (1.0, 1.0, 1.0), "rot": (0, 0, r(2))}),
        (30, {"scale_abs": (1.0, 1.0, 1.0), "rot": (r(2), 0, r(-2))}),
        (52, {"scale_abs": (1.0, 1.0, 1.0), "rot": (r(-2), 0, r(2))}),
        (68, {"scale_abs": (1.0, 1.0, 1.0), "rot": (0, 0, 0)}),
        (76, {"scale_abs": (0.0, 0.0, 0.0)}),
    ])


def add_sit():
    end = 96
    keyed_action(obj("Body"), "Sit", end, [
        (1, {"loc": (0, 0, 0), "rot": (0, 0, 0)}),
        (18, {"loc": (0, 0, -0.18), "rot": (r(3), 0, 0)}),
        (36, {"loc": (0, 0, -0.52), "rot": (r(-4), 0, 0)}),
        (60, {"loc": (0, 0, -0.54), "rot": (r(-5), 0, r(1.5))}),
        (78, {"loc": (0, 0, -0.50), "rot": (r(-3), 0, r(-1.2))}),
        (96, {"loc": (0, 0, -0.52), "rot": (r(-4), 0, 0)}),
    ])
    keyed_action(obj("LegL"), "Sit", end, [(1, {"rot": (0, 0, 0)}), (18, {"rot": (r(35), 0, r(-3))}), (36, {"rot": (r(84), 0, r(-8))}), (60, {"rot": (r(90), 0, r(-9))}), (96, {"rot": (r(84), 0, r(-8))})])
    keyed_action(obj("LegR"), "Sit", end, [(1, {"rot": (0, 0, 0)}), (18, {"rot": (r(35), 0, r(3))}), (36, {"rot": (r(92), 0, r(8))}), (60, {"rot": (r(86), 0, r(9))}), (96, {"rot": (r(92), 0, r(8))})])
    keyed_action(obj("ShinL"), "Sit", end, [(1, {"rot": (r(4), 0, 0)}), (18, {"rot": (r(42), 0, 0)}), (36, {"rot": (r(62), 0, 0)}), (96, {"rot": (r(62), 0, 0)})])
    keyed_action(obj("ShinR"), "Sit", end, [(1, {"rot": (r(4), 0, 0)}), (18, {"rot": (r(38), 0, 0)}), (36, {"rot": (r(56), 0, 0)}), (96, {"rot": (r(56), 0, 0)})])
    keyed_action(obj("ArmL"), "Sit", end, [(1, {"rot": (r(8), 0, r(5))}), (24, {"rot": (r(30), 0, r(12))}), (44, {"rot": (r(42), 0, r(13))}), (96, {"rot": (r(42), 0, r(13))})])
    keyed_action(obj("ArmR"), "Sit", end, [(1, {"rot": (r(8), 0, r(-5))}), (24, {"rot": (r(30), 0, r(-12))}), (44, {"rot": (r(42), 0, r(-13))}), (96, {"rot": (r(42), 0, r(-13))})])
    keyed_action(obj("ForeArmL"), "Sit", end, [(1, {"rot": (r(-28), 0, 0)}), (24, {"rot": (r(-46), 0, 0)}), (44, {"rot": (r(-62), 0, 0)}), (96, {"rot": (r(-62), 0, 0)})])
    keyed_action(obj("ForeArmR"), "Sit", end, [(1, {"rot": (r(-28), 0, 0)}), (24, {"rot": (r(-46), 0, 0)}), (44, {"rot": (r(-62), 0, 0)}), (96, {"rot": (r(-62), 0, 0)})])
    keyed_action(obj("Cape"), "Sit", end, [(1, {"rot": (0, 0, 0)}), (36, {"rot": (r(8), 0, 0)}), (60, {"rot": (r(10), 0, r(1))}), (96, {"rot": (r(8), 0, 0)})])


def add_actions():
    ensure_flute_prop()
    add_walk_loop()
    add_jump()
    add_wave()
    add_flute()
    add_sit()


def export_model():
    bpy.ops.export_scene.gltf(
        filepath=str(MODEL),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
    )


def main():
    reset_scene()
    import_model()
    clear_old_tracks()
    add_actions()
    export_model()
    print("Added protagonist actions:", ", ".join(CLIPS))
    print("Exported:", MODEL)


if __name__ == "__main__":
    main()
