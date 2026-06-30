# -*- coding: utf-8 -*-
"""
Generate a rigged XYSHZ protagonist with the full gameplay action library.

Run:
  blender --background --python blender/xyshz_rigged_walk.py

Output:
  frontend/public/models/xyshz_rigged.glb
"""

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "frontend" / "public" / "models" / "xyshz.glb"
OUT = ROOT / "frontend" / "public" / "models" / "xyshz_rigged.glb"
MOCAP_WALK = ROOT / "external" / "mocap" / "02_01.bvh"
MOCAP_RUN = ROOT / "external" / "mocap" / "09_01.bvh"
MOCAP_JUMP = ROOT / "external" / "mocap" / "13_39.bvh"
MOCAP_WAVE = ROOT / "external" / "mocap" / "13_26.bvh"
MOCAP_FLUTE = ROOT / "external" / "mocap" / "14_04.bvh"
MOCAP_SIT = ROOT / "external" / "mocap" / "14_27.bvh"
MOCAP_CHEER = ROOT / "external" / "mocap" / "13_29.bvh"
ARMATURE_NAME = "XYSHZ_Rig"
CLIPS = ["Idle", "WalkLoop", "RunLoop", "Jump", "Wave", "Flute", "Sit", "Cheer"]
LEG_INNER_SIDE = 0.055
LEG_OUTER_SIDE = 0.24
ARM_SIDE_THRESHOLD = 0.32
BVH_WALK_START = 40
BVH_WALK_END = 160
BVH_WALK_KEYS = 33
BVH_RUN_KEYS = 25


def r(deg: float) -> float:
    return math.radians(deg)


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def smoothstep(value: float) -> float:
    value = clamp(value, 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_source() -> None:
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))


def bake_imported_mesh() -> bpy.types.Object:
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh objects found in {SOURCE}")

    for ob in meshes:
        ob.data = ob.data.copy()
        ob.data.transform(ob.matrix_world)
        ob.matrix_world = Matrix.Identity(4)
        ob.parent = None

    bpy.ops.object.select_all(action="DESELECT")
    for ob in meshes:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()

    mesh = bpy.context.object
    mesh.name = "XYSHZ_Body"
    mesh.data.name = "XYSHZ_BodyMesh"
    mesh.location = (0.0, 0.0, 0.0)
    mesh.rotation_euler = (0.0, 0.0, 0.0)
    mesh.scale = (1.0, 1.0, 1.0)

    for ob in list(bpy.context.scene.objects):
        if ob != mesh and ob.type in {"EMPTY", "CAMERA", "LIGHT"}:
            bpy.data.objects.remove(ob, do_unlink=True)

    return mesh


def world_bounds(mesh: bpy.types.Object):
    coords = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
    min_x = min(v.x for v in coords)
    max_x = max(v.x for v in coords)
    min_y = min(v.y for v in coords)
    max_y = max(v.y for v in coords)
    min_z = min(v.z for v in coords)
    max_z = max(v.z for v in coords)
    return min_x, max_x, min_y, max_y, min_z, max_z


