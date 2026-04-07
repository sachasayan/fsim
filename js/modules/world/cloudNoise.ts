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
  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);

  // Hoist repeated base math calculations (scaling factors) to eliminate
  // redundant multiplications in the four hash2D calls.
  const x0Scaled = x0 * 127.1;
  const z0Scaled = z0 * 311.7;
  const seedScaled = seed * 74.7;
  const x1Scaled = x0Scaled + 127.1;
  const z1Scaled = z0Scaled + 311.7;

  let n = Math.sin(x0Scaled + z0Scaled + seedScaled) * 43758.5453123;
  const n00 = n - Math.floor(n);

  n = Math.sin(x1Scaled + z0Scaled + seedScaled) * 43758.5453123;
  const n10 = n - Math.floor(n);

  n = Math.sin(x0Scaled + z1Scaled + seedScaled) * 43758.5453123;
  const n01 = n - Math.floor(n);

  n = Math.sin(x1Scaled + z1Scaled + seedScaled) * 43758.5453123;
  const n11 = n - Math.floor(n);

  const nx0 = n00 * (1 - tx) + n10 * tx;
  const nx1 = n01 * (1 - tx) + n11 * tx;
  return nx0 * (1 - tz) + nx1 * tz;
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
