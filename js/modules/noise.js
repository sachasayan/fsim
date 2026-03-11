export const Noise = {
  permutation: new Uint8Array(512),
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
    for (let i = 0; i < 512; i++) this.permutation[i] = p[i & 255];
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

    // Inline fade(t)
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    const p = this.permutation;
    let A = p[X] + Y;
    let AA = p[A] + Z;
    let AB = p[A + 1] + Z;
    let B = p[X + 1] + Y;
    let BA = p[B] + Z;
    let BB = p[B + 1] + Z;

    let resAA, resBA, resAB, resBB, resAA1, resBA1, resAB1, resBB1;
    let h, u_val, v_val;
    const xb = x - 1;
    const yb = y - 1;
    const zb = z - 1;

    // Inline grad(hash, x, y, z)
    h = p[AA] & 15;
    u_val = h < 8 ? x : y;
    v_val = h < 4 ? y : h === 12 || h === 14 ? x : z;
    resAA = ((h & 1) === 0 ? u_val : -u_val) + ((h & 2) === 0 ? v_val : -v_val);

    h = p[BA] & 15;
    u_val = h < 8 ? xb : y;
    v_val = h < 4 ? y : h === 12 || h === 14 ? xb : z;
    resBA = ((h & 1) === 0 ? u_val : -u_val) + ((h & 2) === 0 ? v_val : -v_val);

    h = p[AB] & 15;
    u_val = h < 8 ? x : yb;
    v_val = h < 4 ? yb : h === 12 || h === 14 ? x : z;
    resAB = ((h & 1) === 0 ? u_val : -u_val) + ((h & 2) === 0 ? v_val : -v_val);

    h = p[BB] & 15;
    u_val = h < 8 ? xb : yb;
    v_val = h < 4 ? yb : h === 12 || h === 14 ? xb : z;
    resBB = ((h & 1) === 0 ? u_val : -u_val) + ((h & 2) === 0 ? v_val : -v_val);

    h = p[AA + 1] & 15;
    u_val = h < 8 ? x : y;
    v_val = h < 4 ? y : h === 12 || h === 14 ? x : zb;
    resAA1 = ((h & 1) === 0 ? u_val : -u_val) + ((h & 2) === 0 ? v_val : -v_val);

    h = p[BA + 1] & 15;
    u_val = h < 8 ? xb : y;
    v_val = h < 4 ? y : h === 12 || h === 14 ? xb : zb;
    resBA1 = ((h & 1) === 0 ? u_val : -u_val) + ((h & 2) === 0 ? v_val : -v_val);

    h = p[AB + 1] & 15;
    u_val = h < 8 ? x : yb;
    v_val = h < 4 ? yb : h === 12 || h === 14 ? x : zb;
    resAB1 = ((h & 1) === 0 ? u_val : -u_val) + ((h & 2) === 0 ? v_val : -v_val);

    h = p[BB + 1] & 15;
    u_val = h < 8 ? xb : yb;
    v_val = h < 4 ? yb : h === 12 || h === 14 ? xb : zb;
    resBB1 = ((h & 1) === 0 ? u_val : -u_val) + ((h & 2) === 0 ? v_val : -v_val);

    // Inline lerp(t, a, b)
    const l1 = resAA + u * (resBA - resAA);
    const l2 = resAB + u * (resBB - resAB);
    const l3 = l1 + v * (l2 - l1);

    const l4 = resAA1 + u * (resBA1 - resAA1);
    const l5 = resAB1 + u * (resBB1 - resAB1);
    const l6 = l4 + v * (l5 - l4);

    return l3 + w * (l6 - l3);
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
