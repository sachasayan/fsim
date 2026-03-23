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

function fbm2D(x, z, octaves, lacunarity, gain, seed = 0) {
  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    // ⚡ Bolt: Inline hash and interpolation logic to eliminate function calls.
    let s = seed + i * 17;
    let fx = x * frequency;
    let fz = z * frequency;
    let x0 = Math.floor(fx);
    let z0 = Math.floor(fz);
    let tx = fx - x0;
    let tz = fz - z0;

    let txSmooth = tx * tx * (3 - 2 * tx);
    let tzSmooth = tz * tz * (3 - 2 * tz);

    let seedTerm = s * 74.7;
    let z0Term = z0 * 311.7 + seedTerm;
    let z1Term = (z0 + 1) * 311.7 + seedTerm;
    let x0Term = x0 * 127.1;
    let x1Term = (x0 + 1) * 127.1;

    let n = Math.sin(x0Term + z0Term) * 43758.5453123;
    let n00 = n - Math.floor(n);

    n = Math.sin(x1Term + z0Term) * 43758.5453123;
    let n10 = n - Math.floor(n);

    n = Math.sin(x0Term + z1Term) * 43758.5453123;
    let n01 = n - Math.floor(n);

    n = Math.sin(x1Term + z1Term) * 43758.5453123;
    let n11 = n - Math.floor(n);

    let nx0 = n00 + txSmooth * (n10 - n00);
    let nx1 = n01 + txSmooth * (n11 - n01);
    let val = nx0 + tzSmooth * (nx1 - nx0);

    sum += val * amplitude;
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
