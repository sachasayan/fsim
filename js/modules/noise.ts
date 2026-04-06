// @ts-check

const P = new Uint8Array(512);

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

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

  let u = fade(x);
  let v = fade(y);
  let w = fade(z);

  let A = P[X] + Y;
  let AA = P[A] + Z;
  let AB = P[A + 1] + Z;
  let B = P[X + 1] + Y;
  let BA = P[B] + Z;
  let BB = P[B + 1] + Z;

  const gAA = grad(P[AA], x, y, z);
  const x1 = gAA + u * (grad(P[BA], x - 1, y, z) - gAA);

  const gAB = grad(P[AB], x, y - 1, z);
  const x2 = gAB + u * (grad(P[BB], x - 1, y - 1, z) - gAB);

  const y1 = x1 + v * (x2 - x1);

  const gAA1 = grad(P[AA + 1], x, y, z - 1);
  const x3 = gAA1 + u * (grad(P[BA + 1], x - 1, y, z - 1) - gAA1);

  const gAB1 = grad(P[AB + 1], x, y - 1, z - 1);
  const x4 = gAB1 + u * (grad(P[BB + 1], x - 1, y - 1, z - 1) - gAB1);

  const y2 = x3 + v * (x4 - x3);

  return y1 + w * (y2 - y1);
};

export const Noise = {
  permutation: P,
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
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  },
  fade,
  lerp: (t, a, b) => a + t * (b - a),
  grad,
  noise,
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      let f = scale;
      if (octaves === 5) {
        let n0 = noise(x * f, 0, z * f); f *= 2;
        let n1 = noise(x * f, 0, z * f); f *= 2;
        let n2 = noise(x * f, 0, z * f); f *= 2;
        let n3 = noise(x * f, 0, z * f); f *= 2;
        let n4 = noise(x * f, 0, z * f);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625) / 1.9375;
      }
      if (octaves === 6) {
        let n0 = noise(x * f, 0, z * f); f *= 2;
        let n1 = noise(x * f, 0, z * f); f *= 2;
        let n2 = noise(x * f, 0, z * f); f *= 2;
        let n3 = noise(x * f, 0, z * f); f *= 2;
        let n4 = noise(x * f, 0, z * f); f *= 2;
        let n5 = noise(x * f, 0, z * f);
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
