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

  const dx = x - x0;
  const dz = z - z0;
  const tx = dx * dx * (3 - 2 * dx);
  const tz = dz * dz * (3 - 2 * dz);

  const s = seed * 74.7;
  const s_x0 = x0 * 127.1 + s;
  const s_x1 = x1 * 127.1 + s;
  const z0_m = z0 * 311.7;
  const z1_m = z1 * 311.7;

  let n = Math.sin(s_x0 + z0_m) * 43758.5453123;
  const h00 = n - Math.floor(n);
  n = Math.sin(s_x1 + z0_m) * 43758.5453123;
  const h10 = n - Math.floor(n);
  n = Math.sin(s_x0 + z1_m) * 43758.5453123;
  const h01 = n - Math.floor(n);
  n = Math.sin(s_x1 + z1_m) * 43758.5453123;
  const h11 = n - Math.floor(n);

  const nx0 = h00 + (h10 - h00) * tx;
  const nx1 = h01 + (h11 - h01) * tx;
  return nx0 + (nx1 - nx0) * tz;
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
