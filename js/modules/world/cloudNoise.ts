// @ts-check

/**
 * @param {number} x
 * @param {number} z
 * @param {number} [seed]
 * @returns {number}
 */
function hash2D(x, z, seed = 0) {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * @param {number} t
 * @returns {number}
 */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} [seed]
 * @returns {number}
 */
function valueNoise2D(x, z, seed = 0) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);

  const dx = x - x0;
  const dz = z - z0;
  const tx = dx * dx * (3 - 2 * dx);
  const tz = dz * dz * (3 - 2 * dz);

  // Precalculate repeated terms for hash2D to avoid redundant multiplications
  const baseY = z0 * 311.7 + seed * 74.7;
  const baseY1 = baseY + 311.7; // (z0 + 1) * 311.7 + seed * 74.7
  const baseX = x0 * 127.1;
  const baseX1 = baseX + 127.1; // (x0 + 1) * 127.1

  const n00_val = Math.sin(baseX + baseY) * 43758.5453123;
  const n00 = n00_val - Math.floor(n00_val);

  const n10_val = Math.sin(baseX1 + baseY) * 43758.5453123;
  const n10 = n10_val - Math.floor(n10_val);

  const n01_val = Math.sin(baseX + baseY1) * 43758.5453123;
  const n01 = n01_val - Math.floor(n01_val);

  const n11_val = Math.sin(baseX1 + baseY1) * 43758.5453123;
  const n11 = n11_val - Math.floor(n11_val);

  // Optimized lerp: a + t * (b - a)
  const nx0 = n00 + tx * (n10 - n00);
  const nx1 = n01 + tx * (n11 - n01);
  return nx0 + tz * (nx1 - nx0);
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} octaves
 * @param {number} lacunarity
 * @param {number} gain
 * @param {number} [seed]
 * @returns {number}
 */
function fbm2D(x, z, octaves, lacunarity, gain, seed = 0) {
  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * frequency, z * frequency, seed + i * 17) * amplitude;
    norm += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return norm > 0 ? sum / norm : 0;
}

export const CLOUD_NOISE = {
  hash2D,
  smoothstep,
  valueNoise2D,
  fbm2D
};
