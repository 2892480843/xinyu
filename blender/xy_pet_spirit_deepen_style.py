from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "frontend" / "public" / "models" / "xy_pet_spirit_lighthouse.glb"

STYLE = {
    "XYPS_warm_pearl_body": {"base": (0.62, 0.70, 0.68, 1.0), "roughness": 0.82},
    "XYPS_ivory_cape": {"base": (0.76, 0.72, 0.62, 1.0), "roughness": 0.88},
    "XYPS_cape_shadow": {"base": (0.38, 0.58, 0.62, 1.0), "roughness": 0.86},
    "XYPS_misty_translucent_blue": {"base": (0.34, 0.65, 0.72, 0.58), "alpha": 0.58, "roughness": 0.5},
    "XYPS_brushed_shell_gold": {"base": (0.82, 0.54, 0.22, 1.0), "metallic": 0.25, "roughness": 0.46},
    "XYPS_inky_eye": {"base": (0.04, 0.12, 0.18, 1.0), "roughness": 0.42},
    "XYPS_eye_blue_glint": {"base": (0.18, 0.48, 0.72, 1.0), "emissive": (0.04, 0.22, 0.36, 1.0), "emissive_strength": 0.8},
    "XYPSD_thin_gold_light_beam": {"base": (0.95, 0.62, 0.22, 0.72), "alpha": 0.72, "emissive": (1.0, 0.58, 0.18, 1.0), "emissive_strength": 1.8},
}


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def set_input(node, names, value):
    for name in names:
        socket = node.inputs.get(name)
        if socket:
            socket.default_value = value


def tune_material(mat, spec):
    mat.diffuse_color = spec["base"]
    if "alpha" in spec:
        mat.use_nodes = True
        mat.blend_method = "BLEND"
        mat.use_screen_refraction = True
        mat.show_transparent_back = True
    if not mat.use_nodes:
        return
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        return
    set_input(bsdf, ["Base Color"], spec["base"])
    if "alpha" in spec:
        set_input(bsdf, ["Alpha"], spec["alpha"])
    if "metallic" in spec:
        set_input(bsdf, ["Metallic"], spec["metallic"])
    if "roughness" in spec:
        set_input(bsdf, ["Roughness"], spec["roughness"])
    if "emissive" in spec:
        set_input(bsdf, ["Emission Color", "Emission"], spec["emissive"])
    if "emissive_strength" in spec:
        set_input(bsdf, ["Emission Strength"], spec["emissive_strength"])


def add_deeper_outline():
    outline_mat = bpy.data.materials.new("XYPS_deeper_soft_outline")
    outline_mat.diffuse_color = (0.16, 0.28, 0.31, 1.0)
    outline_mat.use_nodes = True
    bsdf = outline_mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        set_input(bsdf, ["Base Color"], outline_mat.diffuse_color)
        set_input(bsdf, ["Roughness"], 0.95)
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH":
            continue
        name = ob.name.lower()
        if any(key in name for key in ["body", "cape", "shell_crest", "ear_fin_shell"]):
            ob.data.materials.append(outline_mat)


def main():
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(MODEL))
    for mat in bpy.data.materials:
        spec = STYLE.get(mat.name)
        if spec:
            tune_material(mat, spec)
    add_deeper_outline()
    bpy.ops.export_scene.gltf(
        filepath=str(MODEL),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
    )
    print("Deepened pet spirit materials:", sorted(STYLE))


if __name__ == "__main__":
    main()
