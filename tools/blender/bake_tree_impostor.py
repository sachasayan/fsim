import bpy
import json
import math
import mathutils
import os
import shutil
import sys
import tempfile


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


def ensure_parent_dir(path):
    os.makedirs(path, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.worlds,
    ):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def import_asset(filepath):
    bpy.ops.import_scene.gltf(filepath=filepath)


def get_mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def combined_world_bounds(mesh_objects):
    min_corner = mathutils.Vector((float("inf"), float("inf"), float("inf")))
    max_corner = mathutils.Vector((float("-inf"), float("-inf"), float("-inf")))
    corners = []
    for mesh_obj in mesh_objects:
        for corner in mesh_obj.bound_box:
            world_corner = mesh_obj.matrix_world @ mathutils.Vector(corner)
            corners.append(world_corner.copy())
            min_corner.x = min(min_corner.x, world_corner.x)
            min_corner.y = min(min_corner.y, world_corner.y)
            min_corner.z = min(min_corner.z, world_corner.z)
            max_corner.x = max(max_corner.x, world_corner.x)
            max_corner.y = max(max_corner.y, world_corner.y)
            max_corner.z = max(max_corner.z, world_corner.z)
    return min_corner, max_corner, corners


def build_octahedral_directions(grid_size):
    directions = []
    for row in range(grid_size):
        for col in range(grid_size):
            x = ((col + 0.5) / grid_size) * 2.0 - 1.0
            z = ((row + 0.5) / grid_size) * 2.0 - 1.0
            y = 1.0 - abs(x) - abs(z)
            if y < 0.0:
                old_x = x
                old_z = z
                x = (1.0 - abs(old_z)) * (1.0 if old_x >= 0.0 else -1.0)
                z = (1.0 - abs(old_x)) * (1.0 if old_z >= 0.0 else -1.0)
                y = -y
            direction = mathutils.Vector((x, y, z))
            direction.normalize()
            directions.append(direction)
    return directions


def look_at(camera_obj, target):
    direction = target - camera_obj.location
    rotation = direction.to_track_quat("-Z", "Y")
    camera_obj.rotation_euler = rotation.to_euler()


def copy_tile_pixels(source_pixels, atlas_pixels, atlas_size, frame_size, tile_x, tile_y):
    for row in range(frame_size):
        for col in range(frame_size):
            source_index = (row * frame_size + col) * 4
            atlas_col = tile_x * frame_size + col
            atlas_row = tile_y * frame_size + row
            atlas_index = (atlas_row * atlas_size + atlas_col) * 4
            atlas_pixels[atlas_index:atlas_index + 4] = source_pixels[source_index:source_index + 4]


def save_image(filepath, pixels, width, height):
    image = bpy.data.images.new(os.path.basename(filepath), width=width, height=height, alpha=True, float_buffer=False)
    image.filepath_raw = filepath
    image.file_format = "PNG"
    image.alpha_mode = "STRAIGHT"
    image.pixels = pixels
    image.save()
    bpy.data.images.remove(image)


def clamp01(value):
    return max(0.0, min(1.0, value))


def atlas_pixel_index(atlas_size, x, y):
    return (y * atlas_size + x) * 4


def decode_packed_normal(pixel):
    return mathutils.Vector((
        pixel[0] * 2.0 - 1.0,
        pixel[1] * 2.0 - 1.0,
        pixel[2] * 2.0 - 1.0,
    ))


def encode_packed_normal(vector):
    if vector.length <= 1e-6:
        vector = mathutils.Vector((0.0, 0.0, 1.0))
    else:
        vector = vector.normalized()
    return (
        clamp01(vector.x * 0.5 + 0.5),
        clamp01(vector.y * 0.5 + 0.5),
        clamp01(vector.z * 0.5 + 0.5),
    )


