const gradX = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const gradY = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const gradZ = new Float64Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);

export const Noise = {
  permutation: new Uint8Array(512),
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
    for (let i = 0; i < 512; i++) this.permutation[i] = p[i & 255];
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

    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = this.permutation[X] + Y;
    let AA = this.permutation[A] + Z;
    let AB = this.permutation[A + 1] + Z;
    let B = this.permutation[X + 1] + Y;
    let BA = this.permutation[B] + Z;
    let BB = this.permutation[B + 1] + Z;

    let xm1 = x - 1;
    let ym1 = y - 1;
    let zm1 = z - 1;

    let h;

    h = this.permutation[AA] & 15;
    let g0 = gradX[h] * x + gradY[h] * y + gradZ[h] * z;

    h = this.permutation[BA] & 15;
    let g1 = gradX[h] * xm1 + gradY[h] * y + gradZ[h] * z;

    h = this.permutation[AB] & 15;
    let g2 = gradX[h] * x + gradY[h] * ym1 + gradZ[h] * z;

    h = this.permutation[BB] & 15;
    let g3 = gradX[h] * xm1 + gradY[h] * ym1 + gradZ[h] * z;

    h = this.permutation[AA + 1] & 15;
    let g4 = gradX[h] * x + gradY[h] * y + gradZ[h] * zm1;

    h = this.permutation[BA + 1] & 15;
    let g5 = gradX[h] * xm1 + gradY[h] * y + gradZ[h] * zm1;

    h = this.permutation[AB + 1] & 15;
    let g6 = gradX[h] * x + gradY[h] * ym1 + gradZ[h] * zm1;

    h = this.permutation[BB + 1] & 15;
    let g7 = gradX[h] * xm1 + gradY[h] * ym1 + gradZ[h] * zm1;

    let l1 = g0 + u * (g1 - g0);
    let l2 = g2 + u * (g3 - g2);
    let l3 = l1 + v * (l2 - l1);

    let l4 = g4 + u * (g5 - g4);
    let l5 = g6 + u * (g7 - g6);
    let l6 = l4 + v * (l5 - l4);

    return l3 + w * (l6 - l3);
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
