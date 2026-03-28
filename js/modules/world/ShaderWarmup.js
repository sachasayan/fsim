// @ts-check

import * as THREE from 'three';
import { listShaderVariants } from './ShaderVariantRegistry.js';

/** @typedef {import('./ShaderVariantRegistry.js').ShaderVariantBuilder} ShaderVariantBuilder */
/** @typedef {import('./ShaderVariantRegistry.js').ShaderVariantEntry} ShaderVariantEntry */
/** @typedef {import('./ShaderVariantRegistry.js').ShaderVariantRegistry} ShaderVariantRegistry */

/**
 * @typedef {{
 *   type: string,
 *   baseCacheKey: unknown,
 *   patches: string[],
 *   descriptorId?: unknown
 * }} ShaderWarmupMaterialReport
 */

/**
 * @typedef {{
 *   id: string,
 *   system: string,
 *   objectCount: number,
 *   materials: ShaderWarmupMaterialReport[],
 *   metadata?: unknown
 * }} ShaderWarmupVariantReport
 */

/**
 * @typedef {{
 *   id: string,
 *   variantCount: number,
 *   objectCount: number,
 *   materialCount: number,
 *   variants: string[],
 *   pipelineKeys: string[]
 * }} ShaderWarmupSystemSummary
 */

/**
 * @typedef {{
 *   result: string,
 *   systemCount: number,
 *   totalVariants: number,
 *   totalObjects: number,
 *   durationMs: number,
 *   error: string | null,
 *   systems: ShaderWarmupSystemSummary[]
 * }} ShaderValidationSummary
 */

/**
 * @typedef {{
 *   compiled: boolean,
 *   skipped: boolean,
 *   mode: string,
 *   variantCount: number,
 *   objectCount: number,
 *   durationMs: number,
 *   variants: ShaderWarmupVariantReport[],
 *   error?: string | null,
 *   summary?: ShaderValidationSummary
 * }} ShaderValidationReport
 */

/**
 * @typedef {{
 *   stage: string,
 *   completed: number,
 *   total: number,
 *   ratio: number,
 *   variantCount?: number,
 *   variantId?: string
 * }} ShaderWarmupProgress
 */

/**
 * @typedef {{
 *   id: string,
 *   objects: import('three').Object3D[],
 *   dispose?: (() => void) | null,
 *   metadata?: unknown
 * }} NormalizedWarmupSpec
 */

/**
 * @param {import('three').Camera | null | undefined} camera
 */
function buildWarmupCamera(camera) {
    const warmupCamera = camera ? camera.clone() : new THREE.PerspectiveCamera(60, 1, 1, 10000);
    warmupCamera.position.set(0, 200, 320);
    warmupCamera.lookAt(0, 0, 0);
    warmupCamera.updateMatrixWorld(true);
    return warmupCamera;
}

/**
 * @param {unknown} spec
 * @param {string} fallbackId
 * @param {unknown} [metadata]
 * @returns {NormalizedWarmupSpec | null}
 */
function normalizeWarmupSpec(spec, fallbackId, metadata = null) {
    if (!spec) return null;
    if (Array.isArray(spec)) {
        return {
            id: fallbackId,
            objects: /** @type {import('three').Object3D[]} */ (spec),
            metadata
        };
    }
    const normalizedSpec = /** @type {{
        id?: string,
        objects?: import('three').Object3D[],
        dispose?: (() => void) | null,
        metadata?: unknown
    }} */ (spec);
    return {
        id: normalizedSpec.id || fallbackId,
        objects: normalizedSpec.objects || [],
        dispose: normalizedSpec.dispose || null,
        metadata: normalizedSpec.metadata || metadata || null
    };
}

/**
 * @param {import('three').Object3D[]} objects
 * @returns {ShaderWarmupMaterialReport[]}
 */