def create_armature(mesh: bpy.types.Object) -> bpy.types.Object:
    min_x, max_x, min_y, max_y, min_z, max_z = world_bounds(mesh)
    front_depth = max_x - min_x
    side_width = max_y - min_y
    height = max_z - min_z
    front_c = (min_x + max_x) * 0.5
    side_c = (min_y + max_y) * 0.5

    # The source model faces Blender +X. Its visual left/right spread is Blender Y, not X.
    def p(front_ratio: float, side_ratio: float, z_ratio: float):
        return (
            front_c + front_ratio * front_depth,
            side_c + side_ratio * side_width,
            min_z + z_ratio * height,
        )

    bpy.ops.object.armature_add(enter_editmode=True, align="WORLD", location=(0.0, 0.0, 0.0))
    arm = bpy.context.object
    arm.name = ARMATURE_NAME
    arm.data.name = f"{ARMATURE_NAME}_Data"
    arm.show_in_front = False

    initial = arm.data.edit_bones.get("Bone")
    if initial:
        arm.data.edit_bones.remove(initial)

    bones = {}

    def add_bone(name: str, head, tail, parent: str | None = None):
        bone = arm.data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.roll = 0.0
        bone.use_deform = True
        if parent:
            bone.parent = bones[parent]
            bone.use_connect = False
        bones[name] = bone
        return bone

    add_bone("Hips", p(0.0, 0.0, 0.43), p(0.0, 0.0, 0.55))
    add_bone("Spine", p(0.0, 0.0, 0.55), p(0.0, 0.0, 0.66), "Hips")
    add_bone("Chest", p(0.0, 0.0, 0.66), p(0.0, 0.0, 0.77), "Spine")
    add_bone("Head", p(0.0, 0.0, 0.77), p(0.0, 0.0, 0.96), "Chest")

    add_bone("UpperLegL", p(0.0, -0.08, 0.43), p(0.02, -0.10, 0.26), "Hips")
    add_bone("LowerLegL", p(0.02, -0.10, 0.26), p(0.00, -0.10, 0.09), "UpperLegL")
    add_bone("FootL", p(0.00, -0.10, 0.09), p(0.12, -0.10, 0.03), "LowerLegL")
    add_bone("UpperLegR", p(0.0, 0.08, 0.43), p(0.02, 0.10, 0.26), "Hips")
    add_bone("LowerLegR", p(0.02, 0.10, 0.26), p(0.00, 0.10, 0.09), "UpperLegR")
    add_bone("FootR", p(0.00, 0.10, 0.09), p(0.12, 0.10, 0.03), "LowerLegR")

    add_bone("UpperArmL", p(0.0, -0.12, 0.72), p(0.01, -0.23, 0.55), "Chest")
    add_bone("ForeArmL", p(0.01, -0.23, 0.55), p(0.0, -0.25, 0.35), "UpperArmL")
    add_bone("HandL", p(0.0, -0.25, 0.35), p(0.02, -0.25, 0.27), "ForeArmL")
    add_bone("UpperArmR", p(0.0, 0.12, 0.72), p(0.01, 0.23, 0.55), "Chest")
    add_bone("ForeArmR", p(0.01, 0.23, 0.55), p(0.0, 0.25, 0.35), "UpperArmR")
    add_bone("HandR", p(0.0, 0.25, 0.35), p(0.02, 0.25, 0.27), "ForeArmR")

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def assign_spatial_weights(mesh: bpy.types.Object, arm: bpy.types.Object) -> None:
    min_x, max_x, min_y, max_y, min_z, max_z = world_bounds(mesh)
    side_width = max_y - min_y
    height = max_z - min_z
    side_c = (min_y + max_y) * 0.5

    for group in list(mesh.vertex_groups):
        mesh.vertex_groups.remove(group)

    groups = {bone.name: mesh.vertex_groups.new(name=bone.name) for bone in arm.data.bones}

    def add(index: int, name: str, weight: float) -> None:
        groups[name].add([index], max(0.0, min(1.0, weight)), "ADD")

    def body_weights(zt: float):
        if zt > 0.78:
            return [("Head", 0.88), ("Chest", 0.12)]
        if zt > 0.66:
            return [("Chest", 0.78), ("Spine", 0.22)]
        if zt > 0.52:
            return [("Spine", 0.72), ("Chest", 0.16), ("Hips", 0.12)]
        if zt > 0.40:
            return [("Hips", 0.74), ("Spine", 0.26)]
        return [("Hips", 1.0)]

    for vertex in mesh.data.vertices:
        co = mesh.matrix_world @ vertex.co
        side_offset = co.y - side_c
        front_ratio = (co.x - min_x) / (max_x - min_x) if max_x > min_x else 0.5
        zt = (co.z - min_z) / height if height else 0.0
        side_abs = abs(side_offset) / side_width if side_width else 0.0
        side = "L" if side_offset < 0 else "R"

        weights = None
        if zt < 0.45 and LEG_INNER_SIDE < side_abs < LEG_OUTER_SIDE:
            if zt < 0.12:
                weights = [(f"Foot{side}", 0.50), (f"LowerLeg{side}", 0.35), ("Hips", 0.15)]
            elif zt < 0.28:
                weights = [(f"LowerLeg{side}", 0.55), (f"UpperLeg{side}", 0.25), ("Hips", 0.20)]
            else:
                weights = [(f"UpperLeg{side}", 0.45), ("Hips", 0.55)]
        elif 0.25 < zt < 0.77 and side_abs > ARM_SIDE_THRESHOLD and front_ratio > 0.44:
            if zt > 0.58:
                weights = [(f"UpperArm{side}", 0.30), ("Chest", 0.70)]
            elif zt > 0.38:
                weights = [(f"ForeArm{side}", 0.34), (f"UpperArm{side}", 0.16), ("Chest", 0.50)]
            else:
                weights = [(f"Hand{side}", 0.34), (f"ForeArm{side}", 0.18), ("Chest", 0.48)]

        if weights is None:
            weights = body_weights(zt)

        total = sum(weight for _, weight in weights) or 1.0
        for name, weight in weights:
            add(vertex.index, name, weight / total)

    modifier = mesh.modifiers.new("XYSHZ_Armature", "ARMATURE")
    modifier.object = arm
    mesh.parent = arm
    mesh.matrix_parent_inverse = arm.matrix_world.inverted()


