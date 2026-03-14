// Pre-calculated gradient arrays
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

    let h;
    let gradAA, gradBA, gradAB, gradBB, gradAA1, gradBA1, gradAB1, gradBB1;
    let cx = x - 1, cy = y - 1, cz = z - 1;

    // Inline grad with pre-calculated tables
    h = this.permutation[AA] & 15;
    gradAA = gradX[h] * x + gradY[h] * y + gradZ[h] * z;

    h = this.permutation[BA] & 15;
    gradBA = gradX[h] * cx + gradY[h] * y + gradZ[h] * z;

    h = this.permutation[AB] & 15;
    gradAB = gradX[h] * x + gradY[h] * cy + gradZ[h] * z;

    h = this.permutation[BB] & 15;
    gradBB = gradX[h] * cx + gradY[h] * cy + gradZ[h] * z;

    h = this.permutation[AA + 1] & 15;
    gradAA1 = gradX[h] * x + gradY[h] * y + gradZ[h] * cz;

    h = this.permutation[BA + 1] & 15;
    gradBA1 = gradX[h] * cx + gradY[h] * y + gradZ[h] * cz;

    h = this.permutation[AB + 1] & 15;
    gradAB1 = gradX[h] * x + gradY[h] * cy + gradZ[h] * cz;

    h = this.permutation[BB + 1] & 15;
    gradBB1 = gradX[h] * cx + gradY[h] * cy + gradZ[h] * cz;

    // Inline lerp
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
