// @ts-check

// Static pre-calculated gradient arrays to avoid the branching and math
// in the inner loop of the noise function.
// The original grad function computes:
// let h = hash & 15;
// let u = h < 8 ? x : y;
// let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
// return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);

const P = new Uint8Array(512);

// We can look up the weights for x, y, and z based on h = hash & 15
// For each h from 0 to 15, we define exactly what multiple of x, y, z is returned.
const gradX = new Float32Array(16);
const gradY = new Float32Array(16);
const gradZ = new Float32Array(16);

for (let h = 0; h < 16; h++) {
  let u_x = h < 8 ? 1 : 0;
  let u_y = h < 8 ? 0 : 1;
  let u_z = 0;

  let v_x = h === 12 || h === 14 ? 1 : 0;
  let v_y = h < 4 ? 1 : 0;
  let v_z = h >= 4 && h !== 12 && h !== 14 ? 1 : 0;

  let u_sign = (h & 1) === 0 ? 1 : -1;
  let v_sign = (h & 2) === 0 ? 1 : -1;

  gradX[h] = u_sign * u_x + v_sign * v_x;
  gradY[h] = u_sign * u_y + v_sign * v_y;
  gradZ[h] = u_sign * u_z + v_sign * v_z;
}

export const Noise = {
  permutation: P,
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
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];
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
    let fx = Math.floor(x);
    let fy = Math.floor(y);
    let fz = Math.floor(z);

    let X = fx & 255;
    let Y = fy & 255;
    let Z = fz & 255;

    x -= fx;
    y -= fy;
    z -= fz;

    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = P[X] + Y;
    let AA = P[A] + Z;
    let AB = P[A + 1] + Z;
    let B = P[X + 1] + Y;
    let BA = P[B] + Z;
    let BB = P[B + 1] + Z;

    let x_minus_1 = x - 1;
    let y_minus_1 = y - 1;
    let z_minus_1 = z - 1;

    let hAA = P[AA] & 15;
    let gAA = gradX[hAA] * x + gradY[hAA] * y + gradZ[hAA] * z;

    let hBA = P[BA] & 15;
    let gBA = gradX[hBA] * x_minus_1 + gradY[hBA] * y + gradZ[hBA] * z;

    let hAB = P[AB] & 15;
    let gAB = gradX[hAB] * x + gradY[hAB] * y_minus_1 + gradZ[hAB] * z;

    let hBB = P[BB] & 15;
    let gBB = gradX[hBB] * x_minus_1 + gradY[hBB] * y_minus_1 + gradZ[hBB] * z;

    let hAA1 = P[AA + 1] & 15;
    let gAA1 = gradX[hAA1] * x + gradY[hAA1] * y + gradZ[hAA1] * z_minus_1;

    let hBA1 = P[BA + 1] & 15;
    let gBA1 =
      gradX[hBA1] * x_minus_1 + gradY[hBA1] * y + gradZ[hBA1] * z_minus_1;

    let hAB1 = P[AB + 1] & 15;
    let gAB1 =
      gradX[hAB1] * x + gradY[hAB1] * y_minus_1 + gradZ[hAB1] * z_minus_1;

    let hBB1 = P[BB + 1] & 15;
    let gBB1 =
      gradX[hBB1] * x_minus_1 +
      gradY[hBB1] * y_minus_1 +
      gradZ[hBB1] * z_minus_1;

    let l1 = gAA + u * (gBA - gAA);
    let l2 = gAB + u * (gBB - gAB);
    let la = l1 + v * (l2 - l1);

    let l3 = gAA1 + u * (gBA1 - gAA1);
    let l4 = gAB1 + u * (gBB1 - gAB1);
    let lb = l3 + v * (l4 - l3);

    return la + w * (lb - la);
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
      total += this.noise(x * frequency, 0, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxValue;
  },
};

Noise.init();
