import * as THREE from 'three';

function buildWarmupCamera(camera) {
    const warmupCamera = camera ? camera.clone() : new THREE.PerspectiveCamera(60, 1, 1, 10000);
    warmupCamera.position.set(0, 200, 320);
    warmupCamera.lookAt(0, 0, 0);
    warmupCamera.updateMatrixWorld(true);
    return warmupCamera;
}

function normalizeWarmupSpec(spec, fallbackId) {
    if (!spec) return null;
    if (Array.isArray(spec)) {
        return { id: fallbackId, objects: spec };
    }
    return {
        id: spec.id || fallbackId,
        objects: spec.objects || [],
        dispose: spec.dispose || null
    };
}

function describeWarmupMaterials(objects) {
    const materials = [];
    const seen = new Set();

    function collectFromMaterial(material) {
        if (!material) return;
        const list = Array.isArray(material) ? material : [material];
        for (const entry of list) {
            const pipeline = entry?.userData?.shaderPipeline;
            if (!pipeline) continue;
            const key = `${pipeline.baseCacheKey || 'none'}::${pipeline.patches.join('+')}`;
            if (seen.has(key)) continue;
            seen.add(key);
            materials.push({
                type: entry.type || 'Material',
                baseCacheKey: pipeline.baseCacheKey,
                patches: [...pipeline.patches]
            });
        }
    }

    for (const object of objects) {
        if (!object) continue;
        if (typeof object.traverse === 'function') {
            object.traverse((child) => collectFromMaterial(child.material));
        } else {
            collectFromMaterial(object.material);
        }
    }

    return materials;
}

export async function validateShaderPrograms({ renderer, camera, providers = [] }) {
    const startedAt = performance.now();
    const report = {
        compiled: false,
        skipped: false,
        mode: typeof renderer?.compileAsync === 'function' ? 'compileAsync' : 'compile',
        providerCount: 0,
        objectCount: 0,
        durationMs: 0,
        providers: []
    };

    if (!renderer) {
        report.skipped = true;
        report.durationMs = performance.now() - startedAt;
        return report;
    }

    const warmupScene = new THREE.Scene();
    const disposers = [];

    for (const [index, provider] of providers.entries()) {
        if (typeof provider !== 'function') continue;
        const fallbackId = provider.shaderProviderId || provider.name || `provider-${index}`;
        const spec = normalizeWarmupSpec(provider(camera), fallbackId);
        if (!spec) continue;

        report.providerCount += 1;
        report.objectCount += spec.objects.length;
        report.providers.push({
            id: spec.id,
            objectCount: spec.objects.length,
            materials: describeWarmupMaterials(spec.objects)
        });

        for (const object of spec.objects) {
            warmupScene.add(object);
        }
        if (typeof spec.dispose === 'function') {
            disposers.push(spec.dispose);
        }
    }

    if (warmupScene.children.length === 0) {
        report.skipped = true;
        report.durationMs = performance.now() - startedAt;
        return report;
    }

    const warmupCamera = buildWarmupCamera(camera);

    try {
        if (typeof renderer.compileAsync === 'function') {
            await renderer.compileAsync(warmupScene, warmupCamera);
        } else {
            renderer.compile(warmupScene, warmupCamera);
        }
        report.compiled = true;
        report.durationMs = performance.now() - startedAt;
    } finally {
        for (const dispose of disposers.reverse()) {
            dispose();
        }
    }

    return report;
}

export async function warmupShaderPrograms(options) {
    return validateShaderPrograms(options);
}
