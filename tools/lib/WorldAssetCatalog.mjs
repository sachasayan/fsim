import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_MANIFEST_PATH = 'tools/world-asset-presets.json';
export const DEFAULT_TARGET_HEIGHTS_PATH = 'tools/world-asset-target-heights.json';

export function toAbsolute(root, targetPath) {
    return path.isAbsolute(targetPath) ? targetPath : path.resolve(root, targetPath);
}

export function loadWorldAssetManifest(root, manifestPath = DEFAULT_MANIFEST_PATH) {
    const absolutePath = toAbsolute(root, manifestPath);
    const manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    if (!manifest.assets || typeof manifest.assets !== 'object') {
        throw new Error(`Invalid manifest: ${absolutePath}`);
    }
    return { absolutePath, manifest };
}

export function loadWorldAssetTargetHeights(root, targetHeightsPath = DEFAULT_TARGET_HEIGHTS_PATH) {
    const absolutePath = toAbsolute(root, targetHeightsPath);
    if (!fs.existsSync(absolutePath)) {
        return { absolutePath, targetHeights: {} };
    }
    const targetHeights = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    return {
        absolutePath,
        targetHeights: targetHeights && typeof targetHeights === 'object' ? targetHeights : {}
    };
}

export function mergeWorldAssetPreset(defaults, name, assetConfig, targetHeights = {}) {
    const merged = {
        name,
        inputFile: `${name}.glb`,
        ...defaults,
        ...assetConfig
    };
    const category = typeof merged.category === 'string' && merged.category.length > 0 ? merged.category : '';
    return {
        ...merged,
        category,
        unprocessedDir: merged.unprocessedDir || defaults.unprocessedDir,
        sourceDir: merged.sourceDir || defaults.sourceDir,
        decimatedDir: merged.decimatedDir || defaults.decimatedDir,
        gameReadyDir: merged.gameReadyDir || defaults.gameReadyDir,
        targetHeightMeters: Number(targetHeights[name] ?? merged.targetHeightMeters ?? 0)
    };
}

export function resolveWorldAssetPaths(root, preset) {
    const unprocessedDir = toAbsolute(root, preset.category ? path.join(preset.unprocessedDir, preset.category) : preset.unprocessedDir);
    const sourceDir = toAbsolute(root, preset.category ? path.join(preset.sourceDir, preset.category) : preset.sourceDir);
    const decimatedDir = toAbsolute(root, preset.category ? path.join(preset.decimatedDir, preset.category) : preset.decimatedDir);
    const gameReadyDir = toAbsolute(root, preset.category ? path.join(preset.gameReadyDir, preset.category) : preset.gameReadyDir);
    const unprocessedPath = toAbsolute(root, preset.unprocessedPath || path.join(unprocessedDir, preset.inputFile));
    const inputPath = toAbsolute(root, preset.inputPath || path.join(sourceDir, preset.inputFile));
    const decimatedPath = toAbsolute(root, preset.decimatedPath || path.join(decimatedDir, `${preset.name}.glb`));
    const gameReadyPath = toAbsolute(root, preset.gameReadyPath || path.join(gameReadyDir, `${preset.name}.glb`));
    const reportPath = `${decimatedPath}.report.json`;
    const impostorOutputDir = preset?.impostorBake?.enabled
        ? toAbsolute(root, preset.impostorBake.outputDir)
        : null;
    return {
        unprocessedDir,
        sourceDir,
        decimatedDir,
        gameReadyDir,
        unprocessedPath,
        inputPath,
        decimatedPath,
        gameReadyPath,
        reportPath,
        impostorOutputDir
    };
}

export function buildWorldAssetPresetMap(root, {
    manifestPath = DEFAULT_MANIFEST_PATH,
    targetHeightsPath = DEFAULT_TARGET_HEIGHTS_PATH
} = {}) {
    const { absolutePath: manifestAbsolutePath, manifest } = loadWorldAssetManifest(root, manifestPath);
    const { absolutePath: targetHeightsAbsolutePath, targetHeights } = loadWorldAssetTargetHeights(root, targetHeightsPath);
    const entries = Object.entries(manifest.assets).map(([name, assetConfig]) => {
        const preset = mergeWorldAssetPreset(manifest.defaults || {}, name, assetConfig, targetHeights);
        const paths = resolveWorldAssetPaths(root, preset);
        return [name, { preset, paths }];
    });
    return {
        manifestAbsolutePath,
        targetHeightsAbsolutePath,
        manifest,
        targetHeights,
        presets: new Map(entries)
    };
}

function buildFileInfo(root, filePath) {
    const exists = fs.existsSync(filePath);
    const stat = exists ? fs.statSync(filePath) : null;
    return {
        path: filePath,
        repoRelativePath: filePath.startsWith(root) ? path.relative(root, filePath).split(path.sep).join('/') : null,
        urlPath: filePath.startsWith(root) ? `/${path.relative(root, filePath).split(path.sep).join('/')}` : null,
        exists,
        sizeBytes: stat?.size ?? null,
        mtimeMs: stat?.mtimeMs ?? null
    };
}

function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function toFiniteNumber(value) {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) ? nextValue : null;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampPositive(value, fallback = 1) {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) && nextValue > 1e-6 ? nextValue : fallback;
}