def reset_pose(arm: bpy.types.Object) -> None:
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)


def keyed_pose_action(arm: bpy.types.Object, clip: str, end: int, frames) -> None:
    reset_pose(arm)
    arm.animation_data_create()
    action = bpy.data.actions.new(clip)
    action.frame_range = (1, end)
    arm.animation_data.action = action

    animated = set()
    for _, frame_spec in frames:
        animated.update(frame_spec.keys())

    for frame, frame_spec in frames:
        reset_pose(arm)
        for bone_name, spec in frame_spec.items():
            pb = arm.pose.bones.get(bone_name)
            if not pb:
                continue
            if "loc" in spec:
                pb.location = spec["loc"]
                pb.keyframe_insert("location", frame=frame)
            if "rot" in spec:
                pb.rotation_euler = spec["rot"]
                pb.keyframe_insert("rotation_euler", frame=frame)
            if "scale" in spec:
                pb.scale = spec["scale"]
                pb.keyframe_insert("scale", frame=frame)
            if "world_loc" in spec:
                bpy.context.view_layer.update()
                matrix = pb.matrix.copy()
                matrix.translation = Vector(spec["world_loc"])
                pb.matrix = matrix
                bpy.context.view_layer.update()
                pb.keyframe_insert("location", frame=frame)

        for bone_name in animated:
            if bone_name in frame_spec:
                continue
            pb = arm.pose.bones.get(bone_name)
            if not pb:
                continue
            pb.keyframe_insert("location", frame=frame)
            pb.keyframe_insert("rotation_euler", frame=frame)
            pb.keyframe_insert("scale", frame=frame)

    track = arm.animation_data.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 1, action)
    strip.name = clip
    strip.frame_start = 1
    strip.frame_end = end
    arm.animation_data.action = None
    reset_pose(arm)


def add_idle(arm: bpy.types.Object) -> None:
    frames = [
        (1, {
            "Hips": {"loc": (0.0, 0.0, 0.0)},
            "Spine": {"rot": (0.0, 0.0, 0.0)},
            "Chest": {"rot": (0.0, 0.0, 0.0)},
            "Head": {"rot": (0.0, 0.0, 0.0)},
        }),
        (25, {
            "Hips": {"loc": (0.0, 0.0, 0.12)},
            "Spine": {"rot": (r(0.25), 0.0, 0.0)},
            "Chest": {"rot": (r(-0.2), 0.0, 0.0)},
            "Head": {"rot": (r(0.15), 0.0, 0.0)},
        }),
        (49, {
            "Hips": {"loc": (0.0, 0.0, 0.0)},
            "Spine": {"rot": (0.0, 0.0, 0.0)},
            "Chest": {"rot": (0.0, 0.0, 0.0)},
            "Head": {"rot": (0.0, 0.0, 0.0)},
        }),
    ]
    keyed_pose_action(arm, "Idle", 49, frames)


