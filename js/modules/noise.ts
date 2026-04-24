// @ts-check

const permutation = new Uint8Array(512);

// Pre-calculate gradient tables for faster lookups
const grad3 = new Float64Array([
  1,1,0, -1,1,0, 1,-1,0, -1,-1,0,
  1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
  0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1,
  1,1,0, 0,-1,1, -1,1,0, 0,-1,-1
]);

export const Noise = {
  permutation,
  init(seed = 12345) {
    let p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = Math.imul(1664525, s) + 1013904223 | 0;
      let rand = Math.floor((((s >>> 8) & 0xfffff) / 0x100000) * (i + 1));
      let temp = p[i];
      p[i] = p[rand];
      p[rand] = temp;
    }
    for (let i = 0; i < 512; i++) permutation[i] = p[i & 255];
  },
  fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  lerp: (t, a, b) => a + t * (b - a),
  grad(hash, x, y, z) {
    let h = hash & 15;
    let u = h < 8 ? x : y;
    let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  },
  noise(x, y, z) {
    let X = Math.floor(x) & 255;
    let Y = Math.floor(y) & 255;
    let Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    // Inline fade
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = permutation[X] + Y;
    let AA = permutation[A] + Z;
    let AB = permutation[A + 1] + Z;
    let B = permutation[X + 1] + Y;
    let BA = permutation[B] + Z;
    let BB = permutation[B + 1] + Z;

    let h1 = (permutation[AA] & 15) * 3;
    let g1 = grad3[h1] * x + grad3[h1+1] * y + grad3[h1+2] * z;

    let h2 = (permutation[BA] & 15) * 3;
    let g2 = grad3[h2] * (x-1) + grad3[h2+1] * y + grad3[h2+2] * z;

    let h3 = (permutation[AB] & 15) * 3;
    let g3 = grad3[h3] * x + grad3[h3+1] * (y-1) + grad3[h3+2] * z;

    let h4 = (permutation[BB] & 15) * 3;
    let g4 = grad3[h4] * (x-1) + grad3[h4+1] * (y-1) + grad3[h4+2] * z;

    let r1 = g1 + u * (g2 - g1);
    let r2 = g3 + u * (g4 - g3);
    let r3 = r1 + v * (r2 - r1);

    let h5 = (permutation[AA + 1] & 15) * 3;
    let g5 = grad3[h5] * x + grad3[h5+1] * y + grad3[h5+2] * (z-1);

    let h6 = (permutation[BA + 1] & 15) * 3;
    let g6 = grad3[h6] * (x-1) + grad3[h6+1] * y + grad3[h6+2] * (z-1);

    let h7 = (permutation[AB + 1] & 15) * 3;
    let g7 = grad3[h7] * x + grad3[h7+1] * (y-1) + grad3[h7+2] * (z-1);

    let h8 = (permutation[BB + 1] & 15) * 3;
    let g8 = grad3[h8] * (x-1) + grad3[h8+1] * (y-1) + grad3[h8+2] * (z-1);

    let r4 = g5 + u * (g6 - g5);
    let r5 = g7 + u * (g8 - g7);
    let r6 = r4 + v * (r5 - r4);

    return r3 + w * (r6 - r3);
  },
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      let f = scale;
      if (octaves === 5) {
        const n0 = this.noise(x * f, 0, z * f);
        f *= 2;
        const n1 = this.noise(x * f, 0, z * f);
        f *= 2;
        const n2 = this.noise(x * f, 0, z * f);
        f *= 2;
        const n3 = this.noise(x * f, 0, z * f);
        f *= 2;
        const n4 = this.noise(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625) / 1.9375;
      }
      if (octaves === 6) {
        const n0 = this.noise(x * f, 0, z * f);
        f *= 2;
        const n1 = this.noise(x * f, 0, z * f);
        f *= 2;
        const n2 = this.noise(x * f, 0, z * f);
        f *= 2;
        const n3 = this.noise(x * f, 0, z * f);
        f *= 2;
        const n4 = this.noise(x * f, 0, z * f);
        f *= 2;
        const n5 = this.noise(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625 + n5 * 0.03125) / 1.96875;
      }
    }

    let total = 0;
    let frequency = scale;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, 0, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxValue;
  }
};

Noise.init();
