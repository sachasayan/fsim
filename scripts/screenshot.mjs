import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = process.cwd();
const PORT = 5188;

async function main() {
    const screenshotsDir = path.join(ROOT, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const args = process.argv.slice(2);
    let queryParams = [];

    args.forEach(arg => {
        if (arg.startsWith('--x=')) queryParams.push(`x=${arg.split('=')[1]}`);
        if (arg.startsWith('--y=')) queryParams.push(`y=${arg.split('=')[1]}`);
        if (arg.startsWith('--z=')) queryParams.push(`z=${arg.split('=')[1]}`);
    });

    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

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
            return !loader || window.getComputedStyle(loader).display === 'none' || window.getComputedStyle(loader).opacity === '0';
        }, { timeout: 15000 });

        console.log('Simulation initialized. Waiting for chunks to render...');
        // Provide some time for initial chunks, models, and materials to load
        await page.waitForTimeout(5000);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = path.join(screenshotsDir, `screenshot-${timestamp}.png`);

        console.log(`Saving screenshot to ${screenshotPath}...`);
        await page.screenshot({ path: screenshotPath });

        await browser.close();
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
