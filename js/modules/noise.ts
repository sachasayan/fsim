// @ts-check

const P = new Uint8Array(512);

function grad(hash: number, x: number, y: number, z: number) {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

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
  fade: (t: number) => t * t * t * (t * (t * 6 - 15) + 10),
  lerp: (t: number, a: number, b: number) => a + t * (b - a),
  grad(hash: number, x: number, y: number, z: number) {
    return grad(hash, x, y, z);
  },
  noise(x: number, y: number, z: number) {
    let X = Math.floor(x) & 255;
    let Y = Math.floor(y) & 255;
    let Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    let u = x * x * x * (x * (x * 6 - 15) + 10);
    let v = y * y * y * (y * (y * 6 - 15) + 10);
    let w = z * z * z * (z * (z * 6 - 15) + 10);

    let A = P[X] + Y;
    let AA = P[A] + Z;
    let AB = P[A + 1] + Z;
    let B = P[X + 1] + Y;
    let BA = P[B] + Z;
    let BB = P[B + 1] + Z;

    let g1 = grad(P[AA], x, y, z);
    let g2 = grad(P[BA], x - 1, y, z);
    let l1 = g1 + u * (g2 - g1);

    let g3 = grad(P[AB], x, y - 1, z);
    let g4 = grad(P[BB], x - 1, y - 1, z);
    let l2 = g3 + u * (g4 - g3);

    let l3 = l1 + v * (l2 - l1);

    let g5 = grad(P[AA + 1], x, y, z - 1);
    let g6 = grad(P[BA + 1], x - 1, y, z - 1);
    let l4 = g5 + u * (g6 - g5);

    let g7 = grad(P[AB + 1], x, y - 1, z - 1);
    let g8 = grad(P[BB + 1], x - 1, y - 1, z - 1);
    let l5 = g7 + u * (g8 - g7);

    let l6 = l4 + v * (l5 - l4);

    return l3 + w * (l6 - l3);
  },
  fractal(x: number, z: number, octaves: number, persistence: number, scale: number) {
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
