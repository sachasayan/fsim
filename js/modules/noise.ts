// @ts-check

const P = new Uint8Array(512);

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t, a, b) {
  return a + t * (b - a);
}

function grad(hash, x, y, z) {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function noise(x, y, z) {
  let floorX = Math.floor(x);
  let floorY = Math.floor(y);
  let floorZ = Math.floor(z);

  let X = floorX & 255;
  let Y = floorY & 255;
  let Z = floorZ & 255;

  x -= floorX;
  y -= floorY;
  z -= floorZ;

  let u = x * x * x * (x * (x * 6 - 15) + 10);
  let v = y * y * y * (y * (y * 6 - 15) + 10);
  let w = z * z * z * (z * (z * 6 - 15) + 10);

  let A = P[X] + Y;
  let AA = P[A] + Z;
  let AB = P[A + 1] + Z;
  let B = P[X + 1] + Y;
  let BA = P[B] + Z;
  let BB = P[B + 1] + Z;

  let gradAA = grad(P[AA], x, y, z);
  let gradBA = grad(P[BA], x - 1, y, z);
  let lerpX1 = gradAA + u * (gradBA - gradAA);

  let gradAB = grad(P[AB], x, y - 1, z);
  let gradBB = grad(P[BB], x - 1, y - 1, z);
  let lerpX2 = gradAB + u * (gradBB - gradAB);

  let lerpY1 = lerpX1 + v * (lerpX2 - lerpX1);

  let gradAA1 = grad(P[AA + 1], x, y, z - 1);
  let gradBA1 = grad(P[BA + 1], x - 1, y, z - 1);
  let lerpX3 = gradAA1 + u * (gradBA1 - gradAA1);

  let gradAB1 = grad(P[AB + 1], x, y - 1, z - 1);
  let gradBB1 = grad(P[BB + 1], x - 1, y - 1, z - 1);
  let lerpX4 = gradAB1 + u * (gradBB1 - gradAB1);

  let lerpY2 = lerpX3 + v * (lerpX4 - lerpX3);

  return lerpY1 + w * (lerpY2 - lerpY1);
}

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
  fade: fade,
  lerp: lerp,
  grad: grad,
  noise: noise,
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
