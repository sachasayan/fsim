import { defineConfig } from 'playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    expect: {
        timeout: 5_000
    },
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                launchOptions: {
                    args: [
                        '--use-gl=angle',
                        '--use-angle=swiftshader',
                        '--ignore-gpu-blocklist',
                        '--enable-webgl',
                        '--window-size=1920,1080'
                    ]
                },
                viewport: {
                    width: 1920,
                    height: 1080
                }
            }
        }
    ],
    webServer: {
        command: 'PORT=4173 FSIM_EDITOR_E2E=1 node tools/dev-server.mjs',
        url: 'http://127.0.0.1:4173/editor.html',
        reuseExistingServer: false,
        timeout: 30_000
    }
});
