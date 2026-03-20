// Pre-calculate gradient values to avoid conditional branching
const grad3 = new Float32Array([
     1, 1, 0,    -1, 1, 0,     1,-1, 0,    -1,-1, 0,
     1, 0, 1,    -1, 0, 1,     1, 0,-1,    -1, 0,-1,
     0, 1, 1,     0,-1, 1,     0, 1,-1,     0,-1,-1,
     1, 1, 0,     0,-1, 1,    -1, 1, 0,     0,-1,-1
]);

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

    // Inline fade
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = this.permutation[X] + Y;
    let AA = this.permutation[A] + Z;
    let AB = this.permutation[A + 1] + Z;
    let B = this.permutation[X + 1] + Y;
    let BA = this.permutation[B] + Z;
    let BB = this.permutation[B + 1] + Z;

    // Fast inline gradient lookups using flat array for multipliers
    let hAA = (this.permutation[AA] & 15) * 3;
    let hBA = (this.permutation[BA] & 15) * 3;
    let hAB = (this.permutation[AB] & 15) * 3;
    let hBB = (this.permutation[BB] & 15) * 3;
    let hAA1 = (this.permutation[AA + 1] & 15) * 3;
    let hBA1 = (this.permutation[BA + 1] & 15) * 3;
    let hAB1 = (this.permutation[AB + 1] & 15) * 3;
    let hBB1 = (this.permutation[BB + 1] & 15) * 3;

    let x1 = x - 1, y1 = y - 1, z1 = z - 1;

    let l1 = grad3[hAA]*x + grad3[hAA+1]*y + grad3[hAA+2]*z;
    let l2 = grad3[hBA]*x1 + grad3[hBA+1]*y + grad3[hBA+2]*z;
    let res1 = l1 + u * (l2 - l1);

    let l3 = grad3[hAB]*x + grad3[hAB+1]*y1 + grad3[hAB+2]*z;
    let l4 = grad3[hBB]*x1 + grad3[hBB+1]*y1 + grad3[hBB+2]*z;
    let res2 = l3 + u * (l4 - l3);

    let resA = res1 + v * (res2 - res1);

    let l5 = grad3[hAA1]*x + grad3[hAA1+1]*y + grad3[hAA1+2]*z1;
    let l6 = grad3[hBA1]*x1 + grad3[hBA1+1]*y + grad3[hBA1+2]*z1;
    let res3 = l5 + u * (l6 - l5);

    let l7 = grad3[hAB1]*x + grad3[hAB1+1]*y1 + grad3[hAB1+2]*z1;
    let l8 = grad3[hBB1]*x1 + grad3[hBB1+1]*y1 + grad3[hBB1+2]*z1;
    let res4 = l7 + u * (l8 - l7);

    let resB = res3 + v * (res4 - res3);

    return resA + w * (resB - resA);
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
