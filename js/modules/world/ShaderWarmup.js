import * as THREE from 'three';
import { listShaderVariants } from './ShaderVariantRegistry.js';

function buildWarmupCamera(camera) {
    const warmupCamera = camera ? camera.clone() : new THREE.PerspectiveCamera(60, 1, 1, 10000);
    warmupCamera.position.set(0, 200, 320);
    warmupCamera.lookAt(0, 0, 0);
    warmupCamera.updateMatrixWorld(true);
    return warmupCamera;
}

function normalizeWarmupSpec(spec, fallbackId, metadata = null) {
    if (!spec) return null;
    if (Array.isArray(spec)) {
        return { id: fallbackId, objects: spec, metadata };
    }
    return {
        id: spec.id || fallbackId,
        objects: spec.objects || [],
        dispose: spec.dispose || null,
        metadata: spec.metadata || metadata || null
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

function resolveVariantEntries({ registry = null, variants = [], providers = [] }) {
    if (registry) return listShaderVariants(registry);
    if (Array.isArray(variants) && variants.length > 0) return variants;
    return providers;
}

export async function validateShaderPrograms({ renderer, camera, registry = null, variants = [], providers = [] }) {
    const startedAt = performance.now();
    const report = {
        compiled: false,
        skipped: false,
        mode: typeof renderer?.compileAsync === 'function' ? 'compileAsync' : 'compile',
        variantCount: 0,
        providerCount: 0,
        objectCount: 0,
        durationMs: 0,
        variants: [],
        providers: []
    };

    if (!renderer) {
        report.skipped = true;
        report.durationMs = performance.now() - startedAt;
        return report;
    }

    const warmupScene = new THREE.Scene();
    const disposers = [];
    const variantEntries = resolveVariantEntries({ registry, variants, providers });

    for (const [index, variant] of variantEntries.entries()) {
        if (!variant) continue;
        const build = typeof variant === 'function' ? variant : variant.build;
        if (typeof build !== 'function') continue;
        const fallbackId = typeof variant === 'function'
            ? (variant.shaderProviderId || build.name || `provider-${index}`)
            : (variant.id || variant.shaderProviderId || build.name || `variant-${index}`);
        const spec = normalizeWarmupSpec(build(camera), fallbackId, variant.metadata || null);
        if (!spec) continue;

        const entryReport = {
            id: spec.id,
            objectCount: spec.objects.length,
            materials: describeWarmupMaterials(spec.objects)
        };
        if (spec.metadata) {
            entryReport.metadata = spec.metadata;
        }

        report.variantCount += 1;
        report.providerCount += 1;
        report.objectCount += spec.objects.length;
        report.variants.push(entryReport);
        report.providers.push(entryReport);

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
