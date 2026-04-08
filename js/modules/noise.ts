// @ts-check

const PERMUTATION = new Uint8Array(512);

function initNoise(seed = 12345) {
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
}

function noise3D(x, y, z) {
  let X = Math.floor(x) & 255;
  let Y = Math.floor(y) & 255;
  let Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);

  let u = x * x * x * (x * (x * 6 - 15) + 10);
  let v = y * y * y * (y * (y * 6 - 15) + 10);
  let w = z * z * z * (z * (z * 6 - 15) + 10);

  let A = PERMUTATION[X] + Y;
  let AA = PERMUTATION[A] + Z;
  let AB = PERMUTATION[A + 1] + Z;
  let B = PERMUTATION[X + 1] + Y;
  let BA = PERMUTATION[B] + Z;
  let BB = PERMUTATION[B + 1] + Z;

  let x1 = x - 1;
  let y1 = y - 1;
  let z1 = z - 1;

  let h = PERMUTATION[AA] & 15;
  let u0 = h < 8 ? x : y;
  let v0 = h < 4 ? y : h === 12 || h === 14 ? x : z;
  let g000 = ((h & 1) === 0 ? u0 : -u0) + ((h & 2) === 0 ? v0 : -v0);

  h = PERMUTATION[BA] & 15;
  u0 = h < 8 ? x1 : y;
  v0 = h < 4 ? y : h === 12 || h === 14 ? x1 : z;
  let g100 = ((h & 1) === 0 ? u0 : -u0) + ((h & 2) === 0 ? v0 : -v0);

  h = PERMUTATION[AB] & 15;
  u0 = h < 8 ? x : y1;
  v0 = h < 4 ? y1 : h === 12 || h === 14 ? x : z;
  let g010 = ((h & 1) === 0 ? u0 : -u0) + ((h & 2) === 0 ? v0 : -v0);

  h = PERMUTATION[BB] & 15;
  u0 = h < 8 ? x1 : y1;
  v0 = h < 4 ? y1 : h === 12 || h === 14 ? x1 : z;
  let g110 = ((h & 1) === 0 ? u0 : -u0) + ((h & 2) === 0 ? v0 : -v0);

  h = PERMUTATION[AA + 1] & 15;
  u0 = h < 8 ? x : y;
  v0 = h < 4 ? y : h === 12 || h === 14 ? x : z1;
  let g001 = ((h & 1) === 0 ? u0 : -u0) + ((h & 2) === 0 ? v0 : -v0);

  h = PERMUTATION[BA + 1] & 15;
  u0 = h < 8 ? x1 : y;
  v0 = h < 4 ? y : h === 12 || h === 14 ? x1 : z1;
  let g101 = ((h & 1) === 0 ? u0 : -u0) + ((h & 2) === 0 ? v0 : -v0);

  h = PERMUTATION[AB + 1] & 15;
  u0 = h < 8 ? x : y1;
  v0 = h < 4 ? y1 : h === 12 || h === 14 ? x : z1;
  let g011 = ((h & 1) === 0 ? u0 : -u0) + ((h & 2) === 0 ? v0 : -v0);

  h = PERMUTATION[BB + 1] & 15;
  u0 = h < 8 ? x1 : y1;
  v0 = h < 4 ? y1 : h === 12 || h === 14 ? x1 : z1;
  let g111 = ((h & 1) === 0 ? u0 : -u0) + ((h & 2) === 0 ? v0 : -v0);

  let lx0 = g000 + u * (g100 - g000);
  let lx1 = g010 + u * (g110 - g010);
  let lx2 = g001 + u * (g101 - g001);
  let lx3 = g011 + u * (g111 - g011);

  let ly0 = lx0 + v * (lx1 - lx0);
  let ly1 = lx2 + v * (lx3 - lx2);

  return ly0 + w * (ly1 - ly0);
}

export const Noise = {
  permutation: PERMUTATION,
  init: initNoise,
  fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  lerp: (t, a, b) => a + t * (b - a),
  grad(hash, x, y, z) {
    let h = hash & 15;
    let u = h < 8 ? x : y;
    let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  },
  noise: noise3D,
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      let f = scale;
      if (octaves === 5) {
        const n0 = noise3D(x * f, 0, z * f);
        f *= 2;
        const n1 = noise3D(x * f, 0, z * f);
        f *= 2;
        const n2 = noise3D(x * f, 0, z * f);
        f *= 2;
        const n3 = noise3D(x * f, 0, z * f);
        f *= 2;
        const n4 = noise3D(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625) / 1.9375;
      }
      if (octaves === 6) {
        const n0 = noise3D(x * f, 0, z * f);
        f *= 2;
        const n1 = noise3D(x * f, 0, z * f);
        f *= 2;
        const n2 = noise3D(x * f, 0, z * f);
        f *= 2;
        const n3 = noise3D(x * f, 0, z * f);
        f *= 2;
        const n4 = noise3D(x * f, 0, z * f);
        f *= 2;
        const n5 = noise3D(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625 + n5 * 0.03125) / 1.96875;
      }
    }

    let total = 0;
    let frequency = scale;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise3D(x * frequency, 0, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxValue;
  }
};

Noise.init();
