// @ts-check

const permutation = new Uint8Array(512);

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t, a, b) => a + t * (b - a);
const grad = (hash, x, y, z) => {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

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

  const x1 = x - 1;
  const y1 = y - 1;
  const z1 = z - 1;

  const g000 = grad(permutation[AA], x, y, z);
  const g100 = grad(permutation[BA], x1, y, z);
  const g010 = grad(permutation[AB], x, y1, z);
  const g110 = grad(permutation[BB], x1, y1, z);
  const g001 = grad(permutation[AA + 1], x, y, z1);
  const g101 = grad(permutation[BA + 1], x1, y, z1);
  const g011 = grad(permutation[AB + 1], x, y1, z1);
  const g111 = grad(permutation[BB + 1], x1, y1, z1);

  const l00 = g000 + u * (g100 - g000);
  const l10 = g010 + u * (g110 - g010);
  const l01 = g001 + u * (g101 - g001);
  const l11 = g011 + u * (g111 - g011);

  const l0 = l00 + v * (l10 - l00);
  const l1 = l01 + v * (l11 - l01);

  return l0 + w * (l1 - l0);
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
