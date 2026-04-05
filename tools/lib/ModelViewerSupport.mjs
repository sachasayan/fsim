import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    DEFAULT_MANIFEST_PATH,
    DEFAULT_TARGET_HEIGHTS_PATH,
    buildWorldAssetCatalog,
    buildWorldAssetDetail,
    loadWorldAssetManifest,
    loadWorldAssetTargetHeights
} from './WorldAssetCatalog.mjs';

export function timestampId() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate())
    ].join('') + '-' + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('');
}

export function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

export function sanitizeAssetName(assetName) {
    return String(assetName || '')
        .trim()
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '');
}

export function getModelViewerCatalog(root, options = {}) {
    return buildWorldAssetCatalog(root, options);
}

export function getModelViewerAssetDetail(root, assetName, options = {}) {
    return buildWorldAssetDetail(root, assetName, options);
}

export function createDraftOverrideInputs(root, assetName, {
    manifestPath = DEFAULT_MANIFEST_PATH,
    targetHeightsPath = DEFAULT_TARGET_HEIGHTS_PATH,
    processOverrides = {},
    impostorOverrides = {}
} = {}) {
    const { absolutePath: manifestAbsolutePath, manifest } = loadWorldAssetManifest(root, manifestPath);
    const { absolutePath: targetHeightsAbsolutePath, targetHeights } = loadWorldAssetTargetHeights(root, targetHeightsPath);
    const existingAsset = manifest.assets?.[assetName];
    if (!existingAsset) {
        throw new Error(`Unknown asset '${assetName}'.`);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsim-model-viewer-'));
    const assetConfig = structuredClone(existingAsset);
    const nextManifest = structuredClone(manifest);
    const nextTargetHeights = { ...targetHeights };

    const assetFieldOverrides = {
        targetTriangles: processOverrides.targetTriangles,
        joinMeshes: processOverrides.joinMeshes,
        cleanupLooseGeometry: processOverrides.cleanupLooseGeometry,
        preserveUVs: processOverrides.preserveUVs,
        decimateMethod: processOverrides.decimateMethod,
        sizeBudgetBytes: processOverrides.sizeBudgetBytes
    };
    for (const [key, value] of Object.entries(assetFieldOverrides)) {
        if (value !== undefined) {
            assetConfig[key] = value;
        }
    }
    if (processOverrides.targetHeightMeters !== undefined) {
        nextTargetHeights[assetName] = processOverrides.targetHeightMeters;
    }

    if (assetConfig.impostorBake?.enabled) {
        assetConfig.impostorBake = {
            ...assetConfig.impostorBake,
            ...Object.fromEntries(Object.entries({
                outputDir: impostorOverrides.outputDir,
                gridSize: impostorOverrides.gridSize,
                frameSize: impostorOverrides.frameSize
            }).filter(([, value]) => value !== undefined))
        };
    }

    nextManifest.assets = {
        [assetName]: assetConfig
    };

    const manifestFilePath = path.join(tempDir, path.basename(manifestAbsolutePath));
    const targetHeightsFilePath = path.join(tempDir, path.basename(targetHeightsAbsolutePath));
    fs.writeFileSync(manifestFilePath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');
    fs.writeFileSync(targetHeightsFilePath, `${JSON.stringify(nextTargetHeights, null, 2)}\n`, 'utf8');

    return {
        tempDir,
        manifestFilePath,
        targetHeightsFilePath,
        cleanup() {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    };
}

export function createProcessAssetJobSpec(root, {
    assetName,
    blenderPath,
    dryRun = false,
    force = true,
    stage = false,
    manifestPath = DEFAULT_MANIFEST_PATH,
    targetHeightsPath = DEFAULT_TARGET_HEIGHTS_PATH,
    processOverrides = {},
    impostorOverrides = {}
} = {}) {
    const overrides = createDraftOverrideInputs(root, assetName, {
        manifestPath,
        targetHeightsPath,
        processOverrides,
        impostorOverrides
    });
    const args = [
        'tools/process-world-asset.mjs',
        '--asset',
        assetName,
        '--manifest',
        overrides.manifestFilePath,
        '--target-heights',
        overrides.targetHeightsFilePath
    ];
    if (blenderPath) args.push('--blender', blenderPath);
    if (force) args.push('--force');
    if (stage) args.push('--stage');
    if (dryRun) args.push('--dry-run');
    return {
        command: process.execPath,
        args,
        cwd: root,
        cleanup: overrides.cleanup
    };
}

export function createBakeImpostorJobSpec(root, {
    assetName,
    blenderPath,
    dryRun = false,
    force = true,
    manifestPath = DEFAULT_MANIFEST_PATH,
    targetHeightsPath = DEFAULT_TARGET_HEIGHTS_PATH,
    processOverrides = {},
    impostorOverrides = {}
} = {}) {
    const overrides = createDraftOverrideInputs(root, assetName, {
        manifestPath,
        targetHeightsPath,
        processOverrides,
        impostorOverrides
    });
    const args = [
        'tools/bake-tree-impostor.mjs',
        '--asset',
        assetName,
        '--manifest',
        overrides.manifestFilePath
    ];
    if (blenderPath) args.push('--blender', blenderPath);
    if (force) args.push('--force');
    if (dryRun) args.push('--dry-run');
    return {
        command: process.execPath,
        args,
        cwd: root,
        cleanup: overrides.cleanup
    };
}

export function createInspectImpostorJobSpec(root, {
    assetName,
    frame = -1,
    contactSheet = true,
    outputRoot = path.join(root, 'test-results', 'model-viewer-inspect')
} = {}) {
    const outputDir = path.join(outputRoot, `${sanitizeAssetName(assetName)}-${timestampId()}`);
    ensureDir(outputDir);
    const args = [
        'tools/inspect-tree-impostor.mjs',
        '--asset',
        assetName,
        '--output-dir',
        outputDir
    ];
    if (contactSheet) args.push('--contact-sheet');
    if (Number.isFinite(frame) && Number(frame) >= 0) {
        args.push('--frame', String(Math.round(frame)));
    }
    return {
        command: process.execPath,
        args,
        cwd: root,
        outputDir
    };
}

export function createDiagnosticsJobSpec(root, {
    assetName,
    sequences = [],
    port,
    outputRoot = path.join(root, 'test-results', 'model-viewer-diagnostics')
} = {}) {
    const outputBase = path.join(outputRoot, sanitizeAssetName(assetName) || 'asset');
    ensureDir(outputBase);
    const args = [
        'scripts/tree-impostor-diagnostics.mjs',
        '--asset',
        assetName,
        '--reuse-server',
        '--port',
        String(port),
        '--output-base',
        outputBase
    ];
    if (Array.isArray(sequences) && sequences.length > 0) {
        args.push('--sequence', sequences.join(','));
    }
    return {
        command: process.execPath,
        args,
        cwd: root,
        outputBase
    };
}
