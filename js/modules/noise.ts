// @ts-check

const P = new Uint8Array(512);
const GRAD_X = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const GRAD_Y = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const GRAD_Z = new Float64Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);

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

    // Optimized: Inline 'fade' logic directly for u, v, w (e.g., t * t * t * (t * (t * 6 - 15) + 10))
    // to avoid function call overhead.
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = P[X] + Y;
    let AA = P[A] + Z;
    let AB = P[A + 1] + Z;
    let B = P[X + 1] + Y;
    let BA = P[B] + Z;
    let BB = P[B + 1] + Z;

    // Optimized: Replace 'grad' switch/branching logic with O(1) lookups
    // into pre-calculated Float64Arrays (GRAD_X, GRAD_Y, GRAD_Z).
    let hAA = P[AA] & 15;
    let gAA = GRAD_X[hAA]*x + GRAD_Y[hAA]*y + GRAD_Z[hAA]*z;

    let hBA = P[BA] & 15;
    let gBA = GRAD_X[hBA]*(x-1) + GRAD_Y[hBA]*y + GRAD_Z[hBA]*z;

    let hAB = P[AB] & 15;
    let gAB = GRAD_X[hAB]*x + GRAD_Y[hAB]*(y-1) + GRAD_Z[hAB]*z;

    let hBB = P[BB] & 15;
    let gBB = GRAD_X[hBB]*(x-1) + GRAD_Y[hBB]*(y-1) + GRAD_Z[hBB]*z;

    let hAA1 = P[AA + 1] & 15;
    let gAA1 = GRAD_X[hAA1]*x + GRAD_Y[hAA1]*y + GRAD_Z[hAA1]*(z-1);

    let hBA1 = P[BA + 1] & 15;
    let gBA1 = GRAD_X[hBA1]*(x-1) + GRAD_Y[hBA1]*y + GRAD_Z[hBA1]*(z-1);

    let hAB1 = P[AB + 1] & 15;
    let gAB1 = GRAD_X[hAB1]*x + GRAD_Y[hAB1]*(y-1) + GRAD_Z[hAB1]*(z-1);

    let hBB1 = P[BB + 1] & 15;
    let gBB1 = GRAD_X[hBB1]*(x-1) + GRAD_Y[hBB1]*(y-1) + GRAD_Z[hBB1]*(z-1);

    // Optimized: Inline 'lerp' logic (e.g., a + t * (b - a)) to eliminate nested function calls.
    let l1 = gAA + u * (gBA - gAA);
    let l2 = gAB + u * (gBB - gAB);
    let l3 = l1 + v * (l2 - l1);

    let l4 = gAA1 + u * (gBA1 - gAA1);
    let l5 = gAB1 + u * (gBB1 - gAB1);
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
