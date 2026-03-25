const gradX = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const gradY = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const gradZ = new Float64Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);

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
    let x0 = Math.floor(x);
    let y0 = Math.floor(y);
    let z0 = Math.floor(z);

    x -= x0;
    y -= y0;
    z -= z0;

    let X = x0 & 255;
    let Y = y0 & 255;
    let Z = z0 & 255;

    // Inline fade
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

    let x1 = x - 1;
    let y1 = y - 1;
    let z1 = z - 1;

    let h = p[AA] & 15;
    let g000 = gradX[h] * x + gradY[h] * y + gradZ[h] * z;

    h = p[BA] & 15;
    let g100 = gradX[h] * x1 + gradY[h] * y + gradZ[h] * z;

    h = p[AB] & 15;
    let g010 = gradX[h] * x + gradY[h] * y1 + gradZ[h] * z;

    h = p[BB] & 15;
    let g110 = gradX[h] * x1 + gradY[h] * y1 + gradZ[h] * z;

    h = p[AA + 1] & 15;
    let g001 = gradX[h] * x + gradY[h] * y + gradZ[h] * z1;

    h = p[BA + 1] & 15;
    let g101 = gradX[h] * x1 + gradY[h] * y + gradZ[h] * z1;

    h = p[AB + 1] & 15;
    let g011 = gradX[h] * x + gradY[h] * y1 + gradZ[h] * z1;

    h = p[BB + 1] & 15;
    let g111 = gradX[h] * x1 + gradY[h] * y1 + gradZ[h] * z1;

    let lerp1 = g000 + u * (g100 - g000);
    let lerp2 = g010 + u * (g110 - g010);
    let lerp3 = g001 + u * (g101 - g001);
    let lerp4 = g011 + u * (g111 - g011);

    let lerp5 = lerp1 + v * (lerp2 - lerp1);
    let lerp6 = lerp3 + v * (lerp4 - lerp3);

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
