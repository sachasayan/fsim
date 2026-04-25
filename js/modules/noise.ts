// @ts-check

// Hoist permutation array to module scope for faster V8 access
const perm = new Uint8Array(512);

export const Noise = {
  permutation: perm,
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
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
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

    // Inline fade math for hot loop performance
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = perm[X] + Y;
    let AA = perm[A] + Z;
    let AB = perm[A + 1] + Z;
    let B = perm[X + 1] + Y;
    let BA = perm[B] + Z;
    let BB = perm[B + 1] + Z;

    return Noise.lerp(
      w,
      Noise.lerp(
        v,
        Noise.lerp(u, Noise.grad(perm[AA], x, y, z), Noise.grad(perm[BA], x - 1, y, z)),
        Noise.lerp(u, Noise.grad(perm[AB], x, y - 1, z), Noise.grad(perm[BB], x - 1, y - 1, z))
      ),
      Noise.lerp(
        v,
        Noise.lerp(u, Noise.grad(perm[AA + 1], x, y, z - 1), Noise.grad(perm[BA + 1], x - 1, y, z - 1)),
        Noise.lerp(
          u,
          Noise.grad(perm[AB + 1], x, y - 1, z - 1),
          Noise.grad(perm[BB + 1], x - 1, y - 1, z - 1)
        )
      )
    );
  },
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      let f = scale;
      if (octaves === 5) {
        const n0 = Noise.noise(x * f, 0, z * f);
        f *= 2;
        const n1 = Noise.noise(x * f, 0, z * f);
        f *= 2;
        const n2 = Noise.noise(x * f, 0, z * f);
        f *= 2;
        const n3 = Noise.noise(x * f, 0, z * f);
        f *= 2;
        const n4 = Noise.noise(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625) / 1.9375;
      }
      if (octaves === 6) {
        const n0 = Noise.noise(x * f, 0, z * f);
        f *= 2;
        const n1 = Noise.noise(x * f, 0, z * f);
        f *= 2;
        const n2 = Noise.noise(x * f, 0, z * f);
        f *= 2;
        const n3 = Noise.noise(x * f, 0, z * f);
        f *= 2;
        const n4 = Noise.noise(x * f, 0, z * f);
        f *= 2;
        const n5 = Noise.noise(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625 + n5 * 0.03125) / 1.96875;
      }
    }

    let total = 0;
    let frequency = scale;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += Noise.noise(x * frequency, 0, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxValue;
  }
};

Noise.init();