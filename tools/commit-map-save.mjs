import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { normalizeMapData } from '../js/modules/world/MapDataUtils.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAP_PATH = path.join(ROOT, 'tools', 'map.json');

async function runNodeScript(scriptPath, extraEnv = {}) {
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], {
        cwd: ROOT,
        env: { ...process.env, ...extraEnv }
    });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
}

async function main() {
    const mapData = normalizeMapData(JSON.parse(await readFile(MAP_PATH, 'utf8')));
    const hadTerrainEdits = (mapData.terrainEdits || []).length > 0;
    const forceClean = process.env.FSIM_CLEAN_REBUILD === '1';

    // If we have no edits to commit and aren't forcing a clean rebuild, 
    // we should still probably do a clean rebuild to ensure generator changes are picked up.
    // We only strictly NEED existing terrain if we are baking surgical edits into the base.
    const useExistingMap = !forceClean && hadTerrainEdits;

    console.log(`🛠️ Mode: ${useExistingMap ? 'Surgical (Additive)' : 'Clean-Slate (Full Rebuild)'}`);

    await runNodeScript(path.join(ROOT, 'tools', 'bake-map.mjs'), {
        FSIM_USE_EXISTING_TERRAIN: useExistingMap ? '1' : '0',
        FSIM_CLEAR_TERRAIN_EDITS: useExistingMap ? '1' : '0'
    });

    if (hadTerrainEdits && useExistingMap) {
        const cleanedMap = { ...mapData, terrainEdits: [] };
        await writeFile(MAP_PATH, JSON.stringify(cleanedMap, null, 4));
        console.log('🧹 Cleared committed terrain edits from tools/map.json');
    }

    await runNodeScript(path.join(ROOT, 'tools', 'build-world.mjs'), {
        FSIM_USE_EXISTING_TERRAIN: '1' // build-world always needs the latest world.bin
    });
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
