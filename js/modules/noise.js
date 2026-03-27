export const Noise = {
  permutation: new Uint16Array(512),
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
    let X = Math.floor(x);
    let Y = Math.floor(y);
    let Z = Math.floor(z);
    x -= X;
    y -= Y;
    z -= Z;
    X &= 255;
    Y &= 255;
    Z &= 255;

    // Inline fade
    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let p = this.permutation;
    let A = p[X] + Y;
    let AA = p[A] + Z;
    let AB = p[A + 1] + Z;
    let B = p[X + 1] + Y;
    let BA = p[B] + Z;
    let BB = p[B + 1] + Z;

    // Inline grad and lerp to avoid function call overhead
    let x1 = x - 1;
    let y1 = y - 1;
    let z1 = z - 1;

    let h = p[AA] & 15;
    let g1 = ((h & 1) === 0 ? (h < 8 ? x : y) : -(h < 8 ? x : y)) + ((h & 2) === 0 ? (h < 4 ? y : h === 12 || h === 14 ? x : z) : -(h < 4 ? y : h === 12 || h === 14 ? x : z));

    h = p[BA] & 15;
    let g2 = ((h & 1) === 0 ? (h < 8 ? x1 : y) : -(h < 8 ? x1 : y)) + ((h & 2) === 0 ? (h < 4 ? y : h === 12 || h === 14 ? x1 : z) : -(h < 4 ? y : h === 12 || h === 14 ? x1 : z));
    let lerp1 = g1 + u * (g2 - g1);

    h = p[AB] & 15;
    g1 = ((h & 1) === 0 ? (h < 8 ? x : y1) : -(h < 8 ? x : y1)) + ((h & 2) === 0 ? (h < 4 ? y1 : h === 12 || h === 14 ? x : z) : -(h < 4 ? y1 : h === 12 || h === 14 ? x : z));

    h = p[BB] & 15;
    g2 = ((h & 1) === 0 ? (h < 8 ? x1 : y1) : -(h < 8 ? x1 : y1)) + ((h & 2) === 0 ? (h < 4 ? y1 : h === 12 || h === 14 ? x1 : z) : -(h < 4 ? y1 : h === 12 || h === 14 ? x1 : z));
    let lerp2 = g1 + u * (g2 - g1);

    let lerpBottom = lerp1 + v * (lerp2 - lerp1);

    h = p[AA + 1] & 15;
    g1 = ((h & 1) === 0 ? (h < 8 ? x : y) : -(h < 8 ? x : y)) + ((h & 2) === 0 ? (h < 4 ? y : h === 12 || h === 14 ? x : z1) : -(h < 4 ? y : h === 12 || h === 14 ? x : z1));

    h = p[BA + 1] & 15;
    g2 = ((h & 1) === 0 ? (h < 8 ? x1 : y) : -(h < 8 ? x1 : y)) + ((h & 2) === 0 ? (h < 4 ? y : h === 12 || h === 14 ? x1 : z1) : -(h < 4 ? y : h === 12 || h === 14 ? x1 : z1));
    lerp1 = g1 + u * (g2 - g1);

    h = p[AB + 1] & 15;
    g1 = ((h & 1) === 0 ? (h < 8 ? x : y1) : -(h < 8 ? x : y1)) + ((h & 2) === 0 ? (h < 4 ? y1 : h === 12 || h === 14 ? x : z1) : -(h < 4 ? y1 : h === 12 || h === 14 ? x : z1));

    h = p[BB + 1] & 15;
    g2 = ((h & 1) === 0 ? (h < 8 ? x1 : y1) : -(h < 8 ? x1 : y1)) + ((h & 2) === 0 ? (h < 4 ? y1 : h === 12 || h === 14 ? x1 : z1) : -(h < 4 ? y1 : h === 12 || h === 14 ? x1 : z1));
    lerp2 = g1 + u * (g2 - g1);

    return lerpBottom + w * ((lerp1 + v * (lerp2 - lerp1)) - lerpBottom);
  },
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      let f = scale;
      if (octaves === 5) {
        let total = this.noise(x * f, 0, z * f);
        f *= 2;
        total += this.noise(x * f, 0, z * f) * 0.5;
        f *= 2;
        total += this.noise(x * f, 0, z * f) * 0.25;
        f *= 2;
        total += this.noise(x * f, 0, z * f) * 0.125;
        f *= 2;
        total += this.noise(x * f, 0, z * f) * 0.0625;
        return total * 0.5161290322580645;
      }
      if (octaves === 6) {
        let total = this.noise(x * f, 0, z * f);
        f *= 2;
        total += this.noise(x * f, 0, z * f) * 0.5;
        f *= 2;
        total += this.noise(x * f, 0, z * f) * 0.25;
        f *= 2;
        total += this.noise(x * f, 0, z * f) * 0.125;
        f *= 2;
        total += this.noise(x * f, 0, z * f) * 0.0625;
        f *= 2;
        total += this.noise(x * f, 0, z * f) * 0.03125;
        return total * 0.5079365079365079;
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
