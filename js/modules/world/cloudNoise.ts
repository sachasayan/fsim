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
  // Inlined smoothstep formula: t * t * (3 - 2 * t) to save function call overhead
  const tx = (x - x0) * (x - x0) * (3 - 2 * (x - x0));
  const tz = (z - z0) * (z - z0) * (3 - 2 * (z - z0));

  // Inlined hash2D calculation to eliminate recursive nested calls inside tight loop
  const n00 = Math.sin(x0 * 127.1 + z0 * 311.7 + seed * 74.7) * 43758.5453123;
  const n10 = Math.sin(x1 * 127.1 + z0 * 311.7 + seed * 74.7) * 43758.5453123;
  const n01 = Math.sin(x0 * 127.1 + z1 * 311.7 + seed * 74.7) * 43758.5453123;
  const n11 = Math.sin(x1 * 127.1 + z1 * 311.7 + seed * 74.7) * 43758.5453123;

  const f00 = n00 - Math.floor(n00);
  const f10 = n10 - Math.floor(n10);
  const f01 = n01 - Math.floor(n01);
  const f11 = n11 - Math.floor(n11);

  const nx0 = f00 * (1 - tx) + f10 * tx;
  const nx1 = f01 * (1 - tx) + f11 * tx;
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