def parse_bvh_motion(path: Path):
    lines = path.read_text(encoding="utf-8").splitlines()
    stack: list[str | None] = []
    channels: list[tuple[str, str]] = []
    motion_line = -1

    for index, raw in enumerate(lines):
        line = raw.strip()
        if line == "MOTION":
            motion_line = index
            break
        if line.startswith("ROOT ") or line.startswith("JOINT "):
            stack.append(line.split()[1])
            continue
        if line == "End Site":
            stack.append(None)
            continue
        if line == "}":
            if stack:
                stack.pop()
            continue
        if line.startswith("CHANNELS ") and stack and stack[-1] is not None:
            parts = line.split()
            joint = stack[-1]
            for channel in parts[2:]:
                channels.append((joint, channel))

    if motion_line < 0:
        raise RuntimeError(f"BVH MOTION section not found: {path}")

    frame_count = int(lines[motion_line + 1].split(":", 1)[1].strip())
    frame_time = float(lines[motion_line + 2].split(":", 1)[1].strip())
    frames = []
    for raw in lines[motion_line + 3: motion_line + 3 + frame_count]:
        if raw.strip():
            frames.append([float(value) for value in raw.split()])
    if len(frames) != frame_count:
        raise RuntimeError(f"Expected {frame_count} BVH frames, got {len(frames)} from {path}")
    return {"channels": channels, "frames": frames, "frame_time": frame_time}


