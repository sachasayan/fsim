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

  // inline smoothstep
  const tx0 = x - x0;
  const tx = tx0 * tx0 * (3 - 2 * tx0);

  const tz0 = z - z0;
  const tz = tz0 * tz0 * (3 - 2 * tz0);

  // precalc seed
  const s = seed * 74.7;
  const cx = x0 * 127.1 + s;
  const cz = z0 * 311.7;

  // inline hash2D
  const n00_s = Math.sin(cx + cz) * 43758.5453123;
  const n00 = n00_s - Math.floor(n00_s);

  const n10_s = Math.sin(cx + 127.1 + cz) * 43758.5453123;
  const n10 = n10_s - Math.floor(n10_s);

  const n01_s = Math.sin(cx + cz + 311.7) * 43758.5453123;
  const n01 = n01_s - Math.floor(n01_s);

  const n11_s = Math.sin(cx + 127.1 + cz + 311.7) * 43758.5453123;
  const n11 = n11_s - Math.floor(n11_s);

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
    sum +=
      valueNoise2D(x * frequency, z * frequency, seed + i * 17) * amplitude;
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
  fbm2D,
};
