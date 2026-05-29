// @ts-check

const permutation = new Uint8Array(512);

export const Noise = {
  permutation,
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
    for (let i = 0; i < 512; i++) {
      permutation[i] = p[i & 255];
      // this.permutation references the same array, no need to set twice
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
  // ⚡ Bolt: Heavily optimized hot path.
  // Helper math functions (fade, grad, lerp) are manually inlined to avoid V8 call stack overhead.
  // Module-scoped `permutation` array avoids `this.*` dictionary lookups in tight loops.
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

    let A = permutation[X] + Y;
    let AA = permutation[A] + Z;
    let AB = permutation[A + 1] + Z;
    let B = permutation[X + 1] + Y;
    let BA = permutation[B] + Z;
    let BB = permutation[B + 1] + Z;

    let h1 = permutation[AA] & 15;
    let u1 = h1 < 8 ? x : y;
    let v1 = h1 < 4 ? y : h1 === 12 || h1 === 14 ? x : z;
    let g1 = ((h1 & 1) === 0 ? u1 : -u1) + ((h1 & 2) === 0 ? v1 : -v1);
    let h2 = permutation[BA] & 15;
    let u2 = h2 < 8 ? x - 1 : y;
    let v2 = h2 < 4 ? y : h2 === 12 || h2 === 14 ? x - 1 : z;
    let g2 = ((h2 & 1) === 0 ? u2 : -u2) + ((h2 & 2) === 0 ? v2 : -v2);
    let lerp1 = g1 + u * (g2 - g1);

    let h3 = permutation[AB] & 15;
    let u3 = h3 < 8 ? x : y - 1;
    let v3 = h3 < 4 ? y - 1 : h3 === 12 || h3 === 14 ? x : z;
    let g3 = ((h3 & 1) === 0 ? u3 : -u3) + ((h3 & 2) === 0 ? v3 : -v3);
    let h4 = permutation[BB] & 15;
    let u4 = h4 < 8 ? x - 1 : y - 1;
    let v4 = h4 < 4 ? y - 1 : h4 === 12 || h4 === 14 ? x - 1 : z;
    let g4 = ((h4 & 1) === 0 ? u4 : -u4) + ((h4 & 2) === 0 ? v4 : -v4);
    let lerp2 = g3 + u * (g4 - g3);

    let lerp12 = lerp1 + v * (lerp2 - lerp1);

    let h5 = permutation[AA + 1] & 15;
    let u5 = h5 < 8 ? x : y;
    let v5 = h5 < 4 ? y : h5 === 12 || h5 === 14 ? x : z - 1;
    let g5 = ((h5 & 1) === 0 ? u5 : -u5) + ((h5 & 2) === 0 ? v5 : -v5);
    let h6 = permutation[BA + 1] & 15;
    let u6 = h6 < 8 ? x - 1 : y;
    let v6 = h6 < 4 ? y : h6 === 12 || h6 === 14 ? x - 1 : z - 1;
    let g6 = ((h6 & 1) === 0 ? u6 : -u6) + ((h6 & 2) === 0 ? v6 : -v6);
    let lerp3 = g5 + u * (g6 - g5);

    let h7 = permutation[AB + 1] & 15;
    let u7 = h7 < 8 ? x : y - 1;
    let v7 = h7 < 4 ? y - 1 : h7 === 12 || h7 === 14 ? x : z - 1;
    let g7 = ((h7 & 1) === 0 ? u7 : -u7) + ((h7 & 2) === 0 ? v7 : -v7);
    let h8 = permutation[BB + 1] & 15;
    let u8 = h8 < 8 ? x - 1 : y - 1;
    let v8 = h8 < 4 ? y - 1 : h8 === 12 || h8 === 14 ? x - 1 : z - 1;
    let g8 = ((h8 & 1) === 0 ? u8 : -u8) + ((h8 & 2) === 0 ? v8 : -v8);
    let lerp4 = g7 + u * (g8 - g7);

    let lerp34 = lerp3 + v * (lerp4 - lerp3);

    return lerp12 + w * (lerp34 - lerp12);
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
