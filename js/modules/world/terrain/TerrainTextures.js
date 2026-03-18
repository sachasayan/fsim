import * as THREE from 'three';

export function createWaterNormalMap(Noise) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);

    // Generate a bumpy noise normal map
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let scale = 4; // Much lower scale for wide, sweeping ocean swells (Fixes tiling)
            let h0 = Noise.fractal((x / size) * scale, (y / size) * scale, 3, 0.5, 1);
            let hx = Noise.fractal(((x + 1) / size) * scale, (y / size) * scale, 3, 0.5, 1);
            let hy = Noise.fractal((x / size) * scale, ((y + 1) / size) * scale, 3, 0.5, 1);

            let dx = (hx - h0) * 15.0; // Much steeper slope for higher contrast
            let dy = (hy - h0) * 15.0;
            let dz = 1.0;
            let len = Math.sqrt(dx * dx + dy * dy + dz * dz);

            let idx = (y * size + x) * 4;
            imgData.data[idx] = Math.floor(((dx / len) * 0.5 + 0.5) * 255);
            imgData.data[idx + 1] = Math.floor(((dy / len) * 0.5 + 0.5) * 255);
            imgData.data[idx + 2] = Math.floor(((dz / len) * 0.5 + 0.5) * 255);
            imgData.data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(256, 256); // Minimal repetition to remove the grid effect
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
}

export function createTreeBillboardTexture(kind, { crownOnly = false } = {}) {
    const w = 256;
    const h = 512;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    if (!crownOnly) {
        const trunkGradient = ctx.createLinearGradient(w * 0.5, h * 0.3, w * 0.5, h * 0.98);
        trunkGradient.addColorStop(0, kind === 'dry' ? '#7c6446' : '#644731');
        trunkGradient.addColorStop(1, kind === 'dry' ? '#4e3924' : '#3c2918');
        ctx.fillStyle = trunkGradient;
        ctx.fillRect(w * 0.46, h * 0.42, w * 0.08, h * 0.5);
    }

    function drawCluster(cx, cy, rx, ry, baseColor, highlightColor, alpha = 1) {
        const grad = ctx.createRadialGradient(cx, cy - ry * 0.25, rx * 0.12, cx, cy, Math.max(rx, ry));
        grad.addColorStop(0, highlightColor);
        grad.addColorStop(0.72, baseColor);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawCanopy(baseColor, highlightColor, outlineColor, clusters) {
        clusters.forEach((cluster) => drawCluster(
            cluster[0] * w,
            cluster[1] * h,
            cluster[2] * w,
            cluster[3] * h,
            baseColor,
            highlightColor,
            cluster[4] ?? 1
        ));

        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.12;
        clusters.forEach((cluster) => {
            ctx.beginPath();
            ctx.ellipse(cluster[0] * w, cluster[1] * h, cluster[2] * w, cluster[3] * h, 0, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }

    if (kind === 'poplar') {
        drawCanopy('#4f7d34', '#7fa95d', '#25361d', [
            [0.50, 0.20, 0.12, 0.15, 0.95],
            [0.44, 0.28, 0.10, 0.17, 0.78],
            [0.56, 0.29, 0.10, 0.17, 0.78],
            [0.50, 0.36, 0.13, 0.18, 0.86],
            [0.48, 0.46, 0.11, 0.15, 0.70],
            [0.53, 0.46, 0.10, 0.15, 0.70]
        ]);
    } else if (kind === 'dry') {
        drawCanopy('#7d8543', '#b5bb72', '#444826', [
            [0.39, 0.30, 0.09, 0.10, 0.72],
            [0.52, 0.26, 0.11, 0.12, 0.85],
            [0.63, 0.33, 0.08, 0.09, 0.68],
            [0.46, 0.40, 0.10, 0.11, 0.74],
            [0.60, 0.42, 0.09, 0.10, 0.72],
            [0.53, 0.50, 0.11, 0.11, 0.62]
        ]);
    } else {
        drawCanopy('#456f31', '#78a85d', '#20301b', [
            [0.30, 0.31, 0.14, 0.12, 0.88],
            [0.50, 0.23, 0.16, 0.13, 0.96],
            [0.68, 0.31, 0.14, 0.12, 0.86],
            [0.36, 0.42, 0.16, 0.12, 0.82],
            [0.57, 0.39, 0.18, 0.14, 0.90],
            [0.49, 0.52, 0.18, 0.12, 0.78]
        ]);
    }

    if (!crownOnly) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.45, w * 0.12, h * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.ellipse(w * 0.46, h * 0.23, w * 0.08, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
}

export function createTreeContactTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.05, size * 0.5, size * 0.5, size * 0.5);
    gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
    gradient.addColorStop(0.45, 'rgba(0,0,0,0.45)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
}

export function createPackedTerrainDetailTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    function hash2(x, y, seed) {
        const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
        return n - Math.floor(n);
    }

    function smoothNoise(x, y, seed) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const tx = x - x0;
        const ty = y - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);

        const n00 = hash2(x0, y0, seed);
        const n10 = hash2(x1, y0, seed);
        const n01 = hash2(x0, y1, seed);
        const n11 = hash2(x1, y1, seed);
        const nx0 = n00 * (1 - sx) + n10 * sx;
        const nx1 = n01 * (1 - sx) + n11 * sx;
        return nx0 * (1 - sy) + nx1 * sy;
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Channel R: Grass Detail Noise
            const g1 = smoothNoise(x * 0.08, y * 0.08, 1);
            const g2 = smoothNoise(x * 0.21, y * 0.21, 2);
            const grassN = g1 * 0.6 + g2 * 0.4;

            // Channel G: Rock Detail Noise
            const r1 = smoothNoise(x * 0.12, y * 0.12, 3);
            const r2 = smoothNoise(x * 0.31, y * 0.31, 4);
            const rockN = r1 * 0.5 + r2 * 0.5;

            // Channel B: Anti-tiling Perturbation (low frequency)
            const p1 = smoothNoise(x * 0.03, y * 0.03, 5);
            const perturbN = p1;

            // Channel A: High-freq Micro-variation
            const m1 = smoothNoise(x * 0.6, y * 0.6, 6);
            const microN = m1;

            const i = (y * size + x) * 4;
            data[i] = Math.floor(grassN * 255);
            data[i + 1] = Math.floor(rockN * 255);
            data[i + 2] = Math.floor(perturbN * 255);
            data[i + 3] = Math.floor(microN * 255);
        }
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.NoColorSpace; // Data texture
    tex.generateMipmaps = true;
    return tex;
}
