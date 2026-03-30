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
    let X = Math.floor(x) & 255;
    let Y = Math.floor(y) & 255;
    let Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    // Inline fade
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = P[X] + Y;
    let AA = P[A] + Z;
    let AB = P[A + 1] + Z;
    let B = P[X + 1] + Y;
    let BA = P[B] + Z;
    let BB = P[B + 1] + Z;

    const x1 = x - 1;
    const y1 = y - 1;
    const z1 = z - 1;

    let h = P[AA] & 15;
    let res1 = ((h & 1) === 0 ? (h < 8 ? x : y) : -(h < 8 ? x : y)) + ((h & 2) === 0 ? (h < 4 ? y : h === 12 || h === 14 ? x : z) : -(h < 4 ? y : h === 12 || h === 14 ? x : z));

    h = P[BA] & 15;
    let res2 = ((h & 1) === 0 ? (h < 8 ? x1 : y) : -(h < 8 ? x1 : y)) + ((h & 2) === 0 ? (h < 4 ? y : h === 12 || h === 14 ? x1 : z) : -(h < 4 ? y : h === 12 || h === 14 ? x1 : z));

    h = P[AB] & 15;
    let res3 = ((h & 1) === 0 ? (h < 8 ? x : y1) : -(h < 8 ? x : y1)) + ((h & 2) === 0 ? (h < 4 ? y1 : h === 12 || h === 14 ? x : z) : -(h < 4 ? y1 : h === 12 || h === 14 ? x : z));

    h = P[BB] & 15;
    let res4 = ((h & 1) === 0 ? (h < 8 ? x1 : y1) : -(h < 8 ? x1 : y1)) + ((h & 2) === 0 ? (h < 4 ? y1 : h === 12 || h === 14 ? x1 : z) : -(h < 4 ? y1 : h === 12 || h === 14 ? x1 : z));

    h = P[AA + 1] & 15;
    let res5 = ((h & 1) === 0 ? (h < 8 ? x : y) : -(h < 8 ? x : y)) + ((h & 2) === 0 ? (h < 4 ? y : h === 12 || h === 14 ? x : z1) : -(h < 4 ? y : h === 12 || h === 14 ? x : z1));

    h = P[BA + 1] & 15;
    let res6 = ((h & 1) === 0 ? (h < 8 ? x1 : y) : -(h < 8 ? x1 : y)) + ((h & 2) === 0 ? (h < 4 ? y : h === 12 || h === 14 ? x1 : z1) : -(h < 4 ? y : h === 12 || h === 14 ? x1 : z1));

    h = P[AB + 1] & 15;
    let res7 = ((h & 1) === 0 ? (h < 8 ? x : y1) : -(h < 8 ? x : y1)) + ((h & 2) === 0 ? (h < 4 ? y1 : h === 12 || h === 14 ? x : z1) : -(h < 4 ? y1 : h === 12 || h === 14 ? x : z1));

    h = P[BB + 1] & 15;
    let res8 = ((h & 1) === 0 ? (h < 8 ? x1 : y1) : -(h < 8 ? x1 : y1)) + ((h & 2) === 0 ? (h < 4 ? y1 : h === 12 || h === 14 ? x1 : z1) : -(h < 4 ? y1 : h === 12 || h === 14 ? x1 : z1));

    let l1 = res1 + u * (res2 - res1);
    let l2 = res3 + u * (res4 - res3);
    let l3 = res5 + u * (res6 - res5);
    let l4 = res7 + u * (res8 - res7);

    let ll1 = l1 + v * (l2 - l1);
    let ll2 = l3 + v * (l4 - l3);

    return ll1 + w * (ll2 - ll1);
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
