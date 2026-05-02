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
  const x1 = x0 + 1;
  const z1 = z0 + 1;

  const tx = x - x0;
  const tz = z - z0;
  const t_tx = tx * tx * (3 - 2 * tx);
  const t_tz = tz * tz * (3 - 2 * tz);

  const n00 = hash2D(x0, z0, seed);
  const n10 = hash2D(x1, z0, seed);
  const n01 = hash2D(x0, z1, seed);
  const n11 = hash2D(x1, z1, seed);

  const nx0 = n00 * (1 - t_tx) + n10 * t_tx;
  const nx1 = n01 * (1 - t_tx) + n11 * t_tx;

  return nx0 * (1 - t_tz) + nx1 * t_tz;
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
    // Inlining valueNoise2D inner loops and smoothstep evaluation for significant performance gain
    const fx = x * frequency;
    const fz = z * frequency;
    const s_seed = seed + i * 17;

    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const tx = fx - x0;
    const tz = fz - z0;
    const t_tx = tx * tx * (3 - 2 * tx);
    const t_tz = tz * tz * (3 - 2 * tz);

    const n00 = hash2D(x0, z0, s_seed);
    const n10 = hash2D(x1, z0, s_seed);
    const n01 = hash2D(x0, z1, s_seed);
    const n11 = hash2D(x1, z1, s_seed);

    const nx0 = n00 * (1 - t_tx) + n10 * t_tx;
    const nx1 = n01 * (1 - t_tx) + n11 * t_tx;

    sum += (nx0 * (1 - t_tz) + nx1 * t_tz) * amplitude;

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
