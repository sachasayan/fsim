// @ts-check

import * as THREE from 'three';

function createLeafWaterOverlayGeometry() {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const colorArray = new Float32Array(geometry.attributes.position.count * 3);
    colorArray.fill(1);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
    return geometry;
}

export function createLeafWaterOverlayRenderer({
    scene,
    material,
    SEA_LEVEL,
    getActiveLeaves,
    isWaterSurfaceVisible,
    shouldCreateLeafWaterSurface
}) {
    const geometry = createLeafWaterOverlayGeometry();
    const group = new THREE.Group();
    group.name = 'LeafWaterOverlayRenderer';
    scene.add(group);

    let mesh = null;
    let capacity = 0;
    let activeCount = 0;
    let visibleCount = 0;
    let dirty = true;
    let lastWaterVisible = null;

    function ensureMeshCapacity(nextCapacity) {
        if (mesh && capacity >= nextCapacity) return;
        const resolvedCapacity = Math.max(16, nextCapacity);
        if (mesh) {
            group.remove(mesh);
            mesh.dispose?.();
        }
        mesh = new THREE.InstancedMesh(geometry, material, resolvedCapacity);
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.geometry.setAttribute('instanceWaterBoundsMin', new THREE.InstancedBufferAttribute(new Float32Array(resolvedCapacity * 2), 2));
        mesh.geometry.setAttribute('instanceWaterBoundsSize', new THREE.InstancedBufferAttribute(new Float32Array(resolvedCapacity * 2), 2));
        mesh.geometry.setAttribute('instanceWaterDepthUvMin', new THREE.InstancedBufferAttribute(new Float32Array(resolvedCapacity * 2), 2));
        mesh.geometry.setAttribute('instanceWaterDepthUvMax', new THREE.InstancedBufferAttribute(new Float32Array(resolvedCapacity * 2), 2));
        group.add(mesh);
        capacity = resolvedCapacity;
    }

    const tempMatrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempScale = new THREE.Vector3();
    const tempQuaternion = new THREE.Quaternion();

    function markDirty() {
        dirty = true;
    }

    function update() {
        const waterVisible = isWaterSurfaceVisible();
        if (!dirty && lastWaterVisible === waterVisible) return;

        const candidates = [];
        for (const leafState of getActiveLeaves()) {
            if (leafState?.retired) continue;
            if (!leafState?.waterDepthBinding?.texture || !leafState?.hasWater || !leafState?.bounds) continue;
            if (!shouldCreateLeafWaterSurface(leafState)) continue;
            candidates.push(leafState);
        }

        ensureMeshCapacity(candidates.length);
        activeCount = candidates.length;
        visibleCount = waterVisible ? candidates.length : 0;

        if (!mesh) return;

        // The overlay is shared across all shoreline leaves so sea-level water
        // stays at a near-constant material/draw-call count even while terrain
        // leaf ownership changes underneath it.
        const boundsMinAttr = mesh.geometry.getAttribute('instanceWaterBoundsMin');
        const boundsSizeAttr = mesh.geometry.getAttribute('instanceWaterBoundsSize');
        const depthUvMinAttr = mesh.geometry.getAttribute('instanceWaterDepthUvMin');
        const depthUvMaxAttr = mesh.geometry.getAttribute('instanceWaterDepthUvMax');

        tempQuaternion.identity();
        for (let index = 0; index < candidates.length; index += 1) {
            const leafState = candidates[index];
            const bounds = leafState.bounds;
            const sizeX = Math.max(1e-3, bounds.maxX - bounds.minX);
            const sizeZ = Math.max(1e-3, bounds.maxZ - bounds.minZ);
            tempPosition.set((bounds.minX + bounds.maxX) * 0.5, SEA_LEVEL, (bounds.minZ + bounds.maxZ) * 0.5);
            tempScale.set(sizeX, 1, sizeZ);
            tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
            mesh.setMatrixAt(index, tempMatrix);

            boundsMinAttr.setXY(index, bounds.minX, bounds.minZ);
            boundsSizeAttr.setXY(index, sizeX, sizeZ);
            depthUvMinAttr.setXY(index, leafState.waterDepthBinding.uvMin.x, leafState.waterDepthBinding.uvMin.y);
            depthUvMaxAttr.setXY(index, leafState.waterDepthBinding.uvMax.x, leafState.waterDepthBinding.uvMax.y);
        }

        mesh.count = candidates.length;
        mesh.visible = waterVisible && candidates.length > 0;
        mesh.instanceMatrix.needsUpdate = true;
        boundsMinAttr.needsUpdate = true;
        boundsSizeAttr.needsUpdate = true;
        depthUvMinAttr.needsUpdate = true;
        depthUvMaxAttr.needsUpdate = true;
        dirty = false;
        lastWaterVisible = waterVisible;
    }

    function getDiagnostics() {
        return {
            activeLeafWaterMeshes: activeCount,
            visibleLeafWaterMeshes: visibleCount,
            activeLeafWaterOverlayRenderers: mesh ? 1 : 0,
            activeLeafWaterVertices: activeCount * 4,
            activeLeafWaterTriangles: activeCount * 2
        };
    }

    return {
        markDirty,
        update,
        getDiagnostics
    };
}
