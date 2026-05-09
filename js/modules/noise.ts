// @ts-check

const permutation = new Uint8Array(512);

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

    // Manual inlining
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = permutation[X] + Y;
    let AA = permutation[A] + Z;
    let AB = permutation[A + 1] + Z;
    let B = permutation[X + 1] + Y;
    let BA = permutation[B] + Z;
    let BB = permutation[B + 1] + Z;

    // grad calculations directly using masked permutation
    const hAA = permutation[AA] & 15;
    const hBA = permutation[BA] & 15;
    const hAB = permutation[AB] & 15;
    const hBB = permutation[BB] & 15;
    const hAA1 = permutation[AA + 1] & 15;
    const hBA1 = permutation[BA + 1] & 15;
    const hAB1 = permutation[AB + 1] & 15;
    const hBB1 = permutation[BB + 1] & 15;

    const x1 = x - 1;
    const y1 = y - 1;
    const z1 = z - 1;

    let gradAA = ((hAA & 1) === 0 ? (hAA < 8 ? x : y) : -(hAA < 8 ? x : y)) + ((hAA & 2) === 0 ? (hAA < 4 ? y : hAA === 12 || hAA === 14 ? x : z) : -(hAA < 4 ? y : hAA === 12 || hAA === 14 ? x : z));
    let gradBA = ((hBA & 1) === 0 ? (hBA < 8 ? x1 : y) : -(hBA < 8 ? x1 : y)) + ((hBA & 2) === 0 ? (hBA < 4 ? y : hBA === 12 || hBA === 14 ? x1 : z) : -(hBA < 4 ? y : hBA === 12 || hBA === 14 ? x1 : z));
    let gradAB = ((hAB & 1) === 0 ? (hAB < 8 ? x : y1) : -(hAB < 8 ? x : y1)) + ((hAB & 2) === 0 ? (hAB < 4 ? y1 : hAB === 12 || hAB === 14 ? x : z) : -(hAB < 4 ? y1 : hAB === 12 || hAB === 14 ? x : z));
    let gradBB = ((hBB & 1) === 0 ? (hBB < 8 ? x1 : y1) : -(hBB < 8 ? x1 : y1)) + ((hBB & 2) === 0 ? (hBB < 4 ? y1 : hBB === 12 || hBB === 14 ? x1 : z) : -(hBB < 4 ? y1 : hBB === 12 || hBB === 14 ? x1 : z));

    let gradAA1 = ((hAA1 & 1) === 0 ? (hAA1 < 8 ? x : y) : -(hAA1 < 8 ? x : y)) + ((hAA1 & 2) === 0 ? (hAA1 < 4 ? y : hAA1 === 12 || hAA1 === 14 ? x : z1) : -(hAA1 < 4 ? y : hAA1 === 12 || hAA1 === 14 ? x : z1));
    let gradBA1 = ((hBA1 & 1) === 0 ? (hBA1 < 8 ? x1 : y) : -(hBA1 < 8 ? x1 : y)) + ((hBA1 & 2) === 0 ? (hBA1 < 4 ? y : hBA1 === 12 || hBA1 === 14 ? x1 : z1) : -(hBA1 < 4 ? y : hBA1 === 12 || hBA1 === 14 ? x1 : z1));
    let gradAB1 = ((hAB1 & 1) === 0 ? (hAB1 < 8 ? x : y1) : -(hAB1 < 8 ? x : y1)) + ((hAB1 & 2) === 0 ? (hAB1 < 4 ? y1 : hAB1 === 12 || hAB1 === 14 ? x : z1) : -(hAB1 < 4 ? y1 : hAB1 === 12 || hAB1 === 14 ? x : z1));
    let gradBB1 = ((hBB1 & 1) === 0 ? (hBB1 < 8 ? x1 : y1) : -(hBB1 < 8 ? x1 : y1)) + ((hBB1 & 2) === 0 ? (hBB1 < 4 ? y1 : hBB1 === 12 || hBB1 === 14 ? x1 : z1) : -(hBB1 < 4 ? y1 : hBB1 === 12 || hBB1 === 14 ? x1 : z1));

    let lerpX1 = gradAA + u * (gradBA - gradAA);
    let lerpX2 = gradAB + u * (gradBB - gradAB);
    let lerpY1 = lerpX1 + v * (lerpX2 - lerpX1);

    let lerpX3 = gradAA1 + u * (gradBA1 - gradAA1);
    let lerpX4 = gradAB1 + u * (gradBB1 - gradAB1);
    let lerpY2 = lerpX3 + v * (lerpX4 - lerpX3);

    return lerpY1 + w * (lerpY2 - lerpY1);
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