def smooth_atlas_tiles(atlas_pixels, frame_size, grid_size, mode="color", strength=0.14):
    atlas_size = frame_size * grid_size
    source = list(atlas_pixels)
    result = list(source)
    for tile_y in range(grid_size):
        for tile_x in range(grid_size):
            neighbors = []
            if tile_x > 0:
                neighbors.append((tile_x - 1, tile_y))
            if tile_x < grid_size - 1:
                neighbors.append((tile_x + 1, tile_y))
            if tile_y > 0:
                neighbors.append((tile_x, tile_y - 1))
            if tile_y < grid_size - 1:
                neighbors.append((tile_x, tile_y + 1))
            if not neighbors:
                continue

            base_weight = 1.0 - strength
            neighbor_weight = strength / len(neighbors)
            for row in range(frame_size):
                atlas_row = tile_y * frame_size + row
                for col in range(frame_size):
                    atlas_col = tile_x * frame_size + col
                    pixel_index = atlas_pixel_index(atlas_size, atlas_col, atlas_row)
                    base_pixel = source[pixel_index:pixel_index + 4]
                    if mode == "normal":
                        accum = decode_packed_normal(base_pixel) * base_weight
                        alpha = base_pixel[3] * base_weight
                        for neighbor_x, neighbor_y in neighbors:
                            neighbor_index = atlas_pixel_index(
                                atlas_size,
                                neighbor_x * frame_size + col,
                                neighbor_y * frame_size + row,
                            )
                            neighbor_pixel = source[neighbor_index:neighbor_index + 4]
                            accum += decode_packed_normal(neighbor_pixel) * neighbor_weight
                            alpha += neighbor_pixel[3] * neighbor_weight
                        packed = encode_packed_normal(accum)
                        result[pixel_index + 0] = packed[0]
                        result[pixel_index + 1] = packed[1]
                        result[pixel_index + 2] = packed[2]
                        result[pixel_index + 3] = clamp01(alpha)
                    else:
                        for channel in range(4):
                            accum = base_pixel[channel] * base_weight
                            for neighbor_x, neighbor_y in neighbors:
                                neighbor_index = atlas_pixel_index(
                                    atlas_size,
                                    neighbor_x * frame_size + col,
                                    neighbor_y * frame_size + row,
                                )
                                accum += source[neighbor_index + channel] * neighbor_weight
                            result[pixel_index + channel] = clamp01(accum)
    return result


def set_view_transform(scene, view_transform):
    scene.display_settings.display_device = "sRGB"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.view_settings.view_transform = view_transform


def find_output_node(node_tree):
    for node in node_tree.nodes:
        if node.type == "OUTPUT_MATERIAL" and getattr(node, "is_active_output", True):
            return node
    return node_tree.nodes.new("ShaderNodeOutputMaterial")


def find_principled_node(node_tree):
    for node in node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def connect_or_value(node_tree, source_socket, target_socket, default_value):
    if source_socket and source_socket.is_linked:
        node_tree.links.new(source_socket.links[0].from_socket, target_socket)
        return
    if source_socket is not None:
        try:
            target_socket.default_value = source_socket.default_value
            return
        except Exception:
            pass
    target_socket.default_value = default_value


def connect_alpha_mix(node_tree, output_node, emission_color_socket, alpha_socket):
    transparent = node_tree.nodes.new("ShaderNodeBsdfTransparent")
    emission = node_tree.nodes.new("ShaderNodeEmission")
    mix_shader = node_tree.nodes.new("ShaderNodeMixShader")
    emission.inputs["Strength"].default_value = 1.0

    if emission_color_socket is not None:
        node_tree.links.new(emission_color_socket, emission.inputs["Color"])
    else:
        emission.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)

    connect_or_value(node_tree, alpha_socket, mix_shader.inputs["Fac"], 1.0)
    node_tree.links.new(transparent.outputs["BSDF"], mix_shader.inputs[1])
    node_tree.links.new(emission.outputs["Emission"], mix_shader.inputs[2])
    for link in list(output_node.inputs["Surface"].links):
        node_tree.links.remove(link)
    node_tree.links.new(mix_shader.outputs["Shader"], output_node.inputs["Surface"])


def duplicate_material(original_material):
    duplicated = original_material.copy()
    duplicated.use_nodes = True
    if hasattr(duplicated, "blend_method"):
        duplicated.blend_method = "BLEND"
    if hasattr(duplicated, "shadow_method"):
        duplicated.shadow_method = "NONE"
    if hasattr(duplicated, "use_backface_culling"):
        duplicated.use_backface_culling = original_material.use_backface_culling
    return duplicated


def build_albedo_material(original_material):
    material = duplicate_material(original_material)
    node_tree = material.node_tree
    output_node = find_output_node(node_tree)
    principled = find_principled_node(node_tree)
    base_color_socket = principled.inputs["Base Color"] if principled else None
    alpha_socket = principled.inputs["Alpha"] if principled else None

    rgb_node = node_tree.nodes.new("ShaderNodeRGB")
    if principled and not base_color_socket.is_linked:
        rgb_node.outputs["Color"].default_value = base_color_socket.default_value
        color_socket = rgb_node.outputs["Color"]
    else:
        color_socket = base_color_socket.links[0].from_socket if principled and base_color_socket.is_linked else rgb_node.outputs["Color"]
    connect_alpha_mix(node_tree, output_node, color_socket, alpha_socket)
    return material