def build_bvh_gait_frames(key_count: int, gait: str = "walk"):
    mocap_path = MOCAP_RUN if gait == "run" else MOCAP_WALK
    motion = parse_bvh_motion(mocap_path)
    frames = motion["frames"]
    channel_index = {channel: index for index, channel in enumerate(motion["channels"])}
    is_run = gait == "run"
    source_start = 18 if is_run else BVH_WALK_START
    source_end = 118 if is_run else BVH_WALK_END
    source_start = max(1, min(source_start, len(frames) - 2))  # skip frame 0 T-pose
    source_end = max(source_start + 1, min(source_end, len(frames) - 1))
    stride = 1.58 if is_run else 1.10
    knee = 1.25 if is_run else 1.08
    arm = 1.52 if is_run else 1.25
    bob = 1.20 if is_run else 0.94

    def value_at(frame_float: float, joint: str, channel: str) -> float:
        index = channel_index[(joint, channel)]
        lo = int(math.floor(frame_float))
        hi = min(len(frames) - 1, lo + 1)
        t = frame_float - lo
        return lerp(frames[lo][index], frames[hi][index], t)

    def series(joint: str, channel: str):
        index = channel_index[(joint, channel)]
        return [frames[frame][index] for frame in range(source_start, source_end + 1)]

    stats: dict[tuple[str, str], tuple[float, float, float]] = {}

    def centered(frame_float: float, joint: str, channel: str) -> float:
        key = (joint, channel)
        if key not in stats:
            values = series(joint, channel)
            lo = min(values)
            hi = max(values)
            stats[key] = (lo, hi, (lo + hi) * 0.5)
        lo, hi, mid = stats[key]
        half = max(0.001, (hi - lo) * 0.5)
        return clamp((value_at(frame_float, joint, channel) - mid) / half, -1.0, 1.0)

    def normalized(frame_float: float, joint: str, channel: str) -> float:
        key = (joint, channel)
        if key not in stats:
            values = series(joint, channel)
            lo = min(values)
            hi = max(values)
            stats[key] = (lo, hi, (lo + hi) * 0.5)
        lo, hi, _ = stats[key]
        return clamp((value_at(frame_float, joint, channel) - lo) / max(0.001, hi - lo), 0.0, 1.0)

    def pose_from_source(frame_float: float):
        left_thigh = centered(frame_float, "LeftUpLeg", "Xrotation")
        right_thigh = centered(frame_float, "RightUpLeg", "Xrotation")
        left_knee = normalized(frame_float, "LeftLeg", "Xrotation")
        right_knee = normalized(frame_float, "RightLeg", "Xrotation")
        left_foot = centered(frame_float, "LeftFoot", "Xrotation")
        right_foot = centered(frame_float, "RightFoot", "Xrotation")
        left_arm = centered(frame_float, "LeftArm", "Xrotation")
        right_arm = centered(frame_float, "RightArm", "Xrotation")
        spine_sway = centered(frame_float, "Spine1", "Zrotation")
        head_sway = centered(frame_float, "Head", "Zrotation")
        hips_bob = normalized(frame_float, "Hips", "Yposition")

        return {
            "Hips": {"loc": (0.0, 0.0, 0.06 + hips_bob * 0.16 * bob), "rot": (0.0, 0.0, r(centered(frame_float, "Hips", "Zrotation") * 0.7))},
            "Chest": {"rot": (r(0.2 if not is_run else 0.45), 0.0, r(spine_sway * (0.8 if not is_run else 1.05)))},
            "Head": {"rot": (r(-0.1), 0.0, r(head_sway * 0.5))},
            "UpperLegL": {"rot": (0.0, 0.0, r(left_thigh * 12.0 * stride))},
            "LowerLegL": {"rot": (0.0, 0.0, r(1.5 + left_knee * 12.5 * knee))},
            "FootL": {"rot": (0.0, 0.0, r(left_foot * 3.2 * stride))},
            "UpperLegR": {"rot": (0.0, 0.0, r(right_thigh * 12.0 * stride))},
            "LowerLegR": {"rot": (0.0, 0.0, r(1.5 + right_knee * 12.5 * knee))},
            "FootR": {"rot": (0.0, 0.0, r(right_foot * 3.2 * stride))},
            "UpperArmL": {"rot": (0.0, 0.0, r(left_arm * 6.6 * arm + 1.0))},
            "ForeArmL": {"rot": (0.0, 0.0, r(-3.2 if not is_run else -4.2))},
            "UpperArmR": {"rot": (0.0, 0.0, r(right_arm * 6.6 * arm - 1.0))},
            "ForeArmR": {"rot": (0.0, 0.0, r(-3.2 if not is_run else -4.2))},
        }

    out = []
    first_pose = None
    for key_index in range(key_count):
        frame = key_index + 1
        if key_index == key_count - 1 and first_pose is not None:
            out.append((frame, first_pose))
            continue
        source_frame = source_start + (source_end - source_start) * (key_index / (key_count - 1))
        pose = pose_from_source(source_frame)
        if first_pose is None:
            first_pose = pose
        out.append((frame, pose))
    return out


def build_bvh_walk_frames():
    return build_bvh_gait_frames(BVH_WALK_KEYS, "walk")


def build_bvh_run_frames():
    return build_bvh_gait_frames(BVH_RUN_KEYS, "run")


def add_walk_loop(arm: bpy.types.Object) -> None:
    frames = build_bvh_walk_frames()
    keyed_pose_action(arm, "WalkLoop", 33, frames)


def add_run_loop(arm: bpy.types.Object) -> None:
    frames = build_bvh_run_frames()
    keyed_pose_action(arm, "RunLoop", BVH_RUN_KEYS, frames)


