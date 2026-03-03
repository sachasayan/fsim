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
    return tex;
}

export function createTreeBillboardTexture(kind) {
    const w = 128;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    // Trunk
    ctx.fillStyle = kind === 'dry' ? '#6f5b45' : '#5a4029';
    ctx.fillRect(56, 156, 16, 86);

    if (kind === 'conifer') {
        ctx.fillStyle = '#2d5525';
        ctx.beginPath();
        ctx.moveTo(64, 26);
        ctx.lineTo(20, 170);
        ctx.lineTo(108, 170);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#38652d';
        ctx.beginPath();
        ctx.moveTo(64, 52);
        ctx.lineTo(30, 182);
        ctx.lineTo(98, 182);
        ctx.closePath();
        ctx.fill();
    } else if (kind === 'poplar') {
        ctx.fillStyle = '#5f8a3e';
        ctx.beginPath();
        ctx.ellipse(64, 98, 26, 74, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6a9646';
        ctx.beginPath();
        ctx.ellipse(64, 110, 18, 60, 0, 0, Math.PI * 2);
        ctx.fill();
    } else if (kind === 'dry') {
        ctx.strokeStyle = '#7e6951';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(64, 158);
        ctx.lineTo(50, 98);
        ctx.moveTo(64, 150);
        ctx.lineTo(78, 92);
        ctx.moveTo(64, 126);
        ctx.lineTo(38, 84);
        ctx.moveTo(64, 118);
        ctx.lineTo(92, 76);
        ctx.stroke();
    } else {
        // broadleaf default
        ctx.fillStyle = '#487532';
        ctx.beginPath();
        ctx.arc(50, 106, 32, 0, Math.PI * 2);
        ctx.arc(80, 104, 30, 0, Math.PI * 2);
        ctx.arc(65, 76, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#56883b';
        ctx.beginPath();
        ctx.arc(62, 96, 24, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
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
