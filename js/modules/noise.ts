// @ts-check

const PERMUTATION = new Uint8Array(512);

// Extract to module scope for V8 optimization (removes 'this' context overhead in hot loops)
function lerp(t, a, b) {
  return a + t * (b - a);
}

function grad(hash, x, y, z) {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

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
  fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  lerp,
  grad,
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
    // Inline fade to avoid function call overhead
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);
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
