import * as THREE from 'three';

function buildWarmupCamera(camera) {
    const warmupCamera = camera ? camera.clone() : new THREE.PerspectiveCamera(60, 1, 1, 10000);
    warmupCamera.position.set(0, 200, 320);
    warmupCamera.lookAt(0, 0, 0);
    warmupCamera.updateMatrixWorld(true);
    return warmupCamera;
}

export async function warmupShaderPrograms({ renderer, camera, providers = [] }) {
    if (!renderer) return;

    const warmupScene = new THREE.Scene();
    const disposers = [];

    for (const provider of providers) {
        if (typeof provider !== 'function') continue;
        const spec = provider(camera);
        if (!spec) continue;

        const { objects = [], dispose } = Array.isArray(spec) ? { objects: spec } : spec;
        for (const object of objects) {
            warmupScene.add(object);
        }
        if (typeof dispose === 'function') {
            disposers.push(dispose);
        }
    }

    if (warmupScene.children.length === 0) return;

    const warmupCamera = buildWarmupCamera(camera);

    try {
        if (typeof renderer.compileAsync === 'function') {
            await renderer.compileAsync(warmupScene, warmupCamera);
        } else {
            renderer.compile(warmupScene, warmupCamera);
        }
    } finally {
        for (const dispose of disposers.reverse()) {
            dispose();
        }
    }
}
