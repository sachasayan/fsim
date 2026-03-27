import bpy
import json
import math
import os
import sys


def parse_cli_args(argv):
    if "--" not in argv:
        return {}

    raw = argv[argv.index("--") + 1:]
    parsed = {}
    index = 0
    while index < len(raw):
        token = raw[index]
        if token.startswith("--"):
            key = token[2:]
            value = "true"
            if index + 1 < len(raw) and not raw[index + 1].startswith("--"):
                value = raw[index + 1]
                index += 1
            parsed[key] = value
        index += 1
    return parsed


def to_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def to_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def import_asset(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    if ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=filepath)
        return
    raise RuntimeError(f"Unsupported asset type '{ext}'. Expected .glb or .gltf.")


def get_mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def deselect_all():
    bpy.ops.object.select_all(action="DESELECT")


def set_active(obj):
    bpy.context.view_layer.objects.active = obj


def triangle_count(mesh_obj):
    return sum(max(0, len(poly.vertices) - 2) for poly in mesh_obj.data.polygons)


def cleanup_mesh(mesh_obj):
    deselect_all()
    mesh_obj.select_set(True)
    set_active(mesh_obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.mesh.delete_loose()
    except Exception:
        pass
    try:
        bpy.ops.mesh.merge_by_distance(distance=0.0001)
    except Exception:
        try:
            bpy.ops.mesh.remove_doubles(threshold=0.0001)
        except Exception:
            pass
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def apply_transforms(mesh_obj):
    deselect_all()
    mesh_obj.select_set(True)
    set_active(mesh_obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def join_meshes(mesh_objects):
    if len(mesh_objects) < 2:
        return mesh_objects[0]
    deselect_all()
    for mesh_obj in mesh_objects:
        mesh_obj.select_set(True)
    set_active(mesh_objects[0])
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def add_and_apply_modifier(mesh_obj, modifier_type, name, configure_fn):
    modifier = mesh_obj.modifiers.new(name=name, type=modifier_type)
    configure_fn(modifier)
    deselect_all()
    mesh_obj.select_set(True)
    set_active(mesh_obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def ensure_parent_dir(filepath):
    directory = os.path.dirname(filepath)
    if directory:
        os.makedirs(directory, exist_ok=True)


def export_glb(filepath, mesh_objects):
    ensure_parent_dir(filepath)
    deselect_all()
    for mesh_obj in mesh_objects:
        mesh_obj.select_set(True)
    if mesh_objects:
        set_active(mesh_objects[0])
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT"
    )


def configure_decimate(modifier, ratio, decimate_method, preserve_uvs):
    modifier.decimate_type = decimate_method
    if decimate_method == "COLLAPSE":
        modifier.ratio = ratio
        try:
            modifier.use_collapse_triangulate = True
        except Exception:
            pass
        try:
            modifier.use_symmetry = False
        except Exception:
            pass
        try:
            modifier.delimit = {"UV"} if preserve_uvs else set()
        except Exception:
            pass
    elif decimate_method == "DISSOLVE":
        modifier.angle_limit = math.radians(5.0)
    else:
        raise RuntimeError(f"Unsupported decimate method '{decimate_method}'.")


def main():
    args = parse_cli_args(sys.argv)
    input_path = args.get("input")
    output_path = args.get("output")
    report_path = args.get("report")
    if not input_path or not output_path:
        raise RuntimeError("Expected --input and --output arguments.")

    target_triangles = to_int(args.get("targetTriangles"), 0)
    explicit_ratio = float(args.get("ratio", "0")) if args.get("ratio") else 0.0
    join_requested = to_bool(args.get("joinMeshes"), False)
    cleanup_requested = to_bool(args.get("cleanupLooseGeometry"), True)
    preserve_uvs = to_bool(args.get("preserveUVs"), True)
    decimate_method = args.get("decimateMethod", "COLLAPSE").upper()

    clear_scene()
    import_asset(input_path)
    mesh_objects = get_mesh_objects()
    if not mesh_objects:
        raise RuntimeError(f"No mesh objects found in '{input_path}'.")

    for mesh_obj in mesh_objects:
        apply_transforms(mesh_obj)
        if cleanup_requested:
            cleanup_mesh(mesh_obj)

    if join_requested:
        mesh_objects = [join_meshes(mesh_objects)]

    source_triangles = sum(triangle_count(mesh_obj) for mesh_obj in mesh_objects)
    ratio = explicit_ratio
    if ratio <= 0.0 and target_triangles > 0 and source_triangles > 0:
        ratio = min(1.0, max(0.01, target_triangles / float(source_triangles)))
    if ratio <= 0.0:
        ratio = 1.0

    for mesh_obj in mesh_objects:
        add_and_apply_modifier(
            mesh_obj,
            "TRIANGULATE",
            "PipelineTriangulate",
            lambda modifier: None
        )
        add_and_apply_modifier(
            mesh_obj,
            "DECIMATE",
            "PipelineDecimate",
            lambda modifier: configure_decimate(modifier, ratio, decimate_method, preserve_uvs)
        )

    mesh_objects = get_mesh_objects()
    output_triangles = sum(triangle_count(mesh_obj) for mesh_obj in mesh_objects)
    export_glb(output_path, mesh_objects)

    report = {
        "inputPath": input_path,
        "outputPath": output_path,
        "sourceTriangles": source_triangles,
        "outputTriangles": output_triangles,
        "triangleRatio": 0 if source_triangles == 0 else round(output_triangles / float(source_triangles), 4),
        "requestedTargetTriangles": target_triangles,
        "appliedRatio": round(ratio, 4),
        "joinMeshes": join_requested,
        "preserveUVs": preserve_uvs,
        "decimateMethod": decimate_method
    }
    if os.path.exists(output_path):
        report["outputBytes"] = os.path.getsize(output_path)

    if report_path:
        ensure_parent_dir(report_path)
        with open(report_path, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)

    print(json.dumps(report, indent=2))


main()
