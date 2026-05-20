// @ts-check

const permutation = new Uint8Array(512);

export const Noise = {
  permutation,
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
    for (let i = 0; i < 512; i++) permutation[i] = p[i & 255];
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

    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = permutation[X] + Y;
    let AA = permutation[A] + Z;
    let AB = permutation[A + 1] + Z;
    let B = permutation[X + 1] + Y;
    let BA = permutation[B] + Z;
    let BB = permutation[B + 1] + Z;

    let hAA = permutation[AA] & 15;
    let uAA = hAA < 8 ? x : y;
    let vAA = hAA < 4 ? y : hAA === 12 || hAA === 14 ? x : z;
    let gAA = ((hAA & 1) === 0 ? uAA : -uAA) + ((hAA & 2) === 0 ? vAA : -vAA);

    let hBA = permutation[BA] & 15;
    let uBA = hBA < 8 ? (x - 1) : y;
    let vBA = hBA < 4 ? y : hBA === 12 || hBA === 14 ? (x - 1) : z;
    let gBA = ((hBA & 1) === 0 ? uBA : -uBA) + ((hBA & 2) === 0 ? vBA : -vBA);

    let hAB = permutation[AB] & 15;
    let uAB = hAB < 8 ? x : (y - 1);
    let vAB = hAB < 4 ? (y - 1) : hAB === 12 || hAB === 14 ? x : z;
    let gAB = ((hAB & 1) === 0 ? uAB : -uAB) + ((hAB & 2) === 0 ? vAB : -vAB);

    let hBB = permutation[BB] & 15;
    let uBB = hBB < 8 ? (x - 1) : (y - 1);
    let vBB = hBB < 4 ? (y - 1) : hBB === 12 || hBB === 14 ? (x - 1) : z;
    let gBB = ((hBB & 1) === 0 ? uBB : -uBB) + ((hBB & 2) === 0 ? vBB : -vBB);

    let hAA1 = permutation[AA + 1] & 15;
    let uAA1 = hAA1 < 8 ? x : y;
    let vAA1 = hAA1 < 4 ? y : hAA1 === 12 || hAA1 === 14 ? x : (z - 1);
    let gAA1 = ((hAA1 & 1) === 0 ? uAA1 : -uAA1) + ((hAA1 & 2) === 0 ? vAA1 : -vAA1);

    let hBA1 = permutation[BA + 1] & 15;
    let uBA1 = hBA1 < 8 ? (x - 1) : y;
    let vBA1 = hBA1 < 4 ? y : hBA1 === 12 || hBA1 === 14 ? (x - 1) : (z - 1);
    let gBA1 = ((hBA1 & 1) === 0 ? uBA1 : -uBA1) + ((hBA1 & 2) === 0 ? vBA1 : -vBA1);

    let hAB1 = permutation[AB + 1] & 15;
    let uAB1 = hAB1 < 8 ? x : (y - 1);
    let vAB1 = hAB1 < 4 ? (y - 1) : hAB1 === 12 || hAB1 === 14 ? x : (z - 1);
    let gAB1 = ((hAB1 & 1) === 0 ? uAB1 : -uAB1) + ((hAB1 & 2) === 0 ? vAB1 : -vAB1);

    let hBB1 = permutation[BB + 1] & 15;
    let uBB1 = hBB1 < 8 ? (x - 1) : (y - 1);
    let vBB1 = hBB1 < 4 ? (y - 1) : hBB1 === 12 || hBB1 === 14 ? (x - 1) : (z - 1);
    let gBB1 = ((hBB1 & 1) === 0 ? uBB1 : -uBB1) + ((hBB1 & 2) === 0 ? vBB1 : -vBB1);

    let lerp1 = gAA + u * (gBA - gAA);
    let lerp2 = gAB + u * (gBB - gAB);
    let lerp3 = lerp1 + v * (lerp2 - lerp1);

    let lerp4 = gAA1 + u * (gBA1 - gAA1);
    let lerp5 = gAB1 + u * (gBB1 - gAB1);
    let lerp6 = lerp4 + v * (lerp5 - lerp4);

    return lerp3 + w * (lerp6 - lerp3);
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
