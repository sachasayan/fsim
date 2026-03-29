import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_IGNORED_NAMES = new Set([
    '.DS_Store',
    '.git',
    'node_modules',
    'sim-dist',
    'editor-dist'
]);

const mtimeCache = new Map();

function normalizeSourcePaths(root, sourcePaths) {
    return sourcePaths
        .map(sourcePath => path.resolve(root, sourcePath))
        .filter((sourcePath, index, all) => all.indexOf(sourcePath) === index);
}

function scanNewestMtimeMs(targetPath) {
    if (!existsSync(targetPath)) return 0;

    const stats = statSync(targetPath);
    let newestMtimeMs = stats.mtimeMs;

    if (!stats.isDirectory()) return newestMtimeMs;

    for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
        if (DEFAULT_IGNORED_NAMES.has(entry.name)) continue;
        const childPath = path.join(targetPath, entry.name);
        const childNewestMtimeMs = scanNewestMtimeMs(childPath);
        if (childNewestMtimeMs > newestMtimeMs) newestMtimeMs = childNewestMtimeMs;
    }

    return newestMtimeMs;
}

function getNewestSourceMtimeMs(root, sourcePaths) {
    const normalizedSourcePaths = normalizeSourcePaths(root, sourcePaths);
    const cacheKey = `${root}::${normalizedSourcePaths.join('|')}`;
    const nowMs = Date.now();
    const cached = mtimeCache.get(cacheKey);

    // Avoid re-walking the tree on every request while still staying responsive.
    if (cached && nowMs - cached.scannedAtMs < 1000) {
        return cached.newestMtimeMs;
    }

    let newestMtimeMs = 0;
    for (const sourcePath of normalizedSourcePaths) {
        newestMtimeMs = Math.max(newestMtimeMs, scanNewestMtimeMs(sourcePath));
    }

    mtimeCache.set(cacheKey, {
        scannedAtMs: nowMs,
        newestMtimeMs
    });

    return newestMtimeMs;
}

export function isBuildStale({
    root,
    indexPath,
    sourcePaths
}) {
    if (!existsSync(indexPath)) return true;

    const buildMtimeMs = statSync(indexPath).mtimeMs;
    const newestSourceMtimeMs = getNewestSourceMtimeMs(root, sourcePaths);
    return newestSourceMtimeMs > buildMtimeMs;
}
