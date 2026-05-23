// @ts-check

const permutation = new Uint8Array(512);

// Inlined fade
// fade(t) => t * t * t * (t * (t * 6 - 15) + 10)

// Inlined lerp
// lerp(t, a, b) => a + t * (b - a)

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

  let u = x * x * x * (x * (x * 6 - 15) + 10);
  let v = y * y * y * (y * (y * 6 - 15) + 10);
  let w = z * z * z * (z * (z * 6 - 15) + 10);

  let A = permutation[X] + Y;
  let AA = permutation[A] + Z;
  let AB = permutation[A + 1] + Z;
  let B = permutation[X + 1] + Y;
  let BA = permutation[B] + Z;
  let BB = permutation[B + 1] + Z;

  // Manual lerp and grad
  // lerp(t, a, b) => a + t * (b - a)

  // lerp(u, grad(permutation[AA], x, y, z), grad(permutation[BA], x - 1, y, z))
  let gAA = grad(permutation[AA], x, y, z);
  let l1 = gAA + u * (grad(permutation[BA], x - 1, y, z) - gAA);

  let gAB = grad(permutation[AB], x, y - 1, z);
  let l2 = gAB + u * (grad(permutation[BB], x - 1, y - 1, z) - gAB);

  let l3 = l1 + v * (l2 - l1);

  let gAA1 = grad(permutation[AA + 1], x, y, z - 1);
  let l4 = gAA1 + u * (grad(permutation[BA + 1], x - 1, y, z - 1) - gAA1);

  let gAB1 = grad(permutation[AB + 1], x, y - 1, z - 1);
  let l5 = gAB1 + u * (grad(permutation[BB + 1], x - 1, y - 1, z - 1) - gAB1);

  let l6 = l4 + v * (l5 - l4);

  return l3 + w * (l6 - l3);
}

export const Noise = {
  permutation,
  init(seed = 12345) {
    let p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (Math.imul(1664525, s) + 1013904223) | 0;
      let rand = Math.floor((((s >>> 8) & 0xfffff) / 0x100000) * (i + 1));
      let temp = p[i];
      p[i] = p[rand];
      p[rand] = temp;
    }
    for (let i = 0; i < 512; i++) permutation[i] = p[i & 255];
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
        return (
          (n0 +
            n1 * 0.5 +
            n2 * 0.25 +
            n3 * 0.125 +
            n4 * 0.0625 +
            n5 * 0.03125) /
          1.96875
        );
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
  },
};

Noise.init();
