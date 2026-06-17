// @ts-check

const permutation = new Uint8Array(512);

function grad(hash, x, y, z) {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function noise(x, y, z) {
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

  // Cache flipped u/v coordinates to avoid evaluating 1 - u multiple times
  const x1 = u;
  const x0 = 1 - u;
  const y1 = v;
  const y0 = 1 - v;

  const nx00 = grad(permutation[AA], x, y, z) * x0 + grad(permutation[BA], x - 1, y, z) * x1;
  const nx01 = grad(permutation[AB], x, y - 1, z) * x0 + grad(permutation[BB], x - 1, y - 1, z) * x1;
  const nx10 = grad(permutation[AA + 1], x, y, z - 1) * x0 + grad(permutation[BA + 1], x - 1, y, z - 1) * x1;
  const nx11 = grad(permutation[AB + 1], x, y - 1, z - 1) * x0 + grad(permutation[BB + 1], x - 1, y - 1, z - 1) * x1;

  const nxy0 = nx00 * y0 + nx01 * y1;
  const nxy1 = nx10 * y0 + nx11 * y1;

  return nxy0 * (1 - w) + nxy1 * w;
}

export const Noise = {
  permutation,
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
    for (let i = 0; i < 512; i++) permutation[i] = p[i & 255];
  },
  fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  lerp: (t, a, b) => a + t * (b - a),
  grad,
  noise,
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      if (octaves === 5) {
        // Manually unroll the loop for common octave counts and precalculate x*scale
        let sx = x * scale, sz = z * scale;
        const n0 = noise(sx, 0, sz); sx *= 2; sz *= 2;
        const n1 = noise(sx, 0, sz); sx *= 2; sz *= 2;
        const n2 = noise(sx, 0, sz); sx *= 2; sz *= 2;
        const n3 = noise(sx, 0, sz); sx *= 2; sz *= 2;
        const n4 = noise(sx, 0, sz);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625) / 1.9375;
      }
      if (octaves === 6) {
        // Manually unroll the loop for common octave counts and precalculate x*scale
        let sx = x * scale, sz = z * scale;
        const n0 = noise(sx, 0, sz); sx *= 2; sz *= 2;
        const n1 = noise(sx, 0, sz); sx *= 2; sz *= 2;
        const n2 = noise(sx, 0, sz); sx *= 2; sz *= 2;
        const n3 = noise(sx, 0, sz); sx *= 2; sz *= 2;
        const n4 = noise(sx, 0, sz); sx *= 2; sz *= 2;
        const n5 = noise(sx, 0, sz);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625 + n5 * 0.03125) / 1.96875;
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
