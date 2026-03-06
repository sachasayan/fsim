import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const PORT = 5190;

async function main() {
    const screenshotsDir = path.join(ROOT, 'screenshots');
    const vantagePath = path.join(ROOT, 'config', 'vantage_points.json');
    const vantagePoints = JSON.parse(fs.readFileSync(vantagePath, 'utf8'));

    const batchTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const batchDir = path.join(screenshotsDir, `batch_${batchTimestamp}`);
    fs.mkdirSync(batchDir, { recursive: true });

    console.log(`🚀 Starting HIGH-SPEED SEQUENTIAL batch capture with VISUAL FIXES for ${Object.keys(vantagePoints).length} vantage points...`);

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
                '--window-size=1280,720'
            ]
        });

        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
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

        const capturedFiles = [];

        for (const [name, params] of Object.entries(vantagePoints)) {
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
            await page.waitForTimeout(1000);

            const imgPath = path.join(batchDir, `${name}.png`);
            await page.screenshot({ path: imgPath, timeout: 60000 });
            capturedFiles.push({ name, path: imgPath });
            console.log(`  [${name}] Captured.`);
        }

        await browser.close();
        console.log('Capture complete. Generating contact sheet...');
        await generateContactSheet(capturedFiles, path.join(batchDir, 'contact_sheet.png'));

    } finally {
        server.kill();
    }
}

async function generateContactSheet(files, outPath) {
    const cols = 3;
    const rows = Math.ceil(files.length / cols);
    const thumbW = 400;
    const thumbH = 225;
    const margin = 10;
    const padding = 20;

    const sheetW = cols * thumbW + (cols + 1) * margin;
    const sheetH = rows * thumbH + (rows + 1) * margin + padding;

    const sheet = new PNG({ width: sheetW, height: sheetH });
    for (let i = 0; i < sheet.data.length; i += 4) {
        sheet.data[i] = 30; sheet.data[i + 1] = 30; sheet.data[i + 2] = 30; sheet.data[i + 3] = 255;
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!fs.existsSync(file.path)) continue;
        const data = fs.readFileSync(file.path);
        const png = PNG.sync.read(data);

        const col = i % cols;
        const row = Math.floor(i / cols);
        const startX = margin + col * (thumbW + margin);
        const startY = margin + row * (thumbH + margin);

        for (let y = 0; y < thumbH; y++) {
            for (let x = 0; x < thumbW; x++) {
                const srcX = Math.floor(x * (png.width / thumbW));
                const srcY = Math.floor(y * (png.height / thumbH));
                const srcIdx = (srcY * png.width + srcX) << 2;
                const dstIdx = ((startY + y) * sheetW + (startX + x)) << 2;

                sheet.data[dstIdx] = png.data[srcIdx];
                sheet.data[dstIdx + 1] = png.data[srcIdx + 1];
                sheet.data[dstIdx + 2] = png.data[srcIdx + 2];
                sheet.data[dstIdx + 3] = 255;
            }
        }
    }

    fs.writeFileSync(outPath, PNG.sync.write(sheet));
    console.log(`✅ Contact sheet saved to ${outPath}`);
}

main().catch(console.error);