def build_controlled_external_frames(path: Path, source_start: int, source_end: int, key_count: int, kind: str):
    motion = parse_bvh_motion(path)
    frames = motion["frames"]
    channel_index = {channel: index for index, channel in enumerate(motion["channels"])}
    source_start = max(1, min(source_start, len(frames) - 2))
    source_end = max(source_start + 1, min(source_end, len(frames) - 1))

    def has(joint: str, channel: str) -> bool:
        return (joint, channel) in channel_index

    def value_at(frame_float: float, joint: str, channel: str) -> float:
        key = (joint, channel)
        if key not in channel_index:
            return 0.0
        index = channel_index[key]
        lo = int(math.floor(frame_float))
        hi = min(len(frames) - 1, lo + 1)
        t = frame_float - lo
        return lerp(frames[lo][index], frames[hi][index], t)

    stats: dict[tuple[str, str], tuple[float, float, float]] = {}

    def series(joint: str, channel: str):
        if not has(joint, channel):
            return [0.0]
        index = channel_index[(joint, channel)]
        return [frames[frame][index] for frame in range(source_start, source_end + 1)]

    def centered(frame_float: float, joint: str, channel: str) -> float:
        key = (joint, channel)
        if key not in stats:
            values = series(joint, channel)
            lo = min(values)
            hi = max(values)
            stats[key] = (lo, hi, (lo + hi) * 0.5)
        lo, hi, mid = stats[key]
        half = max(0.001, (hi - lo) * 0.5)
        return clamp((value_at(frame_float, joint, channel) - mid) / half, -1.0, 1.0)

    def normalized(frame_float: float, joint: str, channel: str) -> float:
        key = (joint, channel)
        if key not in stats:
            values = series(joint, channel)
            lo = min(values)
            hi = max(values)
            stats[key] = (lo, hi, (lo + hi) * 0.5)
        lo, hi, _ = stats[key]
        return clamp((value_at(frame_float, joint, channel) - lo) / max(0.001, hi - lo), 0.0, 1.0)

    def pose_from_source(frame_float: float):
        progress = clamp((frame_float - source_start) / max(1.0, source_end - source_start), 0.0, 1.0)
        rise_fall = smoothstep(progress / 0.22) * smoothstep((1.0 - progress) / 0.18)
        hold_in = smoothstep(progress / 0.25)
        hip_lift = normalized(frame_float, "Hips", "Yposition")
        chest_sway = centered(frame_float, "Spine1", "Zrotation")
        head_sway = centered(frame_float, "Head", "Yrotation")
        l_thigh = centered(frame_float, "LeftUpLeg", "Xrotation")
        r_thigh = centered(frame_float, "RightUpLeg", "Xrotation")
        l_knee = normalized(frame_float, "LeftLeg", "Xrotation")
        r_knee = normalized(frame_float, "RightLeg", "Xrotation")
        l_arm = centered(frame_float, "LeftArm", "Xrotation")
        r_arm = centered(frame_float, "RightArm", "Xrotation")
        l_fore = centered(frame_float, "LeftForeArm", "Xrotation")
        r_fore = centered(frame_float, "RightForeArm", "Xrotation")
        r_wave = centered(frame_float, "RightForeArm", "Zrotation")
        l_wave = centered(frame_float, "LeftForeArm", "Zrotation")

        if kind == "jump":
            return {
                "Hips": {"loc": (0.0, 0.0, -1.2 + hip_lift * 7.0)},
                "Chest": {"rot": (r(-1.2 + hip_lift * 1.2), 0.0, r(chest_sway * 1.6))},
                "Head": {"rot": (r(-0.4), 0.0, r(head_sway * 1.0))},
                "UpperLegL": {"rot": (0.0, 0.0, r(l_thigh * 15.0))},
                "UpperLegR": {"rot": (0.0, 0.0, r(r_thigh * 15.0))},
                "LowerLegL": {"rot": (0.0, 0.0, r(4.0 + l_knee * 18.0))},
                "LowerLegR": {"rot": (0.0, 0.0, r(4.0 + r_knee * 18.0))},
                "UpperArmL": {"rot": (0.0, 0.0, r(l_arm * 9.0 - 2.0))},
                "UpperArmR": {"rot": (0.0, 0.0, r(r_arm * 9.0 + 2.0))},
                "ForeArmL": {"rot": (0.0, 0.0, r(-5.0 + l_fore * 3.0))},
                "ForeArmR": {"rot": (0.0, 0.0, r(-5.0 + r_fore * 3.0))},
            }

        if kind == "wave":
            amount = rise_fall
            return {
                "Chest": {"rot": (r(-0.9 * amount), 0.0, r((3.4 + chest_sway * 0.9) * amount))},
                "Head": {"rot": (r(-0.7 * amount), 0.0, r((-1.8 + head_sway * 0.7) * amount))},
                "UpperArmR": {"rot": (r((52.0 + r_arm * 5.0) * amount), r(-4.0 * amount), r((-16.0 + r_wave * 7.0) * amount))},
                "ForeArmR": {"rot": (r((24.0 + r_fore * 6.0) * amount), 0.0, r((r_wave * 25.0) * amount))},
                "HandR": {"rot": (0.0, 0.0, r((r_wave * 18.0) * amount))},
                "UpperArmL": {"rot": (r(-2.0 * amount), 0.0, r(-2.0 * amount))},
                "ForeArmL": {"rot": (r(-2.0 * amount), 0.0, r(-2.5 * amount))},
            }

        if kind == "flute":
            amount = hold_in
            breath = math.sin((frame_float - source_start) / max(1, source_end - source_start) * math.pi * 2)
            pose = {
                "Chest": {"rot": (r((-2.0 + breath * 0.35) * amount), 0.0, r(chest_sway * 0.7 * amount))},
                "Head": {"rot": (r((3.5 + breath * 0.25) * amount), 0.0, r((head_sway * 0.8 - 0.8) * amount))},
                "UpperArmL": {"rot": (r((-50.0 + l_arm * 2.0) * amount), r(3.0 * amount), r((-12.0 + l_wave * 2.0) * amount))},
                "ForeArmL": {"rot": (r((-36.0 + l_fore * 3.0) * amount), 0.0, r((34.0 + l_wave * 3.0) * amount))},
                "HandL": {"rot": (r(-4.0 * amount), 0.0, r((-5.0 + l_wave * 1.5) * amount))},
                "UpperArmR": {"rot": (r((50.0 + r_arm * 2.0) * amount), r(-3.0 * amount), r((12.0 + r_wave * 2.0) * amount))},
                "ForeArmR": {"rot": (r((36.0 + r_fore * 3.0) * amount), 0.0, r((-34.0 + r_wave * 3.0) * amount))},
                "HandR": {"rot": (r(4.0 * amount), 0.0, r((5.0 + r_wave * 1.5) * amount))},
            }
            if amount > 0.01:
                pose["HandL"]["world_loc"] = (3.5, -4.0, 27.0)
                pose["HandR"]["world_loc"] = (5.5, 4.0, 27.0)
            return pose

        if kind == "sit":
            settle = min(1.0, (frame_float - source_start) / max(1.0, (source_end - source_start) * 0.55))
            settle = smoothstep(settle)
            return {
                "Hips": {"world_loc": (0.0, 0.0, -16.0 * settle), "rot": (r(-2.0 * settle), 0.0, 0.0)},
                "Spine": {"rot": (r(3.0 * settle), 0.0, 0.0)},
                "Chest": {"rot": (r(-2.0 * settle), 0.0, r(chest_sway * 0.8 * settle))},
                "Head": {"rot": (r(0.8 * settle), 0.0, r(head_sway * 0.7 * settle))},
                "UpperLegL": {"rot": (0.0, 0.0, r(-38.0 * settle + l_thigh * 2.5))},
                "UpperLegR": {"rot": (0.0, 0.0, r(-38.0 * settle + r_thigh * 2.5))},
                "LowerLegL": {"rot": (0.0, 0.0, r(26.0 * settle + l_knee * 3.0))},
                "LowerLegR": {"rot": (0.0, 0.0, r(26.0 * settle + r_knee * 3.0))},
                "FootL": {"rot": (0.0, 0.0, r(5.0 * settle))},
                "FootR": {"rot": (0.0, 0.0, r(5.0 * settle))},
                "UpperArmL": {"rot": (r(-8.0 * settle), 0.0, r(-4.0 * settle))},
                "UpperArmR": {"rot": (r(8.0 * settle), 0.0, r(4.0 * settle))},
                "ForeArmL": {"rot": (r(-5.0 * settle), 0.0, r(4.0 * settle))},
                "ForeArmR": {"rot": (r(5.0 * settle), 0.0, r(-4.0 * settle))},
            }

        if kind == "cheer":
            amount = math.sin(progress * math.pi)
            bounce = math.sin((frame_float - source_start) / max(1, source_end - source_start) * math.pi)
            return {
                "Hips": {"loc": (0.0, 0.0, bounce * 3.0)},
                "Chest": {"rot": (r((-3.8 + bounce * -0.8) * amount), 0.0, r((chest_sway * 1.0 + 2.0) * amount))},
                "Head": {"rot": (r(-1.4 * amount), 0.0, r(head_sway * 0.8 * amount))},
                "UpperArmL": {"rot": (r((-72.0 + l_arm * 4.0) * amount), 0.0, r((12.0 + l_wave * 4.0) * amount))},
                "UpperArmR": {"rot": (r((72.0 + r_arm * 4.0) * amount), 0.0, r((-12.0 + r_wave * 4.0) * amount))},
                "ForeArmL": {"rot": (r((-26.0 + l_fore * 4.0) * amount), 0.0, r((8.0 + l_wave * 5.0) * amount))},
                "ForeArmR": {"rot": (r((26.0 + r_fore * 4.0) * amount), 0.0, r((-8.0 + r_wave * 5.0) * amount))},
                "HandL": {"rot": (0.0, 0.0, r(l_wave * 6.0 * amount))},
                "HandR": {"rot": (0.0, 0.0, r(r_wave * 6.0 * amount))},
            }

        return {}

    out = []
    for key_index in range(key_count):
        frame = key_index + 1
        source_frame = source_start + (source_end - source_start) * (key_index / max(1, key_count - 1))
        out.append((frame, pose_from_source(source_frame)))
    return out