function describeWarmupMaterials(objects) {
    /** @type {ShaderWarmupMaterialReport[]} */
    const materials = [];
    const seen = new Set();

    /**
     * @param {unknown} material
     */
    function collectFromMaterial(material) {
        if (!material) return;
        const list = Array.isArray(material) ? material : [material];
        for (const entry of list) {
            const materialEntry = /** @type {{
                type?: string,
                userData?: {
                    shaderPipeline?: { baseCacheKey?: unknown, patches?: string[] },
                    shaderDescriptor?: { id?: unknown }
                }
            }} */ (entry);
            const pipeline = materialEntry.userData?.shaderPipeline;
            if (!pipeline) continue;
            const patches = Array.isArray(pipeline.patches) ? pipeline.patches : [];
            const key = `${pipeline.baseCacheKey || 'none'}::${patches.join('+')}`;
            if (seen.has(key)) continue;
            seen.add(key);
            /** @type {ShaderWarmupMaterialReport} */
            const materialReport = {
                type: materialEntry.type || 'Material',
                baseCacheKey: pipeline.baseCacheKey,
                patches: [...patches]
            };
            const descriptorId = materialEntry.userData?.shaderDescriptor?.id;
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

/**
 * @param {{ registry?: unknown, variants?: unknown[] }} [options]
 * @returns {(ShaderVariantEntry | ShaderVariantBuilder)[]}
 */
function resolveVariantEntries({ registry = null, variants = [] } = {}) {
    if (registry) return listShaderVariants(/** @type {ShaderVariantRegistry} */ (registry));
    return Array.isArray(variants)
        ? /** @type {(ShaderVariantEntry | ShaderVariantBuilder)[]} */ (variants)
        : [];
}

/**
 * @param {unknown} [metadata]
 */
function getVariantSystem(metadata = null) {
    const variantMetadata = /** @type {{ system?: string } | null | undefined} */ (metadata);
    return variantMetadata?.system || 'unknown';
}

/**
 * @param {unknown} material
 */
function getMaterialPipelineKey(material) {
    const materialReport = /** @type {{ baseCacheKey?: unknown, patches?: string[] } | null | undefined } */ (material);
    const patches = Array.isArray(materialReport?.patches) ? materialReport.patches : [];
    return `${materialReport?.baseCacheKey || 'none'}::${patches.join('+')}`;
}

/**
 * @param {ShaderValidationReport | null | undefined} report
 * @returns {ShaderValidationSummary}
 */
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

/**
 * @param {ShaderValidationReport} report
 * @param {number} startedAt
 * @returns {ShaderValidationReport}
 */
function finalizeShaderValidationReport(report, startedAt) {
    report.durationMs = performance.now() - startedAt;
    report.summary = summarizeShaderValidationReport(report);
    return report;
}

/**
 * @param {{
 *   renderer?: import('three').WebGLRenderer | null,
 *   camera?: import('three').Camera | null,
 *   registry?: unknown,
 *   variants?: unknown[],
 *   onProgress?: ((progress: ShaderWarmupProgress) => void) | null
 * }} args
 * @returns {Promise<ShaderValidationReport>}
 */
export async function validateShaderPrograms({ renderer, camera, registry = null, variants = [], onProgress = null }) {
    const startedAt = performance.now();
    /** @type {ShaderValidationReport} */
    const report = {
        compiled: false,
        skipped: false,
        mode: typeof renderer?.compileAsync === 'function' ? 'compileAsync' : 'compile',
        variantCount: 0,
        objectCount: 0,
        durationMs: 0,
        variants: []
    };

    /**
     * @param {ShaderWarmupProgress} progress
     */
    const emitProgress = (progress) => {
        if (typeof onProgress === 'function') onProgress(progress);
    };

    if (!renderer) {
        report.skipped = true;
        emitProgress({ stage: 'skipped', completed: 1, total: 1, ratio: 1 });
        return finalizeShaderValidationReport(report, startedAt);
    }

    const warmupScene = new THREE.Scene();
    /** @type {Array<() => void>} */
    const disposers = [];
    const variantEntries = resolveVariantEntries({ registry, variants });
    const totalSteps = Math.max(1, variantEntries.length + 1);
    let completedSteps = 0;

    emitProgress({
        stage: 'building',
        completed: completedSteps,
        total: totalSteps,
        ratio: completedSteps / totalSteps,
        variantCount: variantEntries.length
    });

    for (const [index, variant] of variantEntries.entries()) {
        if (!variant) continue;
        const variantEntry = /** @type {ShaderVariantEntry | ShaderVariantBuilder} */ (variant);
        const build = typeof variantEntry === 'function' ? variantEntry : variantEntry.build;
        if (typeof build !== 'function') continue;
        const fallbackId = typeof variantEntry === 'function'
            ? (variantEntry.shaderVariantId || variantEntry.shaderProviderId || build.name || `variant-${index}`)
            : (variantEntry.id || variantEntry.shaderVariantId || variantEntry.shaderProviderId || build.name || `variant-${index}`);
        const variantMetadata = typeof variantEntry === 'function' ? null : (variantEntry.metadata || null);
        const spec = normalizeWarmupSpec(build(camera), fallbackId, variantMetadata);
        if (!spec) continue;

        const system = getVariantSystem(spec.metadata);
        /** @type {ShaderWarmupVariantReport} */
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

        completedSteps += 1;
        emitProgress({
            stage: 'building',
            completed: completedSteps,
            total: totalSteps,
            ratio: completedSteps / totalSteps,
            variantId: spec.id,
            variantCount: variantEntries.length
        });
    }

    if (warmupScene.children.length === 0) {
        report.skipped = true;
        emitProgress({ stage: 'skipped', completed: totalSteps, total: totalSteps, ratio: 1 });
        return finalizeShaderValidationReport(report, startedAt);
    }

    const warmupCamera = buildWarmupCamera(camera);

    try {
        emitProgress({
            stage: 'compiling',
            completed: completedSteps,
            total: totalSteps,
            ratio: completedSteps / totalSteps,
            variantCount: variantEntries.length
        });
        if (typeof renderer.compileAsync === 'function') {
            await renderer.compileAsync(warmupScene, warmupCamera);
        } else {
            renderer.compile(warmupScene, warmupCamera);
        }
        report.compiled = true;
        completedSteps = totalSteps;
        emitProgress({
            stage: 'complete',
            completed: completedSteps,
            total: totalSteps,
            ratio: 1,
            variantCount: variantEntries.length
        });
    } finally {
        for (const dispose of disposers.reverse()) {
            dispose();
        }
    }

    return finalizeShaderValidationReport(report, startedAt);
}

/**
 * @param {Parameters<typeof validateShaderPrograms>[0]} options
 */
export async function warmupShaderPrograms(options) {
    return validateShaderPrograms(options);
}
