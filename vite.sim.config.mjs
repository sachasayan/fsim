import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const sharedProxy = {
    '/tools': 'http://127.0.0.1:5173',
    '/config': 'http://127.0.0.1:5173',
    '/save': 'http://127.0.0.1:5173',
    '/rebuild-world': 'http://127.0.0.1:5173',
    '/events': 'http://127.0.0.1:5173',
    '/world': 'http://127.0.0.1:5173',
    '/assets': 'http://127.0.0.1:5173',
    '/node_modules': 'http://127.0.0.1:5173'
};

export default defineConfig({
    root: path.resolve(ROOT, 'src', 'sim-app'),
    base: '/sim-dist/',
    server: {
        port: 5175,
        host: '127.0.0.1',
        proxy: sharedProxy
    },
    build: {
        outDir: path.resolve(ROOT, 'sim-dist'),
        emptyOutDir: true,
        assetsDir: 'assets'
    }
});
