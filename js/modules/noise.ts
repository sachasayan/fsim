// @ts-check

// Hoisted for performance to prevent V8 context lookups in hot loop
const P = new Uint8Array(512);

const gradLerp = (h, x, y, z) => {
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

const noiseFunc = function(x, y, z) {
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

  let A = P[X] + Y;
  let AA = P[A] + Z;
  let AB = P[A + 1] + Z;
  let B = P[X + 1] + Y;
  let BA = P[B] + Z;
  let BB = P[B + 1] + Z;

  const x00 = gradLerp(P[AA] & 15, x, y, z);
  const x10 = gradLerp(P[BA] & 15, x - 1, y, z);
  const x01 = gradLerp(P[AB] & 15, x, y - 1, z);
  const x11 = gradLerp(P[BB] & 15, x - 1, y - 1, z);

  const y0 = x00 + u * (x10 - x00);
  const y1 = x01 + u * (x11 - x01);
  const z0 = y0 + v * (y1 - y0);

  const x00_2 = gradLerp(P[AA + 1] & 15, x, y, z - 1);
  const x10_2 = gradLerp(P[BA + 1] & 15, x - 1, y, z - 1);
  const x01_2 = gradLerp(P[AB + 1] & 15, x, y - 1, z - 1);
  const x11_2 = gradLerp(P[BB + 1] & 15, x - 1, y - 1, z - 1);

  const y0_2 = x00_2 + u * (x10_2 - x00_2);
  const y1_2 = x01_2 + u * (x11_2 - x01_2);
  const z1 = y0_2 + v * (y1_2 - y0_2);

  return z0 + w * (z1 - z0);
};

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
  noise: noiseFunc,
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      let f = scale;
      if (octaves === 5) {
        const n0 = noiseFunc(x * f, 0, z * f);
        f *= 2;
        const n1 = noiseFunc(x * f, 0, z * f);
        f *= 2;
        const n2 = noiseFunc(x * f, 0, z * f);
        f *= 2;
        const n3 = noiseFunc(x * f, 0, z * f);
        f *= 2;
        const n4 = noiseFunc(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625) / 1.9375;
      }
      if (octaves === 6) {
        const n0 = noiseFunc(x * f, 0, z * f);
        f *= 2;
        const n1 = noiseFunc(x * f, 0, z * f);
        f *= 2;
        const n2 = noiseFunc(x * f, 0, z * f);
        f *= 2;
        const n3 = noiseFunc(x * f, 0, z * f);
        f *= 2;
        const n4 = noiseFunc(x * f, 0, z * f);
        f *= 2;
        const n5 = noiseFunc(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625 + n5 * 0.03125) / 1.96875;
      }
    }

    let total = 0;
    let frequency = scale;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += noiseFunc(x * frequency, 0, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxValue;
  }
};

Noise.init();
