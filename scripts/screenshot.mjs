import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = process.cwd();
const PORT = 5188;
const LOCK_FILE = path.join(ROOT, '.screenshot.lock');

async function main() {
    if (fs.existsSync(LOCK_FILE)) {
        const pid = fs.readFileSync(LOCK_FILE, 'utf8');
        console.error(`Error: Screenshot script is already running (PID: ${pid}).`);
        console.error(`If you are sure it's not running, delete ${LOCK_FILE}`);
        process.exit(1);
    }

    fs.writeFileSync(LOCK_FILE, String(process.pid));

    const cleanup = () => {
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
        }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(130); });
    process.on('SIGTERM', () => { cleanup(); process.exit(143); });

    const screenshotsDir = path.join(ROOT, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const args = process.argv.slice(2);
    let params = {};

    // 1. Check for vantage point first
    const vantageArg = args.find(a => a.startsWith('--vantage='));
    if (vantageArg) {
        const name = vantageArg.split('=')[1];
        const vantagePath = path.join(screenshotsDir, 'vantage_points.json');
        if (fs.existsSync(vantagePath)) {
            const vantages = JSON.parse(fs.readFileSync(vantagePath, 'utf8'));
            if (vantages[name]) {
                console.log(`Using vantage point: ${name}`);
                Object.assign(params, vantages[name]);
            } else {
                console.warn(`Vantage point "${name}" not found in ${vantagePath}`);
            }
        }
    }

    // 2. Override with CLI args
    args.forEach(arg => {
        if (arg.startsWith('--x=')) params.x = arg.split('=')[1];
        if (arg.startsWith('--y=')) params.y = arg.split('=')[1];
        if (arg.startsWith('--z=')) params.z = arg.split('=')[1];
        if (arg.startsWith('--fog=')) params.fog = arg.split('=')[1];
        if (arg.startsWith('--clouds=')) params.clouds = arg.split('=')[1];
        if (arg.startsWith('--lighting=')) params.lighting = arg.split('=')[1];
    });

    let queryParams = [];
    for (const [key, value] of Object.entries(params)) {
        queryParams.push(`${key}=${value}`);
    }

    queryParams.push('fastload=1'); // Speed up terrain loading for headless
    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

    // Port Management (Killer Instincts feature)
    console.log(`Checking if port ${PORT} is occupied...`);
    try {
        const pids = execSync(`lsof -t -i :${PORT}`, { encoding: 'utf8' }).trim().split('\n');
        if (pids.length > 0 && pids[0] !== '') {
            console.warn(`Port ${PORT} is in use by PID(s): ${pids.join(', ')}. Terminating...`);
            for (const pid of pids) {
                if (pid) {
                    try {
                        process.kill(parseInt(pid, 10), 'SIGKILL');
                        console.log(`Killed process ${pid}.`);
                    } catch (e) {
                        console.error(`Failed to kill process ${pid}: ${e.message}`);
                    }
                }
            }
            // Small wait to ensure OS has fully released the port bounds
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (e) {
        // lsof exits with 1 if no process is found, which is expected
    }

    console.log('Starting server...');
    const server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(PORT) },
        stdio: 'ignore'
    });

    // Give server a moment to bind
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
        console.log('Launching browser...');
        // We launch chromium with explicit WebGL and GPU flags to ensure rendering works headless
        const browser = await chromium.launch({
            headless: true,
            args: [
                '--use-gl=angle',
                '--use-angle=swiftshader',
                '--ignore-gpu-blocklist',
                '--enable-webgl',
                '--window-size=1920,1080'
            ]
        });

        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 }
        });
        const page = await context.newPage();
        page.setDefaultTimeout(600000);
        page.setDefaultNavigationTimeout(600000);

        let serverChecksSkipped = false;
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error(`Page Error: ${msg.text()}`);
            } else if (msg.type() === 'warning') {
                console.warn(`Page Warn: ${msg.text()}`);
            } else {
                console.log(`Page Log: ${msg.text()}`);
            }
        });

        console.log(`Navigating to fsim... http://127.0.0.1:${PORT}${queryString}`);
        await page.goto(`http://127.0.0.1:${PORT}${queryString}`);

        console.log('Waiting for loader to disappear...');
        // The loading screen has id "loader", we wait until it is hidden
        await page.waitForFunction(() => {
            const loader = document.getElementById('loader');
            if (!loader) return true;
            const style = window.getComputedStyle(loader);
            return style.display === 'none' || parseFloat(style.opacity) < 0.1;
        }, { timeout: 60000 });

        console.log('Simulation initialized. Waiting for terrain and props to load (polling)...');
        // Manual polling loop to avoid Playwright-specific waitForFunction timeout issues
        let terrainReady = false;
        const startTime = Date.now();
        const MAX_WAIT_MS = 600000; // 10 minutes

        while (!terrainReady) {
            terrainReady = await page.evaluate(() => {
                return window.fsimWorld && window.fsimWorld.isReady();
            });

            if (terrainReady) break;

            if (Date.now() - startTime > MAX_WAIT_MS) {
                throw new Error('Terrain loading timed out after 10 minutes');
            }

            // Wait 2 seconds between polls
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log('Terrain stable. Waiting for final render frames...');
        // Wait an additional period for the GPU to catch up and render the last bits
        await page.waitForTimeout(2000);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = path.join(screenshotsDir, `screenshot-${timestamp}.png`);

        console.log(`Saving screenshot to ${screenshotPath}...`);
        await page.screenshot({ path: screenshotPath });
        console.log('Screenshot saved.');

        await browser.close();
        console.log('Browser closed.');
        console.log('Done screenshot capture.');

    } finally {
        console.log('Killing server...');
        if (!server.killed) {
            server.kill('SIGTERM');
        }
    }
}

main().catch(err => {
    console.error('Screenshot script failed:', err);
    process.exit(1);
});
