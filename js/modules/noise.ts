// @ts-check

const PERM = new Uint8Array(512);

const grad = (hash, x, y, z) => {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

const lerp = (t, a, b) => a + t * (b - a);

const noise3D = (x, y, z) => {
  let fx = Math.floor(x);
  let fy = Math.floor(y);
  let fz = Math.floor(z);
  let X = fx & 255;
  let Y = fy & 255;
  let Z = fz & 255;
  x -= fx;
  y -= fy;
  z -= fz;

  let u = x * x * x * (x * (x * 6 - 15) + 10);
  let v = y * y * y * (y * (y * 6 - 15) + 10);
  let w = z * z * z * (z * (z * 6 - 15) + 10);

  let A = PERM[X] + Y;
  let AA = PERM[A] + Z;
  let AB = PERM[A + 1] + Z;
  let B = PERM[X + 1] + Y;
  let BA = PERM[B] + Z;
  let BB = PERM[B + 1] + Z;

  return lerp(
    w,
    lerp(
      v,
      lerp(u, grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z)),
      lerp(u, grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z))
    ),
    lerp(
      v,
      lerp(u, grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1)),
      lerp(
        u,
        grad(PERM[AB + 1], x, y - 1, z - 1),
        grad(PERM[BB + 1], x - 1, y - 1, z - 1)
      )
    )
  );
};

export const Noise = {
  permutation: PERM,
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
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  },
  fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  lerp,
  grad,
  noise: noise3D,
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      let f = scale;
      if (octaves === 5) {
        let f2 = f * 2;
        let f4 = f * 4;
        let f8 = f * 8;
        let f16 = f * 16;
        const n0 = noise3D(x * f, 0, z * f);
        const n1 = noise3D(x * f2, 0, z * f2);
        const n2 = noise3D(x * f4, 0, z * f4);
        const n3 = noise3D(x * f8, 0, z * f8);
        const n4 = noise3D(x * f16, 0, z * f16);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625) / 1.9375;
      }
      if (octaves === 6) {
        let f2 = f * 2;
        let f4 = f * 4;
        let f8 = f * 8;
        let f16 = f * 16;
        let f32 = f * 32;
        const n0 = noise3D(x * f, 0, z * f);
        const n1 = noise3D(x * f2, 0, z * f2);
        const n2 = noise3D(x * f4, 0, z * f4);
        const n3 = noise3D(x * f8, 0, z * f8);
        const n4 = noise3D(x * f16, 0, z * f16);
        const n5 = noise3D(x * f32, 0, z * f32);
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
