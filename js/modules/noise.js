export const Noise = {
  permutation: new Uint8Array(512),
  grad3: new Float32Array([
     1,  1,  0,  -1,  1,  0,   1, -1,  0,  -1, -1,  0,
     1,  0,  1,  -1,  0,  1,   1,  0, -1,  -1,  0, -1,
     0,  1,  1,   0, -1,  1,   0,  1, -1,   0, -1, -1,
     1,  1,  0,   0, -1,  1,  -1,  1,  0,   0, -1, -1
  ]),
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
    let x0 = Math.floor(x);
    let y0 = Math.floor(y);
    let z0 = Math.floor(z);
    let X = x0 & 255;
    let Y = y0 & 255;
    let Z = z0 & 255;
    x -= x0;
    y -= y0;
    z -= z0;

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

    const g3 = Noise.grad3;
    let h, i;

    h = p[AA] & 15; i = h * 3;
    let a1 = g3[i] * x + g3[i + 1] * y + g3[i + 2] * z;
    h = p[BA] & 15; i = h * 3;
    let b1 = g3[i] * (x - 1) + g3[i + 1] * y + g3[i + 2] * z;
    let c1 = a1 + u * (b1 - a1);

    h = p[AB] & 15; i = h * 3;
    let a2 = g3[i] * x + g3[i + 1] * (y - 1) + g3[i + 2] * z;
    h = p[BB] & 15; i = h * 3;
    let b2 = g3[i] * (x - 1) + g3[i + 1] * (y - 1) + g3[i + 2] * z;
    let c2 = a2 + u * (b2 - a2);

    let d1 = c1 + v * (c2 - c1);

    h = p[AA + 1] & 15; i = h * 3;
    let a3 = g3[i] * x + g3[i + 1] * y + g3[i + 2] * (z - 1);
    h = p[BA + 1] & 15; i = h * 3;
    let b3 = g3[i] * (x - 1) + g3[i + 1] * y + g3[i + 2] * (z - 1);
    let c3 = a3 + u * (b3 - a3);

    h = p[AB + 1] & 15; i = h * 3;
    let a4 = g3[i] * x + g3[i + 1] * (y - 1) + g3[i + 2] * (z - 1);
    h = p[BB + 1] & 15; i = h * 3;
    let b4 = g3[i] * (x - 1) + g3[i + 1] * (y - 1) + g3[i + 2] * (z - 1);
    let c4 = a4 + u * (b4 - a4);

    let d2 = c3 + v * (c4 - c3);

    return d1 + w * (d2 - d1);
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
