import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = process.cwd();
const PORT = 5190;
const args = process.argv.slice(2);

function parseArgs(argv) {
    const options = {
        config: path.join(ROOT, 'config', 'vantage_points.json'),
        filter: '',
        width: 1280,
        height: 720,
        settle: 1000
    };

    for (const arg of argv) {
        if (arg.startsWith('--config=')) options.config = path.resolve(ROOT, arg.slice('--config='.length));
        if (arg.startsWith('--filter=')) options.filter = arg.slice('--filter='.length);
        if (arg.startsWith('--width=')) options.width = parseInt(arg.slice('--width='.length), 10);
        if (arg.startsWith('--height=')) options.height = parseInt(arg.slice('--height='.length), 10);
        if (arg.startsWith('--settle=')) options.settle = parseInt(arg.slice('--settle='.length), 10);
    }

    return options;
}

async function main() {
    const options = parseArgs(args);
    const screenshotsDir = path.join(ROOT, 'screenshots');
    const vantagePoints = JSON.parse(fs.readFileSync(options.config, 'utf8'));
    const filteredEntries = Object.entries(vantagePoints).filter(([name]) => {
        return !options.filter || name.includes(options.filter);
    });
    if (filteredEntries.length === 0) {
        throw new Error(`No vantage points matched filter "${options.filter}" in ${options.config}`);
    }

    const batchTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const batchDir = path.join(screenshotsDir, `batch_${batchTimestamp}`);
    fs.mkdirSync(batchDir, { recursive: true });

    console.log(`🚀 Starting HIGH-SPEED SEQUENTIAL batch capture with VISUAL FIXES for ${filteredEntries.length} vantage points...`);

    const server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(PORT) },
        stdio: 'ignore'
    });

    process.on('exit', () => server.kill());

    await new Promise(r => setTimeout(r, 2000));

    try {
        const browser = await chromium.launch({
            headless: true,
            args: [
                '--use-gl=angle',
                '--use-angle=swiftshader',
                '--ignore-gpu-blocklist',
                '--enable-webgl',
                `--window-size=${options.width},${options.height}`
            ]
        });

        const context = await browser.newContext({ viewport: { width: options.width, height: options.height } });
        const page = await context.newPage();

        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[isReady]') || text.includes('[terrain]')) {
                console.log(`  [Browser] ${text}`);
            }
        });

        console.log(`  [Init] Loading simulation...`);
        // Use fastload=1 to speed up initial terrain generation
        await page.goto(`http://127.0.0.1:${PORT}/?fastload=1`);

        // Wait for fsimWorld to exist
        await page.waitForFunction(() => window.fsimWorld, { timeout: 30000 });

        // Force initial update to start building if animation loop hasn't triggered yet
        await page.evaluate(() => {
            if (window.fsimWorld && window.fsimWorld.updateTerrain) window.fsimWorld.updateTerrain();
        });

        // Wait for initial world ready
        await page.waitForFunction(() => window.fsimWorld && window.fsimWorld.isReady(), null, { timeout: 120000 });
        console.log(`  [Init] Simulation ready. Entering sequential capture loop...`);

        for (const [name, params] of filteredEntries) {
            console.log(`  [${name}] Teleporting...`);

            await page.evaluate((p) => {
                const world = window.fsimWorld;
                if (!world) throw new Error('fsimWorld not found');

                const x = parseFloat(p.x);
                const y = parseFloat(p.y);
                const z = parseFloat(p.z);

                // Teleport
                world.PHYSICS.position.set(x, y, z);
                world.planeGroup.position.set(x, y, z);
                if (world.physicsAdapter) world.physicsAdapter.syncFromState();

                // URL Params for renderDist, fog, clouds
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.set('renderDist', p.renderDist || 3);

                if (p.fog === 0) currentUrl.searchParams.set('fog', '0');
                else currentUrl.searchParams.delete('fog');

                if (p.clouds === 0) currentUrl.searchParams.set('clouds', '0');
                else currentUrl.searchParams.delete('clouds');

                window.history.replaceState({}, '', currentUrl);

                // Immediate state updates
                world.planeGroup.visible = p.hideplane !== 1;
                if (p.lighting && world.weatherManager) world.weatherManager.applyLightingPreset(p.lighting);

                if (p.fog === 0 && world.WEATHER) {
                    world.WEATHER.targetFog = 0;
                    world.WEATHER.currentFog = 0;
                }

                if (p.clouds === 0 && world.clouds) world.clouds.visible = false;
                else if (world.clouds) world.clouds.visible = true;

                // Force atmosphere update to pick up URL params and new position immediately
                if (world.updateTerrainAtmosphere) {
                    world.updateTerrainAtmosphere();
                }

                if (p.tilt !== undefined && world.cameraController.setRotation) {
                    world.cameraController.setRotation(0, -parseFloat(p.tilt) * (Math.PI / 180));
                }

                world.cameraController.snapToTarget();

                // Force immediate terrain recalculation for the new position
                if (window.fsimWorld && window.fsimWorld.updateTerrain) {
                    window.fsimWorld.updateTerrain();
                }
            }, params);

            // Wait for isReady (now robust against teleport race conditions)
            await page.waitForTimeout(200);
            await page.waitForFunction(() => window.fsimWorld && window.fsimWorld.isReady(), null, { timeout: 120000 });

            // Settle for terrain meshes and lighting transitions
            await page.waitForTimeout(options.settle);

            const imgPath = path.join(batchDir, `${name}.png`);
            await page.screenshot({ path: imgPath, timeout: 60000 });
            console.log(`  [${name}] Captured.`);
        }

        await browser.close();
        console.log(`Capture complete. Screenshots saved to ${batchDir}`);

    } finally {
        server.kill();
    }
}

main().catch(console.error);
