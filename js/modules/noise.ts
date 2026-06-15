// @ts-check

const permutation = new Uint8Array(512);

function init(seed = 12345) {
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
}

// 16 variations from original logic:
// h = hash & 15;
// u = h < 8 ? x : y;
// v = h < 4 ? y : h === 12 || h === 14 ? x : z;
// result = ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);

// I will just translate these correctly to a table of (x_mul, y_mul, z_mul).
// h=0  (u=x, v=y) -> x + y
// h=1  (u=x, v=y) -> -x + y
// h=2  (u=x, v=y) -> x - y
// h=3  (u=x, v=y) -> -x - y
// h=4  (u=x, v=z) -> x + z
// h=5  (u=x, v=z) -> -x + z
// h=6  (u=x, v=z) -> x - z
// h=7  (u=x, v=z) -> -x - z
// h=8  (u=y, v=z) -> y + z
// h=9  (u=y, v=z) -> -y + z
// h=10 (u=y, v=z) -> y - z
// h=11 (u=y, v=z) -> -y - z
// h=12 (u=y, v=x) -> y + x
// h=13 (u=y, v=z) -> -y + z    <-- wait, v = h < 4 ? y : h===12||h===14 ? x : z. so h=13 -> z
// h=14 (u=y, v=x) -> y - x
// h=15 (u=y, v=z) -> -y - z

const grad3 = new Float64Array([
  1, 1, 0,
  -1, 1, 0,
  1, -1, 0,
  -1, -1, 0,
  1, 0, 1,
  -1, 0, 1,
  1, 0, -1,
  -1, 0, -1,
  0, 1, 1,
  0, -1, 1,
  0, 1, -1,
  0, -1, -1,
  1, 1, 0,    // h=12 -> u=y, v=x -> x+y
  0, -1, 1,   // h=13 -> u=y, v=z -> -y+z -> 0x + -1y + 1z
  -1, 1, 0,   // h=14 -> u=y, v=x -> (h&1)=0 => u=y, (h&2)=2 => -v=-x => y-x => -1x + 1y
  0, -1, -1   // h=15 -> u=y, v=z -> (h&1)=1 => -u=-y, (h&2)=2 => -v=-z => -y-z -> 0x + -1y + -1z
]);

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

  const hAA = (permutation[AA] & 15) * 3;
  const hBA = (permutation[BA] & 15) * 3;
  const hAB = (permutation[AB] & 15) * 3;
  const hBB = (permutation[BB] & 15) * 3;
  const hAA1 = (permutation[AA + 1] & 15) * 3;
  const hBA1 = (permutation[BA + 1] & 15) * 3;
  const hAB1 = (permutation[AB + 1] & 15) * 3;
  const hBB1 = (permutation[BB + 1] & 15) * 3;

  const x1 = x - 1;
  const y1 = y - 1;
  const z1 = z - 1;

  const g1 = grad3[hAA] * x + grad3[hAA + 1] * y + grad3[hAA + 2] * z;
  const g2 = grad3[hBA] * x1 + grad3[hBA + 1] * y + grad3[hBA + 2] * z;
  const g3 = grad3[hAB] * x + grad3[hAB + 1] * y1 + grad3[hAB + 2] * z;
  const g4 = grad3[hBB] * x1 + grad3[hBB + 1] * y1 + grad3[hBB + 2] * z;

  const g5 = grad3[hAA1] * x + grad3[hAA1 + 1] * y + grad3[hAA1 + 2] * z1;
  const g6 = grad3[hBA1] * x1 + grad3[hBA1 + 1] * y + grad3[hBA1 + 2] * z1;
  const g7 = grad3[hAB1] * x + grad3[hAB1 + 1] * y1 + grad3[hAB1 + 2] * z1;
  const g8 = grad3[hBB1] * x1 + grad3[hBB1 + 1] * y1 + grad3[hBB1 + 2] * z1;

  const l1 = g1 + u * (g2 - g1);
  const l2 = g3 + u * (g4 - g3);
  const l3 = l1 + v * (l2 - l1);

  const l4 = g5 + u * (g6 - g5);
  const l5 = g7 + u * (g8 - g7);
  const l6 = l4 + v * (l5 - l4);

  return l3 + w * (l6 - l3);
}

function fractal(x, z, octaves, persistence, scale) {
  if (persistence === 0.5) {
    let f = scale;
    if (octaves === 5) {
      const n0 = noise(x * f, 0, z * f);
      f *= 2;
      const n1 = noise(x * f, 0, z * f);
      f *= 2;
      const n2 = noise(x * f, 0, z * f);
      f *= 2;
      const n3 = noise(x * f, 0, z * f);
      f *= 2;
      const n4 = noise(x * f, 0, z * f);
      return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625) / 1.9375;
    }
    if (octaves === 6) {
      const n0 = noise(x * f, 0, z * f);
      f *= 2;
      const n1 = noise(x * f, 0, z * f);
      f *= 2;
      const n2 = noise(x * f, 0, z * f);
      f *= 2;
      const n3 = noise(x * f, 0, z * f);
      f *= 2;
      const n4 = noise(x * f, 0, z * f);
      f *= 2;
      const n5 = noise(x * f, 0, z * f);
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

init();

export const Noise = {
  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); },
  permutation,
  init,
  noise,
  fractal
};
