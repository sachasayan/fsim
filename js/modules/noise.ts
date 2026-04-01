// @ts-check

const P = new Uint8Array(512);

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
    for (let i = 0; i < 512; i++) {
        P[i] = p[i & 255];
        this.permutation[i] = P[i];
    }
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

    let A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
    let B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;

    let h, u_grad, v_grad;
    let gradAA, gradBA, gradAB, gradBB, gradAA1, gradBA1, gradAB1, gradBB1;

    h = P[AA] & 15; u_grad = h < 8 ? x : y; v_grad = h < 4 ? y : h === 12 || h === 14 ? x : z; gradAA = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);
    h = P[BA] & 15; u_grad = h < 8 ? x - 1 : y; v_grad = h < 4 ? y : h === 12 || h === 14 ? x - 1 : z; gradBA = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);
    h = P[AB] & 15; u_grad = h < 8 ? x : y - 1; v_grad = h < 4 ? y - 1 : h === 12 || h === 14 ? x : z; gradAB = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);
    h = P[BB] & 15; u_grad = h < 8 ? x - 1 : y - 1; v_grad = h < 4 ? y - 1 : h === 12 || h === 14 ? x - 1 : z; gradBB = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);

    let lerpX1 = gradAA + u * (gradBA - gradAA);
    let lerpX2 = gradAB + u * (gradBB - gradAB);
    let lerpY1 = lerpX1 + v * (lerpX2 - lerpX1);

    h = P[AA + 1] & 15; u_grad = h < 8 ? x : y; v_grad = h < 4 ? y : h === 12 || h === 14 ? x : z - 1; gradAA1 = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);
    h = P[BA + 1] & 15; u_grad = h < 8 ? x - 1 : y; v_grad = h < 4 ? y : h === 12 || h === 14 ? x - 1 : z - 1; gradBA1 = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);
    h = P[AB + 1] & 15; u_grad = h < 8 ? x : y - 1; v_grad = h < 4 ? y - 1 : h === 12 || h === 14 ? x : z - 1; gradAB1 = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);
    h = P[BB + 1] & 15; u_grad = h < 8 ? x - 1 : y - 1; v_grad = h < 4 ? y - 1 : h === 12 || h === 14 ? x - 1 : z - 1; gradBB1 = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);

    let lerpX3 = gradAA1 + u * (gradBA1 - gradAA1);
    let lerpX4 = gradAB1 + u * (gradBB1 - gradAB1);
    let lerpY2 = lerpX3 + v * (lerpX4 - lerpX3);

    return lerpY1 + w * (lerpY2 - lerpY1);
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