def build_normal_material(original_material):
    material = duplicate_material(original_material)
    node_tree = material.node_tree
    output_node = find_output_node(node_tree)
    principled = find_principled_node(node_tree)
    alpha_socket = principled.inputs["Alpha"] if principled else None

    geometry = node_tree.nodes.new("ShaderNodeNewGeometry")
    transform = node_tree.nodes.new("ShaderNodeVectorTransform")
    transform.vector_type = "NORMAL"
    transform.convert_from = "WORLD"
    transform.convert_to = "CAMERA"
    scale = node_tree.nodes.new("ShaderNodeVectorMath")
    scale.operation = "SCALE"
    scale.inputs[3].default_value = 0.5
    bias = node_tree.nodes.new("ShaderNodeVectorMath")
    bias.operation = "ADD"
    bias.inputs[1].default_value = (0.5, 0.5, 0.5)
    invert_z = node_tree.nodes.new("ShaderNodeVectorMath")
    invert_z.operation = "MULTIPLY"
    invert_z.inputs[1].default_value = (1.0, 1.0, -1.0)

    node_tree.links.new(geometry.outputs["Normal"], transform.inputs["Vector"])
    # Frame-local impostor normals are interpreted with +Z pointing toward the
    # capture camera. Blender camera-space normals come out with the opposite
    # forward sign for this contract, so flip Z before packing to 0..1.
    node_tree.links.new(transform.outputs["Vector"], invert_z.inputs[0])
    node_tree.links.new(invert_z.outputs["Vector"], scale.inputs[0])
    node_tree.links.new(scale.outputs["Vector"], bias.inputs[0])

    connect_alpha_mix(node_tree, output_node, bias.outputs["Vector"], alpha_socket)
    return material


def build_depth_material(original_material, depth_near, depth_far):
    material = duplicate_material(original_material)
    node_tree = material.node_tree
    output_node = find_output_node(node_tree)
    principled = find_principled_node(node_tree)
    alpha_socket = principled.inputs["Alpha"] if principled else None

    camera_data = node_tree.nodes.new("ShaderNodeCameraData")
    remap = node_tree.nodes.new("ShaderNodeMapRange")
    remap.clamp = True
    remap.inputs["From Min"].default_value = depth_near
    remap.inputs["From Max"].default_value = depth_far
    remap.inputs["To Min"].default_value = 0.0
    remap.inputs["To Max"].default_value = 1.0
    ramp = node_tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "LINEAR"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    transparent = node_tree.nodes.new("ShaderNodeBsdfTransparent")
    emission = node_tree.nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    mix_shader = node_tree.nodes.new("ShaderNodeMixShader")
    node_tree.links.new(camera_data.outputs["View Z Depth"], remap.inputs["Value"])
    node_tree.links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    node_tree.links.new(ramp.outputs["Color"], emission.inputs["Color"])
    connect_or_value(node_tree, alpha_socket, mix_shader.inputs["Fac"], 1.0)
    node_tree.links.new(transparent.outputs["BSDF"], mix_shader.inputs[1])
    node_tree.links.new(emission.outputs["Emission"], mix_shader.inputs[2])

    for link in list(output_node.inputs["Surface"].links):
        node_tree.links.remove(link)
    node_tree.links.new(mix_shader.outputs["Shader"], output_node.inputs["Surface"])
    return material


def assign_override_materials(mesh_objects, builder):
    original_materials = []
    temporary_materials = []
    for mesh_obj in mesh_objects:
        slot_materials = []
        for slot in mesh_obj.material_slots:
            slot_materials.append(slot.material)
            if slot.material:
                override_material = builder(slot.material)
                temporary_materials.append(override_material)
                slot.material = override_material
        original_materials.append(slot_materials)
    return original_materials, temporary_materials


def restore_materials(mesh_objects, original_materials, temporary_materials):
    for mesh_obj, slot_materials in zip(mesh_objects, original_materials):
        for slot, original_material in zip(mesh_obj.material_slots, slot_materials):
            slot.material = original_material
    for material in temporary_materials:
        if material.users == 0:
            bpy.data.materials.remove(material)


