// @ts-check

const permutation = new Uint8Array(512);
const gradX = new Float32Array(16);
const gradY = new Float32Array(16);
const gradZ = new Float32Array(16);

for (let h = 0; h < 16; h++) {
  let u_sel = h < 8 ? 0 : 1;
  let v_sel = h < 4 ? 1 : h === 12 || h === 14 ? 0 : 2;

  let u_sign = (h & 1) === 0 ? 1 : -1;
  let v_sign = (h & 2) === 0 ? 1 : -1;

  if (u_sel === 0) gradX[h] += u_sign;
  if (u_sel === 1) gradY[h] += u_sign;

  if (v_sel === 0) gradX[h] += v_sign;
  if (v_sel === 1) gradY[h] += v_sign;
  if (v_sel === 2) gradZ[h] += v_sign;
}

// ⚡ Bolt Optimization: Extracted permutation array outside the object to avoid `this.` lookup overhead.
// ⚡ Bolt Optimization: Precalculate the 16 possible gradients from the original `grad` logic into Float32Arrays.
// This allows us to replace multiple inner-loop conditional branches and bitwise checks with O(1) array lookups.
export const Noise = {
  permutation: permutation,
  init(seed = 12345) {
    let p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (Math.imul(1664525, s) + 1013904223) | 0;
      let rand = Math.floor((((s >>> 8) & 0xfffff) / 0x100000) * (i + 1));
      let temp = p[i];
      p[i] = p[rand];
      p[rand] = temp;
    }
    for (let i = 0; i < 512; i++) permutation[i] = p[i & 255];
  },
  // We keep the original fade, lerp, and grad functions attached to avoid breaking any external callers.
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

    // ⚡ Bolt Optimization: Inline mathematical operations (fade and lerp) and use
    // precalculated gradient arrays to dramatically reduce function overhead and branching.
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = permutation[X] + Y;
    let AA = permutation[A] + Z;
    let AB = permutation[A + 1] + Z;
    let B = permutation[X + 1] + Y;
    let BA = permutation[B] + Z;
    let BB = permutation[B + 1] + Z;

    let hAA = permutation[AA] & 15;
    let gradAA = x * gradX[hAA] + y * gradY[hAA] + z * gradZ[hAA];

    let hBA = permutation[BA] & 15;
    let gradBA = (x - 1) * gradX[hBA] + y * gradY[hBA] + z * gradZ[hBA];

    let hAB = permutation[AB] & 15;
    let gradAB = x * gradX[hAB] + (y - 1) * gradY[hAB] + z * gradZ[hAB];

    let hBB = permutation[BB] & 15;
    let gradBB = (x - 1) * gradX[hBB] + (y - 1) * gradY[hBB] + z * gradZ[hBB];

    let l1 = gradAA + u * (gradBA - gradAA);
    let l2 = gradAB + u * (gradBB - gradAB);
    let l3 = l1 + v * (l2 - l1);

    let hAA1 = permutation[AA + 1] & 15;
    let gradAA1 = x * gradX[hAA1] + y * gradY[hAA1] + (z - 1) * gradZ[hAA1];

    let hBA1 = permutation[BA + 1] & 15;
    let gradBA1 =
      (x - 1) * gradX[hBA1] + y * gradY[hBA1] + (z - 1) * gradZ[hBA1];

    let hAB1 = permutation[AB + 1] & 15;
    let gradAB1 =
      x * gradX[hAB1] + (y - 1) * gradY[hAB1] + (z - 1) * gradZ[hAB1];

    let hBB1 = permutation[BB + 1] & 15;
    let gradBB1 =
      (x - 1) * gradX[hBB1] + (y - 1) * gradY[hBB1] + (z - 1) * gradZ[hBB1];

    let l4 = gradAA1 + u * (gradBA1 - gradAA1);
    let l5 = gradAB1 + u * (gradBB1 - gradAB1);
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
        return (
          (n0 +
            n1 * 0.5 +
            n2 * 0.25 +
            n3 * 0.125 +
            n4 * 0.0625 +
            n5 * 0.03125) /
          1.96875
        );
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
  },
};

Noise.init();
