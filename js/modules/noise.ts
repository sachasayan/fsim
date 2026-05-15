// @ts-check

const P = new Uint8Array(512);

export const Noise = {
  permutation: P,
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
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];
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

    let A = P[X] + Y;
    let AA = P[A] + Z;
    let AB = P[A + 1] + Z;
    let B = P[X + 1] + Y;
    let BA = P[B] + Z;
    let BB = P[B + 1] + Z;

    // Fully unrolled lerp equations for maximum V8 throughput:
    // lerp(t, a, b) => a + t * (b - a)
    let hash, h, uu, vv, g0, g1, g2, g3, g4, g5, g6, g7;

    hash = P[AA]; h = hash & 15; uu = h < 8 ? x : y; vv = h < 4 ? y : h === 12 || h === 14 ? x : z; g0 = ((h & 1) === 0 ? uu : -uu) + ((h & 2) === 0 ? vv : -vv);
    hash = P[BA]; h = hash & 15; uu = h < 8 ? x - 1 : y; vv = h < 4 ? y : h === 12 || h === 14 ? x - 1 : z; g1 = ((h & 1) === 0 ? uu : -uu) + ((h & 2) === 0 ? vv : -vv);
    hash = P[AB]; h = hash & 15; uu = h < 8 ? x : y - 1; vv = h < 4 ? y - 1 : h === 12 || h === 14 ? x : z; g2 = ((h & 1) === 0 ? uu : -uu) + ((h & 2) === 0 ? vv : -vv);
    hash = P[BB]; h = hash & 15; uu = h < 8 ? x - 1 : y - 1; vv = h < 4 ? y - 1 : h === 12 || h === 14 ? x - 1 : z; g3 = ((h & 1) === 0 ? uu : -uu) + ((h & 2) === 0 ? vv : -vv);
    hash = P[AA + 1]; h = hash & 15; uu = h < 8 ? x : y; vv = h < 4 ? y : h === 12 || h === 14 ? x : z - 1; g4 = ((h & 1) === 0 ? uu : -uu) + ((h & 2) === 0 ? vv : -vv);
    hash = P[BA + 1]; h = hash & 15; uu = h < 8 ? x - 1 : y; vv = h < 4 ? y : h === 12 || h === 14 ? x - 1 : z - 1; g5 = ((h & 1) === 0 ? uu : -uu) + ((h & 2) === 0 ? vv : -vv);
    hash = P[AB + 1]; h = hash & 15; uu = h < 8 ? x : y - 1; vv = h < 4 ? y - 1 : h === 12 || h === 14 ? x : z - 1; g6 = ((h & 1) === 0 ? uu : -uu) + ((h & 2) === 0 ? vv : -vv);
    hash = P[BB + 1]; h = hash & 15; uu = h < 8 ? x - 1 : y - 1; vv = h < 4 ? y - 1 : h === 12 || h === 14 ? x - 1 : z - 1; g7 = ((h & 1) === 0 ? uu : -uu) + ((h & 2) === 0 ? vv : -vv);

    let l1 = g0 + u * (g1 - g0);
    let l2 = g2 + u * (g3 - g2);
    let l3 = g4 + u * (g5 - g4);
    let l4 = g6 + u * (g7 - g6);

    let l5 = l1 + v * (l2 - l1);
    let l6 = l3 + v * (l4 - l3);

    return l5 + w * (l6 - l5);
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
