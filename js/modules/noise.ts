// @ts-check

// ⚡ Bolt: Hoist PERMUTATION to module scope to eliminate `this.permutation` property lookup overhead in the hot loop
const PERMUTATION = new Uint8Array(512);

// ⚡ Bolt: Hoist math helpers to module scope to avoid `this.` lookup overhead in noise generation
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t, a, b) => a + t * (b - a);
const grad = (hash, x, y, z) => {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

// ⚡ Bolt: Hoist noise function to module scope to avoid `this.noise` lookups in fractal loops
const noise = (x, y, z) => {
  let X = Math.floor(x) & 255;
  let Y = Math.floor(y) & 255;
  let Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  let u = fade(x);
  let v = fade(y);
  let w = fade(z);
  let A = PERMUTATION[X] + Y;
  let AA = PERMUTATION[A] + Z;
  let AB = PERMUTATION[A + 1] + Z;
  let B = PERMUTATION[X + 1] + Y;
  let BA = PERMUTATION[B] + Z;
  let BB = PERMUTATION[B + 1] + Z;

  return lerp(
    w,
    lerp(
      v,
      lerp(u, grad(PERMUTATION[AA], x, y, z), grad(PERMUTATION[BA], x - 1, y, z)),
      lerp(u, grad(PERMUTATION[AB], x, y - 1, z), grad(PERMUTATION[BB], x - 1, y - 1, z))
    ),
    lerp(
      v,
      lerp(u, grad(PERMUTATION[AA + 1], x, y, z - 1), grad(PERMUTATION[BA + 1], x - 1, y, z - 1)),
      lerp(
        u,
        grad(PERMUTATION[AB + 1], x, y - 1, z - 1),
        grad(PERMUTATION[BB + 1], x - 1, y - 1, z - 1)
      )
    )
  );
};

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
