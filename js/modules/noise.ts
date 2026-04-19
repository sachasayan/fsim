// @ts-check

// Hoisted for max V8 performance (O(1) lookups)
const PERMUTATION = new Uint8Array(512);
const G_X = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const G_Y = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const G_Z = new Float64Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);

export const Noise = {
  permutation: PERMUTATION,
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
    for (let i = 0; i < 512; i++) PERMUTATION[i] = p[i & 255];
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

    let A = PERMUTATION[X] + Y;
    let AA = PERMUTATION[A] + Z;
    let AB = PERMUTATION[A + 1] + Z;
    let B = PERMUTATION[X + 1] + Y;
    let BA = PERMUTATION[B] + Z;
    let BB = PERMUTATION[B + 1] + Z;

    // Inline grad and lerp with O(1) flattened typed array lookups
    let hAA = PERMUTATION[AA] & 15;
    let gAA = x * G_X[hAA] + y * G_Y[hAA] + z * G_Z[hAA];
    let hBA = PERMUTATION[BA] & 15;
    let gBA = (x - 1) * G_X[hBA] + y * G_Y[hBA] + z * G_Z[hBA];
    let lerp1 = gAA + u * (gBA - gAA);

    let hAB = PERMUTATION[AB] & 15;
    let gAB = x * G_X[hAB] + (y - 1) * G_Y[hAB] + z * G_Z[hAB];
    let hBB = PERMUTATION[BB] & 15;
    let gBB = (x - 1) * G_X[hBB] + (y - 1) * G_Y[hBB] + z * G_Z[hBB];
    let lerp2 = gAB + u * (gBB - gAB);

    let lerp5 = lerp1 + v * (lerp2 - lerp1);

    let hAA1 = PERMUTATION[AA + 1] & 15;
    let gAA1 = x * G_X[hAA1] + y * G_Y[hAA1] + (z - 1) * G_Z[hAA1];
    let hBA1 = PERMUTATION[BA + 1] & 15;
    let gBA1 = (x - 1) * G_X[hBA1] + y * G_Y[hBA1] + (z - 1) * G_Z[hBA1];
    let lerp3 = gAA1 + u * (gBA1 - gAA1);

    let hAB1 = PERMUTATION[AB + 1] & 15;
    let gAB1 = x * G_X[hAB1] + (y - 1) * G_Y[hAB1] + (z - 1) * G_Z[hAB1];
    let hBB1 = PERMUTATION[BB + 1] & 15;
    let gBB1 = (x - 1) * G_X[hBB1] + (y - 1) * G_Y[hBB1] + (z - 1) * G_Z[hBB1];
    let lerp4 = gAB1 + u * (gBB1 - gAB1);

    let lerp6 = lerp3 + v * (lerp4 - lerp3);

    return lerp5 + w * (lerp6 - lerp5);
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
