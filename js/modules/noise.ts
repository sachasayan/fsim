
// @ts-check

const p = new Uint8Array(512);

export const Noise = {
  permutation: p,
  init(seed = 12345) {
    let p_arr = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p_arr[i] = i;

    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = Math.imul(1664525, s) + 1013904223 | 0;
      let rand = Math.floor((((s >>> 8) & 0xfffff) / 0x100000) * (i + 1));
      let temp = p_arr[i];
      p_arr[i] = p_arr[rand];
      p_arr[rand] = temp;
    }
    for (let i = 0; i < 512; i++) p[i] = p_arr[i & 255];
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

    // Inlining fade
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = p[X] + Y;
    let AA = p[A] + Z;
    let AB = p[A + 1] + Z;
    let B = p[X + 1] + Y;
    let BA = p[B] + Z;
    let BB = p[B + 1] + Z;

    // Inlining grad and lerp for speed
    let h, u_grad, v_grad;

    // grad(p[AA], x, y, z)
    h = p[AA] & 15; u_grad = h < 8 ? x : y; v_grad = h < 4 ? y : h === 12 || h === 14 ? x : z;
    const gAA = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);

    // grad(p[BA], x - 1, y, z)
    h = p[BA] & 15; u_grad = h < 8 ? (x - 1) : y; v_grad = h < 4 ? y : h === 12 || h === 14 ? (x - 1) : z;
    const gBA = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);

    // grad(p[AB], x, y - 1, z)
    h = p[AB] & 15; u_grad = h < 8 ? x : (y - 1); v_grad = h < 4 ? (y - 1) : h === 12 || h === 14 ? x : z;
    const gAB = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);

    // grad(p[BB], x - 1, y - 1, z)
    h = p[BB] & 15; u_grad = h < 8 ? (x - 1) : (y - 1); v_grad = h < 4 ? (y - 1) : h === 12 || h === 14 ? (x - 1) : z;
    const gBB = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);

    // grad(p[AA + 1], x, y, z - 1)
    h = p[AA + 1] & 15; u_grad = h < 8 ? x : y; v_grad = h < 4 ? y : h === 12 || h === 14 ? x : (z - 1);
    const gAA1 = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);

    // grad(p[BA + 1], x - 1, y, z - 1)
    h = p[BA + 1] & 15; u_grad = h < 8 ? (x - 1) : y; v_grad = h < 4 ? y : h === 12 || h === 14 ? (x - 1) : (z - 1);
    const gBA1 = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);

    // grad(p[AB + 1], x, y - 1, z - 1)
    h = p[AB + 1] & 15; u_grad = h < 8 ? x : (y - 1); v_grad = h < 4 ? (y - 1) : h === 12 || h === 14 ? x : (z - 1);
    const gAB1 = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);

    // grad(p[BB + 1], x - 1, y - 1, z - 1)
    h = p[BB + 1] & 15; u_grad = h < 8 ? (x - 1) : (y - 1); v_grad = h < 4 ? (y - 1) : h === 12 || h === 14 ? (x - 1) : (z - 1);
    const gBB1 = ((h & 1) === 0 ? u_grad : -u_grad) + ((h & 2) === 0 ? v_grad : -v_grad);

    const lerp1 = gAA + u * (gBA - gAA);
    const lerp2 = gAB + u * (gBB - gAB);
    const lerp3 = gAA1 + u * (gBA1 - gAA1);
    const lerp4 = gAB1 + u * (gBB1 - gAB1);

    const lerp5 = lerp1 + v * (lerp2 - lerp1);
    const lerp6 = lerp3 + v * (lerp4 - lerp3);

    return lerp5 + w * (lerp6 - lerp5);
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
