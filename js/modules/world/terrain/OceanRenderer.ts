// @ts-check

import * as THREE from 'three';

function createOceanPatchGeometry(size: number, segments: number) {
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
}

export function createOceanRenderer({
    scene,
    material,
    SEA_LEVEL,
    CHUNK_SIZE,
    isWaterSurfaceVisible
}: {
    scene: THREE.Scene;
    material: THREE.Material;
    SEA_LEVEL: number;
    CHUNK_SIZE: number;
    isWaterSurfaceVisible: () => boolean;
}) {
    // This is the first extraction step: a constant-cost ocean underlay that
    // sits below the shoreline-aware leaf water meshes instead of replacing them.
    const group = new THREE.Group();
    group.name = 'OceanRenderer';

    const patchSpecs = [
        { size: CHUNK_SIZE * 8, segments: 24, snap: CHUNK_SIZE * 0.25, depthOffset: 0.2 },
        { size: CHUNK_SIZE * 24, segments: 18, snap: CHUNK_SIZE, depthOffset: 0.45 },
        { size: CHUNK_SIZE * 72, segments: 12, snap: CHUNK_SIZE * 3, depthOffset: 0.9 }
    ];

    const patches = patchSpecs.map((spec) => {
        const mesh = new THREE.Mesh(createOceanPatchGeometry(spec.size, spec.segments), material);
        mesh.frustumCulled = false;
        mesh.visible = true;
        mesh.position.y = SEA_LEVEL - spec.depthOffset;
        group.add(mesh);
        return {
            ...spec,
            mesh
        };
    });

    scene.add(group);

    function update(cameraPosition: THREE.Vector3 | null | undefined) {
        const visible = isWaterSurfaceVisible();
        for (const patch of patches) {
            patch.mesh.visible = visible;
            if (!cameraPosition) continue;
            patch.mesh.position.x = Math.round(cameraPosition.x / patch.snap) * patch.snap;
            patch.mesh.position.z = Math.round(cameraPosition.z / patch.snap) * patch.snap;
        }
    }

    function getDiagnostics() {
        const uniqueMaterials = new Set();
        let activeMeshes = 0;
        let visibleMeshes = 0;
        let vertices = 0;
        let triangles = 0;
        for (const patch of patches) {
            activeMeshes += 1;
            if (patch.mesh.visible) visibleMeshes += 1;
            if (patch.mesh.material) uniqueMaterials.add(patch.mesh.material);
            vertices += patch.mesh.geometry?.attributes?.position?.count || 0;
            triangles += Math.floor((patch.mesh.geometry?.index?.count || 0) / 3);
        }
        return {
            activeOceanWaterMeshes: activeMeshes,
            visibleOceanWaterMeshes: visibleMeshes,
            oceanWaterVertices: vertices,
            oceanWaterTriangles: triangles,
            uniqueOceanWaterMaterials: uniqueMaterials.size
        };
    }

    function dispose() {
        scene.remove(group);
        for (const patch of patches) {
            patch.mesh.geometry?.dispose?.();
        }
    }

    return {
        update,
        dispose,
        getDiagnostics
    };
}
