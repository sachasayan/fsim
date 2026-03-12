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

    // Inline fade: t * t * t * (t * (t * 6 - 15) + 10)
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = this.permutation[X] + Y;
    let AA = this.permutation[A] + Z;
    let AB = this.permutation[A + 1] + Z;
    let B = this.permutation[X + 1] + Y;
    let BA = this.permutation[B] + Z;
    let BB = this.permutation[B + 1] + Z;

    // Inline lerp: a + t * (b - a)
    let gAA = this.grad(this.permutation[AA], x, y, z);
    let gBA = this.grad(this.permutation[BA], x - 1, y, z);
    let x11 = gAA + u * (gBA - gAA);

    let gAB = this.grad(this.permutation[AB], x, y - 1, z);
    let gBB = this.grad(this.permutation[BB], x - 1, y - 1, z);
    let x12 = gAB + u * (gBB - gAB);

    let y1 = x11 + v * (x12 - x11);

    let gAA1 = this.grad(this.permutation[AA + 1], x, y, z - 1);
    let gBA1 = this.grad(this.permutation[BA + 1], x - 1, y, z - 1);
    let x21 = gAA1 + u * (gBA1 - gAA1);

    let gAB1 = this.grad(this.permutation[AB + 1], x, y - 1, z - 1);
    let gBB1 = this.grad(this.permutation[BB + 1], x - 1, y - 1, z - 1);
    let x22 = gAB1 + u * (gBB1 - gAB1);

    let y2 = x21 + v * (x22 - x21);

    return y1 + w * (y2 - y1);
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
