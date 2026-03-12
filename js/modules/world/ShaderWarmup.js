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
            const materialReport = {
                type: entry.type || 'Material',
                baseCacheKey: pipeline.baseCacheKey,
                patches: [...pipeline.patches]
            };
            const descriptorId = entry?.userData?.shaderDescriptor?.id;
            if (descriptorId) {
                materialReport.descriptorId = descriptorId;
            }
            materials.push(materialReport);
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

function resolveVariantEntries({ registry = null, variants = [] }) {
    if (registry) return listShaderVariants(registry);
    return Array.isArray(variants) ? variants : [];
}

function getVariantSystem(metadata = null) {
    return metadata?.system || 'unknown';
}

function getMaterialPipelineKey(material) {
    const patches = Array.isArray(material?.patches) ? material.patches : [];
    return `${material?.baseCacheKey || 'none'}::${patches.join('+')}`;
}

export function summarizeShaderValidationReport(report) {
    const variants = Array.isArray(report?.variants) ? report.variants : [];
    const systems = new Map();

    for (const variant of variants) {
        const systemId = variant?.system || getVariantSystem(variant?.metadata);
        let systemSummary = systems.get(systemId);
        if (!systemSummary) {
            systemSummary = {
                id: systemId,
                variantCount: 0,
                objectCount: 0,
                materialCount: 0,
                variants: [],
                pipelineKeys: new Set()
            };
            systems.set(systemId, systemSummary);
        }

        systemSummary.variantCount += 1;
        systemSummary.objectCount += variant?.objectCount || 0;
        systemSummary.materialCount += Array.isArray(variant?.materials) ? variant.materials.length : 0;
        if (variant?.id) {
            systemSummary.variants.push(variant.id);
        }

        for (const material of variant?.materials || []) {
            systemSummary.pipelineKeys.add(getMaterialPipelineKey(material));
        }
    }

    return {
        result: report?.error ? 'error' : (report?.skipped ? 'skipped' : (report?.compiled ? 'compiled' : 'pending')),
        systemCount: systems.size,
        totalVariants: typeof report?.variantCount === 'number' ? report.variantCount : variants.length,
        totalObjects: typeof report?.objectCount === 'number' ? report.objectCount : 0,
        durationMs: typeof report?.durationMs === 'number' ? report.durationMs : 0,
        error: report?.error || null,
        systems: Array.from(systems.values()).map((entry) => ({
            id: entry.id,
            variantCount: entry.variantCount,
            objectCount: entry.objectCount,
            materialCount: entry.materialCount,
            variants: entry.variants,
            pipelineKeys: Array.from(entry.pipelineKeys)
        }))
    };
}

function finalizeShaderValidationReport(report, startedAt) {
    report.durationMs = performance.now() - startedAt;
    report.summary = summarizeShaderValidationReport(report);
    return report;
}

export async function validateShaderPrograms({ renderer, camera, registry = null, variants = [] }) {
    const startedAt = performance.now();
    const report = {
        compiled: false,
        skipped: false,
        mode: typeof renderer?.compileAsync === 'function' ? 'compileAsync' : 'compile',
        variantCount: 0,
        objectCount: 0,
        durationMs: 0,
        variants: []
    };

    if (!renderer) {
        report.skipped = true;
        return finalizeShaderValidationReport(report, startedAt);
    }

    const warmupScene = new THREE.Scene();
    const disposers = [];
    const variantEntries = resolveVariantEntries({ registry, variants });

    for (const [index, variant] of variantEntries.entries()) {
        if (!variant) continue;
        const build = typeof variant === 'function' ? variant : variant.build;
        if (typeof build !== 'function') continue;
        const fallbackId = typeof variant === 'function'
            ? (variant.shaderVariantId || variant.shaderProviderId || build.name || `variant-${index}`)
            : (variant.id || variant.shaderVariantId || variant.shaderProviderId || build.name || `variant-${index}`);
        const spec = normalizeWarmupSpec(build(camera), fallbackId, variant.metadata || null);
        if (!spec) continue;

        const system = getVariantSystem(spec.metadata);
        const entryReport = {
            id: spec.id,
            system,
            objectCount: spec.objects.length,
            materials: describeWarmupMaterials(spec.objects)
        };
        if (spec.metadata) {
            entryReport.metadata = spec.metadata;
        }

        report.variantCount += 1;
        report.objectCount += spec.objects.length;
        report.variants.push(entryReport);

        for (const object of spec.objects) {
            warmupScene.add(object);
        }
        if (typeof spec.dispose === 'function') {
            disposers.push(spec.dispose);
        }
    }

    if (warmupScene.children.length === 0) {
        report.skipped = true;
        return finalizeShaderValidationReport(report, startedAt);
    }

    const warmupCamera = buildWarmupCamera(camera);

    try {
        if (typeof renderer.compileAsync === 'function') {
            await renderer.compileAsync(warmupScene, warmupCamera);
        } else {
            renderer.compile(warmupScene, warmupCamera);
        }
        report.compiled = true;
    } finally {
        for (const dispose of disposers.reverse()) {
            dispose();
        }
    }

    return finalizeShaderValidationReport(report, startedAt);
}

export async function warmupShaderPrograms(options) {
    return validateShaderPrograms(options);
}
