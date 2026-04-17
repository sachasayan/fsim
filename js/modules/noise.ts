// @ts-check

// Hoisting the permutation array out of the object into a module-scoped constant
// eliminates the "this." context lookup overhead in the hot noise() method.
const P = new Uint8Array(512);

// Pre-calculated gradients for 3D noise.
// Using a flattened Float64Array for O(1) lookups instead of bitwise math and branching
const GRAD3 = new Float64Array([
  1, 1, 0,  -1, 1, 0,  1, -1, 0,  -1, -1, 0,
  1, 0, 1,  -1, 0, 1,  1, 0, -1,  -1, 0, -1,
  0, 1, 1,   0,-1, 1,  0, 1, -1,   0,-1, -1,
  1, 1, 0,   0,-1, 1, -1, 1, 0,    0,-1, -1
]);

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t, a, b) => a + t * (b - a);
const grad = (hash, x, y, z) => {
  let h = (hash & 15) * 3;
  return GRAD3[h] * x + GRAD3[h+1] * y + GRAD3[h+2] * z;
};

export const Noise = {
  permutation: P,
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
    for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  },
  fade,
  lerp,
  grad,
  noise(x, y, z) {
    let X = Math.floor(x) & 255;
    let Y = Math.floor(y) & 255;
    let Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    // Inline fade to avoid function call overhead
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = P[X] + Y;
    let AA = P[A] + Z;
    let AB = P[A + 1] + Z;
    let B = P[X + 1] + Y;
    let BA = P[B] + Z;
    let BB = P[B + 1] + Z;

    return lerp(
      w,
      lerp(
        v,
        lerp(u, grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z)),
        lerp(u, grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z))
      ),
      lerp(
        v,
        lerp(u, grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1)),
        lerp(
          u,
          grad(P[AB + 1], x, y - 1, z - 1),
          grad(P[BB + 1], x - 1, y - 1, z - 1)
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
