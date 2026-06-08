// @ts-check

const p = new Uint8Array(512);

function grad(hash, x, y, z) {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function noise(x, y, z) {
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

  let A = p[X] + Y;
  let AA = p[A] + Z;
  let AB = p[A + 1] + Z;
  let B = p[X + 1] + Y;
  let BA = p[B] + Z;
  let BB = p[B + 1] + Z;

  // Unnest lerp and grad
  let g000 = grad(p[AA], x, y, z);
  let g100 = grad(p[BA], x - 1, y, z);
  let g010 = grad(p[AB], x, y - 1, z);
  let g110 = grad(p[BB], x - 1, y - 1, z);
  let g001 = grad(p[AA + 1], x, y, z - 1);
  let g101 = grad(p[BA + 1], x - 1, y, z - 1);
  let g011 = grad(p[AB + 1], x, y - 1, z - 1);
  let g111 = grad(p[BB + 1], x - 1, y - 1, z - 1);

  // Inline lerp: a + t * (b - a)
  let l00 = g000 + u * (g100 - g000);
  let l10 = g010 + u * (g110 - g010);
  let l01 = g001 + u * (g101 - g001);
  let l11 = g011 + u * (g111 - g011);

  let l0 = l00 + v * (l10 - l00);
  let l1 = l01 + v * (l11 - l01);

  return l0 + w * (l1 - l0);
}

export const Noise = {
  permutation: p,
  init(seed = 12345) {
    let perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;

    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = Math.imul(1664525, s) + 1013904223 | 0;
      let rand = Math.floor((((s >>> 8) & 0xfffff) / 0x100000) * (i + 1));
      let temp = perm[i];
      perm[i] = perm[rand];
      perm[rand] = temp;
    }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  },
  fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  lerp: (t, a, b) => a + t * (b - a),
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
