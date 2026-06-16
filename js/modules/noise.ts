// @ts-check

const PERM = new Uint8Array(512);

// Hand-unrolled grad/lerp and removed 'this' lookups for max V8 performance in tight inner loops
function noise(x, y, z) {
  let floorX = Math.floor(x);
  let floorY = Math.floor(y);
  let floorZ = Math.floor(z);
  let X = floorX & 255;
  let Y = floorY & 255;
  let Z = floorZ & 255;
  x -= floorX;
  y -= floorY;
  z -= floorZ;

  let u = x * x * x * (x * (x * 6 - 15) + 10);
  let v = y * y * y * (y * (y * 6 - 15) + 10);
  let w = z * z * z * (z * (z * 6 - 15) + 10);

  let A = PERM[X] + Y;
  let AA = PERM[A] + Z;
  let AB = PERM[A + 1] + Z;
  let B = PERM[X + 1] + Y;
  let BA = PERM[B] + Z;
  let BB = PERM[B + 1] + Z;

  let h, u_, v_, nx00, nx10, nx01, nx11, ix0, ix1;
  let xm1 = x - 1, ym1 = y - 1, zm1 = z - 1;

  h = PERM[AA] & 15;
  u_ = h < 8 ? x : y;
  v_ = h < 4 ? y : h === 12 || h === 14 ? x : z;
  nx00 = ((h & 1) === 0 ? u_ : -u_) + ((h & 2) === 0 ? v_ : -v_);

  h = PERM[BA] & 15;
  u_ = h < 8 ? xm1 : y;
  v_ = h < 4 ? y : h === 12 || h === 14 ? xm1 : z;
  nx10 = ((h & 1) === 0 ? u_ : -u_) + ((h & 2) === 0 ? v_ : -v_);

  ix0 = nx00 + u * (nx10 - nx00);

  h = PERM[AB] & 15;
  u_ = h < 8 ? x : ym1;
  v_ = h < 4 ? ym1 : h === 12 || h === 14 ? x : z;
  nx01 = ((h & 1) === 0 ? u_ : -u_) + ((h & 2) === 0 ? v_ : -v_);

  h = PERM[BB] & 15;
  u_ = h < 8 ? xm1 : ym1;
  v_ = h < 4 ? ym1 : h === 12 || h === 14 ? xm1 : z;
  nx11 = ((h & 1) === 0 ? u_ : -u_) + ((h & 2) === 0 ? v_ : -v_);

  ix1 = nx01 + u * (nx11 - nx01);
  let iy0 = ix0 + v * (ix1 - ix0);

  h = PERM[AA + 1] & 15;
  u_ = h < 8 ? x : y;
  v_ = h < 4 ? y : h === 12 || h === 14 ? x : zm1;
  nx00 = ((h & 1) === 0 ? u_ : -u_) + ((h & 2) === 0 ? v_ : -v_);

  h = PERM[BA + 1] & 15;
  u_ = h < 8 ? xm1 : y;
  v_ = h < 4 ? y : h === 12 || h === 14 ? xm1 : zm1;
  nx10 = ((h & 1) === 0 ? u_ : -u_) + ((h & 2) === 0 ? v_ : -v_);

  ix0 = nx00 + u * (nx10 - nx00);

  h = PERM[AB + 1] & 15;
  u_ = h < 8 ? x : ym1;
  v_ = h < 4 ? ym1 : h === 12 || h === 14 ? x : zm1;
  nx01 = ((h & 1) === 0 ? u_ : -u_) + ((h & 2) === 0 ? v_ : -v_);

  h = PERM[BB + 1] & 15;
  u_ = h < 8 ? xm1 : ym1;
  v_ = h < 4 ? ym1 : h === 12 || h === 14 ? xm1 : zm1;
  nx11 = ((h & 1) === 0 ? u_ : -u_) + ((h & 2) === 0 ? v_ : -v_);

  ix1 = nx01 + u * (nx11 - nx01);

  return iy0 + w * ((ix0 + v * (ix1 - ix0)) - iy0);
}

export const Noise = {
  permutation: PERM,
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
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  },
  fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  lerp: (t, a, b) => a + t * (b - a),
  grad(hash, x, y, z) {
    let h = hash & 15;
    let u = h < 8 ? x : y;
    let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  },
  noise,
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      if (octaves === 5) {
        let f = scale;
        return (
          noise(x * f, 0, z * f) +
          noise(x * (f *= 2), 0, z * f) * 0.5 +
          noise(x * (f *= 2), 0, z * f) * 0.25 +
          noise(x * (f *= 2), 0, z * f) * 0.125 +
          noise(x * (f *= 2), 0, z * f) * 0.0625
        ) / 1.9375;
      }
      if (octaves === 6) {
        let f = scale;
        return (
          noise(x * f, 0, z * f) +
          noise(x * (f *= 2), 0, z * f) * 0.5 +
          noise(x * (f *= 2), 0, z * f) * 0.25 +
          noise(x * (f *= 2), 0, z * f) * 0.125 +
          noise(x * (f *= 2), 0, z * f) * 0.0625 +
          noise(x * (f *= 2), 0, z * f) * 0.03125
        ) / 1.96875;
      }
    }

    let total = 0;
    let frequency = scale;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise(x * frequency, 0, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxValue;
  }
};

Noise.init();
