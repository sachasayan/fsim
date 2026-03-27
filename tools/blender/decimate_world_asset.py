import bpy
import json
import math
import mathutils
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


def combined_world_bounds(mesh_objects):
    min_x = float("inf")
    min_y = float("inf")
    min_z = float("inf")
    max_x = float("-inf")
    max_y = float("-inf")
    max_z = float("-inf")

    for mesh_obj in mesh_objects:
        matrix = mesh_obj.matrix_world
        for corner in mesh_obj.bound_box:
            world_corner = matrix @ mathutils.Vector(corner)
            min_x = min(min_x, world_corner.x)
            min_y = min(min_y, world_corner.y)
            min_z = min(min_z, world_corner.z)
            max_x = max(max_x, world_corner.x)
            max_y = max(max_y, world_corner.y)
            max_z = max(max_z, world_corner.z)

    if min_x == float("inf"):
        return None

    return {
        "minX": min_x,
        "minY": min_y,
        "minZ": min_z,
        "maxX": max_x,
        "maxY": max_y,
        "maxZ": max_z,
        "width": max_x - min_x,
        "length": max_y - min_y,
        "height": max_z - min_z
    }


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


def scale_scene_objects(objects, scale_factor):
    if scale_factor == 1.0:
        return
    deselect_all()
    for obj in objects:
        obj.select_set(True)
    bpy.ops.transform.resize(value=(scale_factor, scale_factor, scale_factor))


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
    export_kwargs = {
        "filepath": filepath,
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": True,
        "export_yup": True,
        "export_texcoords": True,
        "export_normals": True,
        "export_materials": "EXPORT",
        "export_image_format": "WEBP",
        "export_image_quality": 70,
        "export_draco_mesh_compression_enable": True,
        "export_draco_mesh_compression_level": 6,
        "export_draco_position_quantization": 14,
        "export_draco_normal_quantization": 10,
        "export_draco_texcoord_quantization": 12,
        "export_draco_color_quantization": 10,
        "export_draco_generic_quantization": 12
    }
    bpy.ops.export_scene.gltf(**export_kwargs)


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
    target_height_meters = float(args.get("targetHeightMeters", "0")) if args.get("targetHeightMeters") else 0.0
    join_requested = to_bool(args.get("joinMeshes"), False)
    cleanup_requested = to_bool(args.get("cleanupLooseGeometry"), True)
    preserve_uvs = to_bool(args.get("preserveUVs"), True)
    decimate_method = args.get("decimateMethod", "COLLAPSE").upper()

    clear_scene()
    import_asset(input_path)
    mesh_objects = get_mesh_objects()
    if not mesh_objects:
        raise RuntimeError(f"No mesh objects found in '{input_path}'.")

    source_bounds = combined_world_bounds(mesh_objects)
    source_height = source_bounds["height"] if source_bounds else 0.0
    applied_scale_factor = 1.0
    if target_height_meters > 0.0 and source_height > 0.0:
        applied_scale_factor = target_height_meters / source_height
        scale_scene_objects(mesh_objects, applied_scale_factor)
        mesh_objects = get_mesh_objects()

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
    output_bounds = combined_world_bounds(mesh_objects)
    export_glb(output_path, mesh_objects)

    report = {
        "inputPath": input_path,
        "outputPath": output_path,
        "sourceTriangles": source_triangles,
        "outputTriangles": output_triangles,
        "triangleRatio": 0 if source_triangles == 0 else round(output_triangles / float(source_triangles), 4),
        "requestedTargetTriangles": target_triangles,
        "appliedRatio": round(ratio, 4),
        "requestedTargetHeightMeters": round(target_height_meters, 4) if target_height_meters > 0.0 else None,
        "sourceHeightMeters": round(source_height, 4) if source_height > 0.0 else None,
        "sourceWidthMeters": round(source_bounds["width"], 4) if source_bounds else None,
        "sourceLengthMeters": round(source_bounds["length"], 4) if source_bounds else None,
        "appliedScaleFactor": round(applied_scale_factor, 6),
        "outputHeightMeters": round(output_bounds["height"], 4) if output_bounds else None,
        "outputWidthMeters": round(output_bounds["width"], 4) if output_bounds else None,
        "outputLengthMeters": round(output_bounds["length"], 4) if output_bounds else None,
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
