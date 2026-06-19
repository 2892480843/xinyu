import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "frontend" / "public" / "models" / "xy_pet_spirit_lighthouse.glb"
CLIPS = ["FeedTreat", "TalkListen", "BondGlow", "SleepFloat", "SecretTwirl"]


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
    for action in list(bpy.data.actions):
        if any(action.name == clip or action.name.startswith(f"{clip}_") for clip in CLIPS):
            bpy.data.actions.remove(action)


def keyed_action(ob, clip: str, end: int, keys):
    if not ob:
        return
    base_loc = ob.location.copy()
    base_rot = ob.rotation_euler.copy()
    base_scale = ob.scale.copy()
    ob.animation_data_create()
    action = bpy.data.actions.new(f"{clip}_{ob.name}")
    ob.animation_data.action = action
    for frame, spec in keys:
        loc = spec.get("loc", (0.0, 0.0, 0.0))
        rot = spec.get("rot", (0.0, 0.0, 0.0))
        scale = spec.get("scale", (1.0, 1.0, 1.0))
        ob.location = base_loc + type(base_loc)(loc)
        ob.rotation_euler = (
            base_rot.x + rot[0],
            base_rot.y + rot[1],
            base_rot.z + rot[2],
        )
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


def add_actions():
    root = obj("XY_PetSpirit_Lighthouse")
    tail = obj("XYANIM_TailPivot")
    left_ear = obj("XYANIM_LeftEarFinPivot")
    right_ear = obj("XYANIM_RightEarFinPivot")
    left_charm = obj("XYANIM_LeftCharmPivot")
    right_charm = obj("XYANIM_RightCharmPivot")
    orb = obj("XYANIM_MemoryOrbPivot")
    halo_a = obj("XYPS_lighthouse_warm_halo_3.28")
    halo_b = obj("XYPS_lighthouse_warm_halo_3.4")
    diamond = obj("XYPSD_lighthouse_glowing_diamond_front")

    keyed_action(root, "FeedTreat", 60, [
        (1, {"loc": (0, 0, 0), "rot": (0, 0, 0), "scale": (1, 1, 1)}),
        (12, {"loc": (0, -0.02, 0.08), "rot": (math.radians(4), 0, 0), "scale": (0.95, 0.95, 0.98)}),
        (28, {"loc": (0, 0.03, 0.18), "rot": (math.radians(-6), 0, 0), "scale": (1.08, 1.08, 1.05)}),
        (44, {"loc": (0, 0, 0.05), "rot": (math.radians(2), 0, 0), "scale": (1.02, 1.02, 1.02)}),
        (60, {"loc": (0, 0, 0), "rot": (0, 0, 0), "scale": (1, 1, 1)}),
    ])
    keyed_action(tail, "FeedTreat", 60, [
        (1, {"rot": (0, 0, 0), "scale": (1, 1, 1)}),
        (14, {"rot": (0, 0, math.radians(18)), "scale": (1.04, 1.04, 1.04)}),
        (28, {"rot": (0, 0, math.radians(-22)), "scale": (1.06, 1.06, 1.06)}),
        (42, {"rot": (0, 0, math.radians(16)), "scale": (1.03, 1.03, 1.03)}),
        (60, {"rot": (0, 0, 0), "scale": (1, 1, 1)}),
    ])
    keyed_action(orb, "FeedTreat", 60, [
        (1, {"rot": (0, 0, 0), "scale": (1, 1, 1)}),
        (30, {"rot": (0, 0, math.radians(80)), "scale": (1.25, 1.25, 1.25)}),
        (60, {"rot": (0, 0, math.radians(160)), "scale": (1, 1, 1)}),
    ])

    keyed_action(root, "TalkListen", 72, [
        (1, {"loc": (0, 0, 0), "rot": (0, 0, 0), "scale": (1, 1, 1)}),
        (18, {"loc": (0, 0.01, -0.03), "rot": (math.radians(3), 0, math.radians(-2)), "scale": (0.98, 0.98, 0.99)}),
        (36, {"loc": (0, 0.02, -0.06), "rot": (math.radians(5), 0, math.radians(2)), "scale": (0.97, 0.97, 0.98)}),
        (54, {"loc": (0, 0.01, -0.03), "rot": (math.radians(3), 0, 0), "scale": (0.99, 0.99, 1)}),
        (72, {"loc": (0, 0, 0), "rot": (0, 0, 0), "scale": (1, 1, 1)}),
    ])
    for pivot, side in [(left_ear, -1), (right_ear, 1), (left_charm, -1), (right_charm, 1)]:
        keyed_action(pivot, "TalkListen", 72, [
            (1, {"rot": (0, 0, 0)}),
            (24, {"rot": (0, math.radians(side * 4), math.radians(side * 5))}),
            (48, {"rot": (0, math.radians(side * -3), math.radians(side * -4))}),
            (72, {"rot": (0, 0, 0)}),
        ])

    keyed_action(root, "BondGlow", 84, [
        (1, {"loc": (0, 0, 0), "scale": (1, 1, 1)}),
        (20, {"loc": (0, 0, 0.1), "scale": (1.08, 1.08, 1.08)}),
        (42, {"loc": (0, 0, 0.16), "scale": (1.14, 1.14, 1.14)}),
        (64, {"loc": (0, 0, 0.08), "scale": (1.06, 1.06, 1.06)}),
        (84, {"loc": (0, 0, 0), "scale": (1, 1, 1)}),
    ])
    for glow in [halo_a, halo_b, diamond, orb]:
        keyed_action(glow, "BondGlow", 84, [
            (1, {"scale": (1, 1, 1), "rot": (0, 0, 0)}),
            (42, {"scale": (1.45, 1.45, 1.45), "rot": (0, 0, math.radians(45))}),
            (84, {"scale": (1, 1, 1), "rot": (0, 0, math.radians(90))}),
        ])

    keyed_action(root, "SleepFloat", 120, [
        (1, {"loc": (0, 0, 0), "rot": (0, 0, 0), "scale": (1, 1, 1)}),
        (30, {"loc": (0, 0.02, 0.08), "rot": (0, 0, math.radians(4)), "scale": (1.02, 1.02, 0.98)}),
        (60, {"loc": (0, 0.04, 0.13), "rot": (0, 0, math.radians(-3)), "scale": (0.98, 0.98, 1.02)}),
        (90, {"loc": (0, 0.02, 0.08), "rot": (0, 0, math.radians(3)), "scale": (1.02, 1.02, 0.98)}),
        (120, {"loc": (0, 0, 0), "rot": (0, 0, 0), "scale": (1, 1, 1)}),
    ])
    for pivot, side in [(left_charm, -1), (right_charm, 1), (tail, 1)]:
        keyed_action(pivot, "SleepFloat", 120, [
            (1, {"rot": (0, 0, 0)}),
            (60, {"rot": (0, 0, math.radians(side * 6))}),
            (120, {"rot": (0, 0, 0)}),
        ])

    keyed_action(root, "SecretTwirl", 72, [
        (1, {"loc": (0, 0, 0), "rot": (0, 0, 0), "scale": (1, 1, 1)}),
        (18, {"loc": (0, 0, 0.18), "rot": (0, 0, math.radians(110)), "scale": (1.08, 1.08, 1.08)}),
        (36, {"loc": (0, 0, 0.26), "rot": (0, 0, math.radians(230)), "scale": (1.16, 1.16, 1.16)}),
        (54, {"loc": (0, 0, 0.12), "rot": (0, 0, math.radians(330)), "scale": (1.06, 1.06, 1.06)}),
        (72, {"loc": (0, 0, 0), "rot": (0, 0, math.radians(360)), "scale": (1, 1, 1)}),
    ])
    for pivot, side in [(tail, 1), (left_ear, -1), (right_ear, 1), (orb, 1)]:
        keyed_action(pivot, "SecretTwirl", 72, [
            (1, {"rot": (0, 0, 0), "scale": (1, 1, 1)}),
            (36, {"rot": (0, 0, math.radians(side * 160)), "scale": (1.1, 1.1, 1.1)}),
            (72, {"rot": (0, 0, math.radians(side * 320)), "scale": (1, 1, 1)}),
        ])


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
    print("Added companion actions:", CLIPS)


if __name__ == "__main__":
    main()
