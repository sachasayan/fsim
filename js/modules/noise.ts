// @ts-check

const P = new Uint8Array(512);

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

  let A = P[X] + Y;
  let AA = P[A] + Z;
  let AB = P[A + 1] + Z;
  let B = P[X + 1] + Y;
  let BA = P[B] + Z;
  let BB = P[B + 1] + Z;

  let xm1 = x - 1;
  let ym1 = y - 1;
  let zm1 = z - 1;

  let hAA = P[AA] & 15;
  let uAA = hAA < 8 ? x : y;
  let vAA = hAA < 4 ? y : hAA === 12 || hAA === 14 ? x : z;
  let gradAA = ((hAA & 1) === 0 ? uAA : -uAA) + ((hAA & 2) === 0 ? vAA : -vAA);

  let hBA = P[BA] & 15;
  let uBA = hBA < 8 ? xm1 : y;
  let vBA = hBA < 4 ? y : hBA === 12 || hBA === 14 ? xm1 : z;
  let l1 = gradAA + u * ((((hBA & 1) === 0 ? uBA : -uBA) + ((hBA & 2) === 0 ? vBA : -vBA)) - gradAA);

  let hAB = P[AB] & 15;
  let uAB = hAB < 8 ? x : ym1;
  let vAB = hAB < 4 ? ym1 : hAB === 12 || hAB === 14 ? x : z;
  let gradAB = ((hAB & 1) === 0 ? uAB : -uAB) + ((hAB & 2) === 0 ? vAB : -vAB);

  let hBB = P[BB] & 15;
  let uBB = hBB < 8 ? xm1 : ym1;
  let vBB = hBB < 4 ? ym1 : hBB === 12 || hBB === 14 ? xm1 : z;
  let l2 = gradAB + u * ((((hBB & 1) === 0 ? uBB : -uBB) + ((hBB & 2) === 0 ? vBB : -vBB)) - gradAB);

  let l12 = l1 + v * (l2 - l1);

  let hAA1 = P[AA + 1] & 15;
  let uAA1 = hAA1 < 8 ? x : y;
  let vAA1 = hAA1 < 4 ? y : hAA1 === 12 || hAA1 === 14 ? x : zm1;
  let gradAA1 = ((hAA1 & 1) === 0 ? uAA1 : -uAA1) + ((hAA1 & 2) === 0 ? vAA1 : -vAA1);

  let hBA1 = P[BA + 1] & 15;
  let uBA1 = hBA1 < 8 ? xm1 : y;
  let vBA1 = hBA1 < 4 ? y : hBA1 === 12 || hBA1 === 14 ? xm1 : zm1;
  let l3 = gradAA1 + u * ((((hBA1 & 1) === 0 ? uBA1 : -uBA1) + ((hBA1 & 2) === 0 ? vBA1 : -vBA1)) - gradAA1);

  let hAB1 = P[AB + 1] & 15;
  let uAB1 = hAB1 < 8 ? x : ym1;
  let vAB1 = hAB1 < 4 ? ym1 : hAB1 === 12 || hAB1 === 14 ? x : zm1;
  let gradAB1 = ((hAB1 & 1) === 0 ? uAB1 : -uAB1) + ((hAB1 & 2) === 0 ? vAB1 : -vAB1);

  let hBB1 = P[BB + 1] & 15;
  let uBB1 = hBB1 < 8 ? xm1 : ym1;
  let vBB1 = hBB1 < 4 ? ym1 : hBB1 === 12 || hBB1 === 14 ? xm1 : zm1;
  let l4 = gradAB1 + u * ((((hBB1 & 1) === 0 ? uBB1 : -uBB1) + ((hBB1 & 2) === 0 ? vBB1 : -vBB1)) - gradAB1);

  return l12 + w * ((l3 + v * (l4 - l3)) - l12);
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
  // Kept for backward compatibility
  fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  lerp: (t, a, b) => a + t * (b - a),
  grad(hash, x, y, z) {
    let h = hash & 15;
    let u = h < 8 ? x : y;
    let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  },
  noise: noise,
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      if (octaves === 5) {
        const f0 = scale;
        const f1 = f0 * 2;
        const f2 = f1 * 2;
        const f3 = f2 * 2;
        const f4 = f3 * 2;
        return (noise(x * f0, 0, z * f0) +
                noise(x * f1, 0, z * f1) * 0.5 +
                noise(x * f2, 0, z * f2) * 0.25 +
                noise(x * f3, 0, z * f3) * 0.125 +
                noise(x * f4, 0, z * f4) * 0.0625) * 0.5161290322580645;
      }
      if (octaves === 6) {
        const f0 = scale;
        const f1 = f0 * 2;
        const f2 = f1 * 2;
        const f3 = f2 * 2;
        const f4 = f3 * 2;
        const f5 = f4 * 2;
        return (noise(x * f0, 0, z * f0) +
                noise(x * f1, 0, z * f1) * 0.5 +
                noise(x * f2, 0, z * f2) * 0.25 +
                noise(x * f3, 0, z * f3) * 0.125 +
                noise(x * f4, 0, z * f4) * 0.0625 +
                noise(x * f5, 0, z * f5) * 0.03125) * 0.5079365079365079;
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
