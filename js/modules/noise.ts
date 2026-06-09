// @ts-check

const PERMUTATION = new Uint8Array(512);

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
  noise(x, y, z) {
    let xFloor = Math.floor(x);
    let yFloor = Math.floor(y);
    let zFloor = Math.floor(z);

    let X = xFloor & 255;
    let Y = yFloor & 255;
    let Z = zFloor & 255;

    x -= xFloor;
    y -= yFloor;
    z -= zFloor;

    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = PERMUTATION[X] + Y;
    let AA = PERMUTATION[A] + Z;
    let AB = PERMUTATION[A + 1] + Z;
    let B = PERMUTATION[X + 1] + Y;
    let BA = PERMUTATION[B] + Z;
    let BB = PERMUTATION[B + 1] + Z;

    let pAA = PERMUTATION[AA];
    let pBA = PERMUTATION[BA];
    let pAB = PERMUTATION[AB];
    let pBB = PERMUTATION[BB];

    let pAA1 = PERMUTATION[AA + 1];
    let pBA1 = PERMUTATION[BA + 1];
    let pAB1 = PERMUTATION[AB + 1];
    let pBB1 = PERMUTATION[BB + 1];

    // Un-nest the lerps and grads
    let gradAA = grad(pAA, x, y, z);
    let gradBA = grad(pBA, x - 1, y, z);
    let lerp1 = u * (gradBA - gradAA) + gradAA; // lerp(u, gradAA, gradBA)

    let gradAB = grad(pAB, x, y - 1, z);
    let gradBB = grad(pBB, x - 1, y - 1, z);
    let lerp2 = u * (gradBB - gradAB) + gradAB; // lerp(u, gradAB, gradBB)

    let lerp3 = v * (lerp2 - lerp1) + lerp1; // lerp(v, lerp1, lerp2)

    let gradAA1 = grad(pAA1, x, y, z - 1);
    let gradBA1 = grad(pBA1, x - 1, y, z - 1);
    let lerp4 = u * (gradBA1 - gradAA1) + gradAA1; // lerp(u, gradAA1, gradBA1)

    let gradAB1 = grad(pAB1, x, y - 1, z - 1);
    let gradBB1 = grad(pBB1, x - 1, y - 1, z - 1);
    let lerp5 = u * (gradBB1 - gradAB1) + gradAB1; // lerp(u, gradAB1, gradBB1)

    let lerp6 = v * (lerp5 - lerp4) + lerp4; // lerp(v, lerp4, lerp5)

    return w * (lerp6 - lerp3) + lerp3; // lerp(w, lerp3, lerp6)
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
