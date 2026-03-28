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
  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);

  const n00 = hash2D(x0, z0, seed);
  const n10 = hash2D(x1, z0, seed);
  const n01 = hash2D(x0, z1, seed);
  const n11 = hash2D(x1, z1, seed);
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
    // ⚡ Bolt Performance Optimization:
    // Inline valueNoise2D to eliminate function call overhead in hot loops
    const nx = x * frequency;
    const nz = z * frequency;

    const x0 = Math.floor(nx);
    const z0 = Math.floor(nz);
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    const tx0 = nx - x0;
    const tz0 = nz - z0;
    const tx = tx0 * tx0 * (3 - 2 * tx0);
    const tz = tz0 * tz0 * (3 - 2 * tz0);

    // ⚡ Bolt Performance Optimization:
    // Precompute common coordinates to avoid redundant math
    const s = seed + i * 17;
    const cx0 = x0 * 127.1 + s * 74.7;
    const cx1 = x1 * 127.1 + s * 74.7;
    const cz0 = z0 * 311.7;
    const cz1 = z1 * 311.7;

    let n;

    n = Math.sin(cx0 + cz0) * 43758.5453123;
    const n00 = n - Math.floor(n);

    n = Math.sin(cx1 + cz0) * 43758.5453123;
    const n10 = n - Math.floor(n);

    n = Math.sin(cx0 + cz1) * 43758.5453123;
    const n01 = n - Math.floor(n);

    n = Math.sin(cx1 + cz1) * 43758.5453123;
    const n11 = n - Math.floor(n);

    const nx0 = n00 + tx * (n10 - n00);
    const nx1 = n01 + tx * (n11 - n01);

    sum += (nx0 + tz * (nx1 - nx0)) * amplitude;

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
