# -*- coding: utf-8 -*-
"""
Inspect the source XYSHZ model before rig or animation edits.

Run:
  blender --background --python blender/inspect_xyshz_model.py

Outputs:
  docs/screenshots/xyshz-model-front.png
  docs/screenshots/xyshz-model-side.png
  docs/screenshots/xyshz-model-top.png
  docs/screenshots/xyshz-model-quarters.png
  docs/xyshz-model-inspection.md
"""

from __future__ import annotations

import math
from collections import Counter
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "frontend" / "public" / "models" / "xyshz.glb"
SCREEN_DIR = ROOT / "docs" / "screenshots"
REPORT = ROOT / "docs" / "xyshz-model-inspection.md"


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model() -> list[bpy.types.Object]:
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh objects found in {SOURCE}")
    return meshes


def bake_meshes(meshes: list[bpy.types.Object]) -> bpy.types.Object:
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
    mesh.name = "XYSHZ_Source_Inspection"
    mesh.data.name = "XYSHZ_Source_InspectionMesh"
    return mesh


def bounds(mesh: bpy.types.Object) -> tuple[float, float, float, float, float, float]:
    coords = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
    return (
        min(v.x for v in coords),
        max(v.x for v in coords),
        min(v.y for v in coords),
        max(v.y for v in coords),
        min(v.z for v in coords),
        max(v.z for v in coords),
    )


def material_counts(mesh: bpy.types.Object) -> Counter[str]:
    counts: Counter[str] = Counter()
    for poly in mesh.data.polygons:
        material = mesh.data.materials[poly.material_index] if poly.material_index < len(mesh.data.materials) else None
        counts[material.name if material else "(none)"] += 1
    return counts


def vertex_sections(mesh: bpy.types.Object, min_x: float, max_x: float, min_z: float, max_z: float) -> list[tuple[str, int, float, float]]:
    height = max_z - min_z
    width = max_x - min_x
    cx = (min_x + max_x) * 0.5
    sections = [
        ("feet_0_12", 0.0, 0.12),
        ("lower_legs_12_28", 0.12, 0.28),
        ("upper_legs_28_45", 0.28, 0.45),
        ("torso_45_66", 0.45, 0.66),
        ("chest_66_78", 0.66, 0.78),
        ("head_78_100", 0.78, 1.0),
    ]
    rows = []
    verts = [mesh.matrix_world @ vertex.co for vertex in mesh.data.vertices]
    for name, lo, hi in sections:
        selected = [v for v in verts if lo <= ((v.z - min_z) / height if height else 0.0) < hi]
        if not selected:
            rows.append((name, 0, 0.0, 0.0))
            continue
        max_abs_x = max(abs(v.x - cx) for v in selected)
        avg_abs_x = sum(abs(v.x - cx) for v in selected) / len(selected)
        rows.append((name, len(selected), max_abs_x / width if width else 0.0, avg_abs_x / width if width else 0.0))
    return rows


def add_camera(name: str, location: tuple[float, float, float], rotation: tuple[float, float, float], ortho: float) -> bpy.types.Object:
    cam_data = bpy.data.cameras.new(name)
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = location
    cam.rotation_euler = rotation
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho
    return cam


def render_camera(camera: bpy.types.Object, path: Path) -> None:
    bpy.context.scene.camera = camera
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def setup_render(mesh: bpy.types.Object, max_dim: float) -> None:
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    bpy.context.scene.eevee.taa_render_samples = 32
    bpy.context.scene.render.resolution_x = 1200
    bpy.context.scene.render.resolution_y = 1200
    bpy.context.scene.view_settings.view_transform = "Standard"
    bpy.context.scene.world = bpy.data.worlds.new("InspectionWorld")
    bpy.context.scene.world.color = (0.78, 0.82, 0.86)

    light_data = bpy.data.lights.new("InspectionKey", "AREA")
    light = bpy.data.objects.new("InspectionKey", light_data)
    bpy.context.collection.objects.link(light)
    light.location = (0.0, -max_dim * 1.8, max_dim * 1.4)
    light.rotation_euler = (math.radians(60), 0.0, 0.0)
    light_data.energy = 600
    light_data.size = max_dim * 0.8

    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh


def main() -> None:
    SCREEN_DIR.mkdir(parents=True, exist_ok=True)
    reset_scene()
    meshes = import_model()
    mesh = bake_meshes(meshes)
    min_x, max_x, min_y, max_y, min_z, max_z = bounds(mesh)
    width = max_x - min_x
    depth = max_y - min_y
    height = max_z - min_z
    cx = (min_x + max_x) * 0.5
    cy = (min_y + max_y) * 0.5
    cz = (min_z + max_z) * 0.5
    max_dim = max(width, depth, height)

    setup_render(mesh, max_dim)

    cameras = [
        ("front", (cx, cy - max_dim * 2.2, cz), (math.radians(90), 0.0, 0.0), max_dim * 1.08),
        ("side", (cx + max_dim * 2.2, cy, cz), (math.radians(90), 0.0, math.radians(90)), max_dim * 1.08),
        ("top", (cx, cy, cz + max_dim * 2.2), (0.0, 0.0, 0.0), max_dim * 1.08),
        ("quarters", (cx + max_dim * 1.4, cy - max_dim * 1.7, cz + max_dim * 0.65), (math.radians(70), 0.0, math.radians(38)), max_dim * 1.18),
    ]
    rendered = []
    for name, location, rotation, ortho in cameras:
        path = SCREEN_DIR / f"xyshz-model-{name}.png"
        render_camera(add_camera(f"XYSHZ_{name}", location, rotation, ortho), path)
        rendered.append((name, path))

    sections = vertex_sections(mesh, min_x, max_x, min_z, max_z)
    material_rows = material_counts(mesh).most_common()
    report = [
        "# XYSHZ Model Inspection",
        "",
        f"- Source: `{SOURCE}`",
        f"- Mesh objects imported: `{len(meshes)}`",
        f"- Joined mesh vertices: `{len(mesh.data.vertices)}`",
        f"- Joined mesh faces: `{len(mesh.data.polygons)}`",
        f"- Bounds X width: `{width:.4f}` from `{min_x:.4f}` to `{max_x:.4f}`",
        f"- Bounds Y depth: `{depth:.4f}` from `{min_y:.4f}` to `{max_y:.4f}`",
        f"- Bounds Z height: `{height:.4f}` from `{min_z:.4f}` to `{max_z:.4f}`",
        "",
        "## Rendered Views",
        "",
    ]
    for name, path in rendered:
        report.append(f"- {name}: `{path}`")
    report.extend([
        "",
        "## Material Face Counts",
        "",
        "| Material | Faces |",
        "|---|---:|",
    ])
    for material, count in material_rows:
        report.append(f"| `{material}` | {count} |")
    report.extend([
        "",
        "## Height Sections",
        "",
        "| Section | Vertices | Max abs X / width | Avg abs X / width |",
        "|---|---:|---:|---:|",
    ])
    for name, count, max_abs, avg_abs in sections:
        report.append(f"| `{name}` | {count} | {max_abs:.4f} | {avg_abs:.4f} |")
    report.append("")
    REPORT.write_text("\n".join(report), encoding="utf-8")
    print(f"Wrote {REPORT}")


if __name__ == "__main__":
    main()