def render_pass_atlas(scene, camera_obj, center, capture_radius, directions, frame_size, grid_size, pass_name):
    atlas_size = frame_size * grid_size
    atlas_pixels = [0.0] * (atlas_size * atlas_size * 4)
    temp_dir = tempfile.mkdtemp(prefix=f"tree_impostor_{pass_name}_")
    try:
        for index, direction in enumerate(directions):
            tile_x = index % grid_size
            tile_y = index // grid_size
            camera_obj.location = center + direction * capture_radius
            look_at(camera_obj, center)

            render_path = os.path.join(temp_dir, f"{pass_name}_{index:02d}.png")
            scene.render.filepath = render_path
            bpy.ops.render.render(write_still=True)

            render_image = bpy.data.images.load(render_path)
            copy_tile_pixels(list(render_image.pixels[:]), atlas_pixels, atlas_size, frame_size, tile_x, tile_y)
            bpy.data.images.remove(render_image)
        return atlas_pixels
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    args = parse_cli_args(sys.argv)
    input_path = args.get("input")
    output_dir = args.get("outputDir")
    frame_size = max(64, int(args.get("frameSize", "256")))
    grid_size = max(1, int(args.get("gridSize", "4")))
    if not input_path or not output_dir:
        raise RuntimeError("Expected --input and --outputDir.")

    ensure_parent_dir(output_dir)
    clear_scene()
    import_asset(input_path)

    mesh_objects = get_mesh_objects()
    if not mesh_objects:
        raise RuntimeError(f"No mesh objects found in '{input_path}'.")

    min_corner, max_corner, corners = combined_world_bounds(mesh_objects)
    center = (min_corner + max_corner) * 0.5
    size = max_corner - min_corner
    model_radius = max((corner - center).length for corner in corners) if corners else 1.0
    capture_radius = max(size.x, size.y, size.z) * 1.25
    depth_near = max(0.0001, capture_radius - model_radius)
    depth_far = capture_radius + model_radius
    atlas_size = frame_size * grid_size
    directions = build_octahedral_directions(grid_size)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = frame_size
    scene.render.resolution_y = frame_size
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.eevee.taa_render_samples = 1

    world = bpy.data.worlds.new("TreeImpostorWorld")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.0, 0.0, 0.0, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.0

    camera_data = bpy.data.cameras.new("TreeImpostorCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(size.x, size.z, size.y) * 1.9
    camera_obj = bpy.data.objects.new("TreeImpostorCamera", camera_data)
    scene.collection.objects.link(camera_obj)
    scene.camera = camera_obj

    set_view_transform(scene, "Standard")
    original_materials, temporary_materials = assign_override_materials(mesh_objects, build_albedo_material)
    try:
        albedo_pixels = render_pass_atlas(scene, camera_obj, center, capture_radius, directions, frame_size, grid_size, "albedo")
    finally:
        restore_materials(mesh_objects, original_materials, temporary_materials)
    albedo_pixels = smooth_atlas_tiles(albedo_pixels, frame_size, grid_size, mode="color", strength=0.12)

    set_view_transform(scene, "Raw")
    original_materials, temporary_materials = assign_override_materials(mesh_objects, build_normal_material)
    try:
        normal_pixels = render_pass_atlas(scene, camera_obj, center, capture_radius, directions, frame_size, grid_size, "normal")
    finally:
        restore_materials(mesh_objects, original_materials, temporary_materials)
    normal_pixels = smooth_atlas_tiles(normal_pixels, frame_size, grid_size, mode="normal", strength=0.2)

    original_materials, temporary_materials = assign_override_materials(
        mesh_objects,
        lambda material: build_depth_material(material, depth_near, depth_far),
    )
    try:
        depth_pixels = render_pass_atlas(scene, camera_obj, center, capture_radius, directions, frame_size, grid_size, "depth")
    finally:
        restore_materials(mesh_objects, original_materials, temporary_materials)
    depth_pixels = smooth_atlas_tiles(depth_pixels, frame_size, grid_size, mode="color", strength=0.1)

    albedo_path = os.path.join(output_dir, "albedo.png")
    normal_path = os.path.join(output_dir, "normal.png")
    depth_path = os.path.join(output_dir, "depth.png")
    metadata_path = os.path.join(output_dir, "metadata.json")

    save_image(albedo_path, albedo_pixels, atlas_size, atlas_size)
    save_image(normal_path, normal_pixels, atlas_size, atlas_size)
    save_image(depth_path, depth_pixels, atlas_size, atlas_size)

    metadata = {
        "version": 2,
        "frameSize": frame_size,
        "atlasWidth": atlas_size,
        "atlasHeight": atlas_size,
        "frameCount": len(directions),
        "grid": {
            "cols": grid_size,
            "rows": grid_size,
        },
        "boundsMin": [min_corner.x, min_corner.y, min_corner.z],
        "boundsMax": [max_corner.x, max_corner.y, max_corner.z],
        "pivot": [center.x, min_corner.y, center.z],
        "captureRadius": capture_radius,
        "normalSpace": "frame-local",
        "depthEncoding": "orthographic-normalized",
        "depthRange": {
            "near": depth_near,
            "far": depth_far,
        },
        "viewBlendMode": "grid-bilinear",
        "directions": [[direction.x, direction.y, direction.z] for direction in directions],
    }
    with open(metadata_path, "w", encoding="utf8") as handle:
        json.dump(metadata, handle, indent=2)


if __name__ == "__main__":
    main()
