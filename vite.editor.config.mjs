import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: path.resolve(ROOT, 'src', 'editor-app'),
    base: '/editor-dist/',
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': ROOT
        }
    },
    server: {
        port: 5174,
        host: '127.0.0.1',
        proxy: {
            '/tools': 'http://127.0.0.1:5173',
            '/config': 'http://127.0.0.1:5173',
            '/save': 'http://127.0.0.1:5173',
            '/rebuild-world': 'http://127.0.0.1:5173',
            '/events': 'http://127.0.0.1:5173',
            '/world': 'http://127.0.0.1:5173',
            '/assets': 'http://127.0.0.1:5173',
            '/node_modules': 'http://127.0.0.1:5173'
        }
    },
    build: {
        outDir: path.resolve(ROOT, 'editor-dist'),
        emptyOutDir: true,
        assetsDir: 'assets'
    }
});
