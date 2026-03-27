function hash2D(x, z, seed = 0) {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x, z, seed = 0) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;

  // Inline smoothstep
  const fx = tx * tx * (3 - 2 * tx);
  const fz = tz * tz * (3 - 2 * tz);

  // Inline hash2D and precalculate common terms to avoid redundancy
  const seedTerm = seed * 74.7;
  const x0Term = x0 * 127.1;
  const z0Term = z0 * 311.7;

  let n = Math.sin(x0Term + z0Term + seedTerm) * 43758.5453123;
  const n00 = n - Math.floor(n);

  n = Math.sin((x0 + 1) * 127.1 + z0Term + seedTerm) * 43758.5453123;
  const n10 = n - Math.floor(n);

  n = Math.sin(x0Term + (z0 + 1) * 311.7 + seedTerm) * 43758.5453123;
  const n01 = n - Math.floor(n);

  n = Math.sin((x0 + 1) * 127.1 + (z0 + 1) * 311.7 + seedTerm) * 43758.5453123;
  const n11 = n - Math.floor(n);

  const nx0 = n00 + fx * (n10 - n00);
  const nx1 = n01 + fx * (n11 - n01);
  return nx0 + fz * (nx1 - nx0);
}

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
