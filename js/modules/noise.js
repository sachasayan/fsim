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
    let X0 = Math.floor(x);
    let Y0 = Math.floor(y);
    let Z0 = Math.floor(z);
    let X = X0 & 255;
    let Y = Y0 & 255;
    let Z = Z0 & 255;

    x -= X0;
    y -= Y0;
    z -= Z0;

    // Inline fade
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = P[X] + Y;
    let AA = P[A] + Z;
    let AB = P[A + 1] + Z;
    let B = P[X + 1] + Y;
    let BA = P[B] + Z;
    let BB = P[B + 1] + Z;

    // Precalculate for gradient lookups
    let x1 = x - 1;
    let y1 = y - 1;
    let z1 = z - 1;

    let h, gU, gV;
    let l1, l2, res1;

    h = P[AA] & 15;
    gU = h < 8 ? x : y;
    gV = h < 4 ? y : h === 12 || h === 14 ? x : z;
    l1 = ((h & 1) === 0 ? gU : -gU) + ((h & 2) === 0 ? gV : -gV);

    h = P[BA] & 15;
    gU = h < 8 ? x1 : y;
    gV = h < 4 ? y : h === 12 || h === 14 ? x1 : z;
    l1 += u * (((h & 1) === 0 ? gU : -gU) + ((h & 2) === 0 ? gV : -gV) - l1);

    h = P[AB] & 15;
    gU = h < 8 ? x : y1;
    gV = h < 4 ? y1 : h === 12 || h === 14 ? x : z;
    l2 = ((h & 1) === 0 ? gU : -gU) + ((h & 2) === 0 ? gV : -gV);

    h = P[BB] & 15;
    gU = h < 8 ? x1 : y1;
    gV = h < 4 ? y1 : h === 12 || h === 14 ? x1 : z;
    l2 += u * (((h & 1) === 0 ? gU : -gU) + ((h & 2) === 0 ? gV : -gV) - l2);

    res1 = l1 + v * (l2 - l1);

    h = P[AA + 1] & 15;
    gU = h < 8 ? x : y;
    gV = h < 4 ? y : h === 12 || h === 14 ? x : z1;
    l1 = ((h & 1) === 0 ? gU : -gU) + ((h & 2) === 0 ? gV : -gV);

    h = P[BA + 1] & 15;
    gU = h < 8 ? x1 : y;
    gV = h < 4 ? y : h === 12 || h === 14 ? x1 : z1;
    l1 += u * (((h & 1) === 0 ? gU : -gU) + ((h & 2) === 0 ? gV : -gV) - l1);

    h = P[AB + 1] & 15;
    gU = h < 8 ? x : y1;
    gV = h < 4 ? y1 : h === 12 || h === 14 ? x : z1;
    l2 = ((h & 1) === 0 ? gU : -gU) + ((h & 2) === 0 ? gV : -gV);

    h = P[BB + 1] & 15;
    gU = h < 8 ? x1 : y1;
    gV = h < 4 ? y1 : h === 12 || h === 14 ? x1 : z1;
    l2 += u * (((h & 1) === 0 ? gU : -gU) + ((h & 2) === 0 ? gV : -gV) - l2);

    return res1 + w * (l1 + v * (l2 - l1) - res1);
  },
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      let f = scale;
      let f2 = f * 2;
      let f4 = f * 4;
      let f8 = f * 8;
      let f16 = f * 16;
      let n = this.noise;
      if (octaves === 5) {
        return (
          n(x * f, 0, z * f) +
          n(x * f2, 0, z * f2) * 0.5 +
          n(x * f4, 0, z * f4) * 0.25 +
          n(x * f8, 0, z * f8) * 0.125 +
          n(x * f16, 0, z * f16) * 0.0625
        ) / 1.9375;
      }
      if (octaves === 6) {
        let f32 = f * 32;
        return (
          n(x * f, 0, z * f) +
          n(x * f2, 0, z * f2) * 0.5 +
          n(x * f4, 0, z * f4) * 0.25 +
          n(x * f8, 0, z * f8) * 0.125 +
          n(x * f16, 0, z * f16) * 0.0625 +
          n(x * f32, 0, z * f32) * 0.03125
        ) / 1.96875;
      }
    }

    let total = 0;
    let frequency = scale;
    let amplitude = 1;
    let maxValue = 0;
    let n = this.noise;
    for (let i = 0; i < octaves; i++) {
      total += n(x * frequency, 0, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxValue;
  }
};

Noise.init();
