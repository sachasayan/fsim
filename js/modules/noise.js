// Pre-calculated gradients mapping to h & 15
const grad3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
  1, 1, 0, 0, -1, 1, -1, 1, 0, 0, -1, -1
]);

export const Noise = {
  permutation: new Uint8Array(512),
  permMod12: new Uint8Array(512),
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
      this.permutation[i] = p[i & 255];
      // Store index into grad3 array directly (16 gradients * 3 components)
      this.permMod12[i] = (p[i & 255] & 15) * 3;
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
    let X = Math.floor(x);
    let Y = Math.floor(y);
    let Z = Math.floor(z);

    x -= X;
    y -= Y;
    z -= Z;

    X &= 255;
    Y &= 255;
    Z &= 255;

    // Inline fade computations to save function call overhead
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let p = this.permutation;
    let pm = this.permMod12;

    let A = p[X] + Y;
    let AA = p[A] + Z;
    let AB = p[A + 1] + Z;
    let B = p[X + 1] + Y;
    let BA = p[B] + Z;
    let BB = p[B + 1] + Z;

    // Use pre-calculated gradient indices to avoid branches
    let gi0 = pm[AA];
    let gi1 = pm[BA];
    let gi2 = pm[AB];
    let gi3 = pm[BB];
    let gi4 = pm[AA + 1];
    let gi5 = pm[BA + 1];
    let gi6 = pm[AB + 1];
    let gi7 = pm[BB + 1];

    let n0 = grad3[gi0] * x + grad3[gi0+1] * y + grad3[gi0+2] * z;
    let n1 = grad3[gi1] * (x - 1) + grad3[gi1+1] * y + grad3[gi1+2] * z;
    let n2 = grad3[gi2] * x + grad3[gi2+1] * (y - 1) + grad3[gi2+2] * z;
    let n3 = grad3[gi3] * (x - 1) + grad3[gi3+1] * (y - 1) + grad3[gi3+2] * z;
    let n4 = grad3[gi4] * x + grad3[gi4+1] * y + grad3[gi4+2] * (z - 1);
    let n5 = grad3[gi5] * (x - 1) + grad3[gi5+1] * y + grad3[gi5+2] * (z - 1);
    let n6 = grad3[gi6] * x + grad3[gi6+1] * (y - 1) + grad3[gi6+2] * (z - 1);
    let n7 = grad3[gi7] * (x - 1) + grad3[gi7+1] * (y - 1) + grad3[gi7+2] * (z - 1);

    // Inline lerp
    let nx0 = n0 + u * (n1 - n0);
    let nx1 = n2 + u * (n3 - n2);
    let nx2 = n4 + u * (n5 - n4);
    let nx3 = n6 + u * (n7 - n6);

    let nxy0 = nx0 + v * (nx1 - nx0);
    let nxy1 = nx2 + v * (nx3 - nx2);

    return nxy0 + w * (nxy1 - nxy0);
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
