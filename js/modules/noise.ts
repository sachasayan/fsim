// @ts-check

const permutation = new Uint8Array(512);

const gradX = new Float32Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const gradY = new Float32Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const gradZ = new Float32Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t, a, b) => a + t * (b - a);
const grad = (hash, x, y, z) => {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

const noise = (x, y, z) => {
  let X = Math.floor(x) & 255;
  let Y = Math.floor(y) & 255;
  let Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);

  let u = x * x * x * (x * (x * 6 - 15) + 10);
  let v = y * y * y * (y * (y * 6 - 15) + 10);
  let w = z * z * z * (z * (z * 6 - 15) + 10);

  let A = permutation[X] + Y;
  let AA = permutation[A] + Z;
  let AB = permutation[A + 1] + Z;
  let B = permutation[X + 1] + Y;
  let BA = permutation[B] + Z;
  let BB = permutation[B + 1] + Z;

  const h1 = permutation[AA] & 15;
  const g1 = gradX[h1] * x + gradY[h1] * y + gradZ[h1] * z;

  const h2 = permutation[BA] & 15;
  const g2 = gradX[h2] * (x - 1) + gradY[h2] * y + gradZ[h2] * z;

  const l1 = g1 + u * (g2 - g1);

  const h3 = permutation[AB] & 15;
  const g3 = gradX[h3] * x + gradY[h3] * (y - 1) + gradZ[h3] * z;

  const h4 = permutation[BB] & 15;
  const g4 = gradX[h4] * (x - 1) + gradY[h4] * (y - 1) + gradZ[h4] * z;

  const l2 = g3 + u * (g4 - g3);

  const l3 = l1 + v * (l2 - l1);

  const h5 = permutation[AA + 1] & 15;
  const g5 = gradX[h5] * x + gradY[h5] * y + gradZ[h5] * (z - 1);

  const h6 = permutation[BA + 1] & 15;
  const g6 = gradX[h6] * (x - 1) + gradY[h6] * y + gradZ[h6] * (z - 1);

  const l4 = g5 + u * (g6 - g5);

  const h7 = permutation[AB + 1] & 15;
  const g7 = gradX[h7] * x + gradY[h7] * (y - 1) + gradZ[h7] * (z - 1);

  const h8 = permutation[BB + 1] & 15;
  const g8 = gradX[h8] * (x - 1) + gradY[h8] * (y - 1) + gradZ[h8] * (z - 1);

  const l5 = g7 + u * (g8 - g7);

  const l6 = l4 + v * (l5 - l4);

  return l3 + w * (l6 - l3);
};

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
  fade,
  lerp,
  grad,
  noise,
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      let f = scale;
      if (octaves === 5) {
        const n0 = noise(x * f, 0, z * f);
        f *= 2;
        const n1 = noise(x * f, 0, z * f);
        f *= 2;
        const n2 = noise(x * f, 0, z * f);
        f *= 2;
        const n3 = noise(x * f, 0, z * f);
        f *= 2;
        const n4 = noise(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625) / 1.9375;
      }
      if (octaves === 6) {
        const n0 = noise(x * f, 0, z * f);
        f *= 2;
        const n1 = noise(x * f, 0, z * f);
        f *= 2;
        const n2 = noise(x * f, 0, z * f);
        f *= 2;
        const n3 = noise(x * f, 0, z * f);
        f *= 2;
        const n4 = noise(x * f, 0, z * f);
        f *= 2;
        const n5 = noise(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625 + n5 * 0.03125) / 1.96875;
      }
    }

    let total = 0;
    let frequency = scale;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise(x * frequency, 0, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxValue;
  }
};

Noise.init();