function normalizeContentRect(contentRect) {
    if (!contentRect || typeof contentRect !== 'object') return null;
    const x = clamp01(Number(contentRect.x));
    const y = clamp01(Number(contentRect.y));
    const widthValue = Number(contentRect.width);
    const heightValue = Number(contentRect.height);
    const width = Math.max(1e-6, Math.min(1 - x, Number.isFinite(widthValue) ? widthValue : 1));
    const height = Math.max(1e-6, Math.min(1 - y, Number.isFinite(heightValue) ? heightValue : 1));
    return { x, y, width, height };
}

function resolveImpostorFraming(metadata) {
    if (!metadata || typeof metadata !== 'object') return null;
    const boundsMin = Array.isArray(metadata.boundsMin) ? metadata.boundsMin : [-0.5, 0, -0.5];
    const boundsMax = Array.isArray(metadata.boundsMax) ? metadata.boundsMax : [0.5, 1, 0.5];
    const width = Math.max(0, Number(boundsMax[0]) - Number(boundsMin[0])) || 0;
    const height = Math.max(0, Number(boundsMax[1]) - Number(boundsMin[1])) || 0;
    const depth = Math.max(0, Number(boundsMax[2]) - Number(boundsMin[2])) || 0;
    const captureOrthoScale = clampPositive(
        metadata.captureOrthoScale,
        Math.max(width, height, depth, 1) * 1.9
    );
    const derivedWidth = Math.max(1e-6, Math.min(1, Math.max(width, depth) / captureOrthoScale));
    const derivedHeight = Math.max(1e-6, Math.min(1, height / captureOrthoScale));
    const contentRect = normalizeContentRect(metadata.contentRect) || {
        x: (1 - derivedWidth) * 0.5,
        y: (1 - derivedHeight) * 0.5,
        width: derivedWidth,
        height: derivedHeight
    };
    return {
        captureOrthoScale,
        contentRect,
        visibleWidthRatio: contentRect.width,
        visibleHeightRatio: contentRect.height,
        padding: {
            left: contentRect.x,
            right: clamp01(1 - (contentRect.x + contentRect.width)),
            bottom: contentRect.y,
            top: clamp01(1 - (contentRect.y + contentRect.height))
        }
    };
}

function buildMeasuredTriangleCounts(files, reportData) {
    const sourceTriangles = toFiniteNumber(reportData?.sourceTriangles);
    const decimatedTriangles = toFiniteNumber(reportData?.outputTriangles);
    const stagedTriangles = files.gameReady.exists
        ? (decimatedTriangles ?? sourceTriangles)
        : null;

    return {
        source: sourceTriangles,
        decimated: files.decimated.exists ? decimatedTriangles : null,
        gameReady: stagedTriangles
    };
}

export function buildWorldAssetDetail(root, assetName, options = {}) {
    const presetMap = buildWorldAssetPresetMap(root, options);
    const entry = presetMap.presets.get(assetName);
    if (!entry) {
        return null;
    }
    const { preset, paths } = entry;
    const reportData = readJsonIfExists(paths.reportPath);
    const impostorMetadataPath = paths.impostorOutputDir ? path.join(paths.impostorOutputDir, 'metadata.json') : null;
    const rawImpostorMetadata = impostorMetadataPath ? readJsonIfExists(impostorMetadataPath) : null;
    const resolvedFraming = resolveImpostorFraming(rawImpostorMetadata);
    const impostorMetadata = rawImpostorMetadata
        ? {
            ...rawImpostorMetadata,
            ...(resolvedFraming || {})
        }
        : null;

    const files = {
        unprocessed: buildFileInfo(root, paths.unprocessedPath),
        source: buildFileInfo(root, paths.inputPath),
        decimated: buildFileInfo(root, paths.decimatedPath),
        gameReady: buildFileInfo(root, paths.gameReadyPath),
        report: buildFileInfo(root, paths.reportPath),
        impostor: paths.impostorOutputDir ? {
            baseDir: buildFileInfo(root, paths.impostorOutputDir),
            metadata: buildFileInfo(root, path.join(paths.impostorOutputDir, 'metadata.json')),
            albedo: buildFileInfo(root, path.join(paths.impostorOutputDir, 'albedo.png')),
            normal: buildFileInfo(root, path.join(paths.impostorOutputDir, 'normal.png')),
            depth: buildFileInfo(root, path.join(paths.impostorOutputDir, 'depth.png'))
        } : null
    };

    return {
        assetName,
        category: preset.category,
        preset,
        targetHeightMeters: preset.targetHeightMeters,
        manifestPath: presetMap.manifestAbsolutePath,
        targetHeightsPath: presetMap.targetHeightsAbsolutePath,
        paths,
        files,
        reportData,
        impostorMetadata,
        measuredTriangles: buildMeasuredTriangleCounts(files, reportData)
    };
}

export function buildWorldAssetCatalog(root, options = {}) {
    const presetMap = buildWorldAssetPresetMap(root, options);
    return Array.from(presetMap.presets.values()).map(({ preset, paths }) => {
        const detail = buildWorldAssetDetail(root, preset.name, options);
        return {
            assetName: preset.name,
            category: preset.category,
            targetHeightMeters: preset.targetHeightMeters,
            targetTriangles: Number(preset.targetTriangles) || 0,
            sizeBudgetBytes: Number(preset.sizeBudgetBytes) || 0,
            hasImpostorBake: Boolean(preset?.impostorBake?.enabled),
            paths,
            files: detail?.files || null
        };
    });
}