def add_jump(arm: bpy.types.Object) -> None:
    frames = build_controlled_external_frames(MOCAP_JUMP, 50, 270, 37, "jump")
    keyed_pose_action(arm, "Jump", 37, frames)


def add_wave(arm: bpy.types.Object) -> None:
    frames = build_controlled_external_frames(MOCAP_WAVE, 480, 680, 49, "wave")
    keyed_pose_action(arm, "Wave", 49, frames)


def add_flute(arm: bpy.types.Object) -> None:
    frames = build_controlled_external_frames(MOCAP_FLUTE, 120, 620, 49, "flute")
    keyed_pose_action(arm, "Flute", 49, frames)


def add_sit(arm: bpy.types.Object) -> None:
    frames = build_controlled_external_frames(MOCAP_SIT, 120, 760, 49, "sit")
    keyed_pose_action(arm, "Sit", 49, frames)


def add_cheer(arm: bpy.types.Object) -> None:
    frames = build_controlled_external_frames(MOCAP_CHEER, 180, 420, 41, "cheer")
    keyed_pose_action(arm, "Cheer", 41, frames)


def export_glb(mesh: bpy.types.Object, arm: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
    )


def main() -> None:
    if not SOURCE.exists():
        raise RuntimeError(f"Missing source model: {SOURCE}")
    reset_scene()
    import_source()
    mesh = bake_imported_mesh()
    arm = create_armature(mesh)
    assign_spatial_weights(mesh, arm)
    add_idle(arm)
    add_walk_loop(arm)
    add_run_loop(arm)
    add_jump(arm)
    add_wave(arm)
    add_flute(arm)
    add_sit(arm)
    add_cheer(arm)
    export_glb(mesh, arm)
    print(f"Exported {OUT}")


if __name__ == "__main__":
    main()
