// @ts-check

const p = new Uint8Array(512);

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t, a, b) => a + t * (b - a);
const grad = (hash, x, y, z) => {
  let h = hash & 15;
  let u = h < 8 ? x : y;
  let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

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

  let A = p[X] + Y;
  let AA = p[A] + Z;
  let AB = p[A + 1] + Z;
  let B = p[X + 1] + Y;
  let BA = p[B] + Z;
  let BB = p[B + 1] + Z;

  // Manual inline of grad and lerp to avoid function call overhead
  let h_AA = p[AA] & 15;
  let u_AA = h_AA < 8 ? x : y;
  let v_AA = h_AA < 4 ? y : h_AA === 12 || h_AA === 14 ? x : z;
  let grad_AA = ((h_AA & 1) === 0 ? u_AA : -u_AA) + ((h_AA & 2) === 0 ? v_AA : -v_AA);

  let h_BA = p[BA] & 15;
  let u_BA = h_BA < 8 ? x - 1 : y;
  let v_BA = h_BA < 4 ? y : h_BA === 12 || h_BA === 14 ? x - 1 : z;
  let grad_BA = ((h_BA & 1) === 0 ? u_BA : -u_BA) + ((h_BA & 2) === 0 ? v_BA : -v_BA);

  let lerp_1 = grad_AA + u * (grad_BA - grad_AA);

  let h_AB = p[AB] & 15;
  let u_AB = h_AB < 8 ? x : y - 1;
  let v_AB = h_AB < 4 ? y - 1 : h_AB === 12 || h_AB === 14 ? x : z;
  let grad_AB = ((h_AB & 1) === 0 ? u_AB : -u_AB) + ((h_AB & 2) === 0 ? v_AB : -v_AB);

  let h_BB = p[BB] & 15;
  let u_BB = h_BB < 8 ? x - 1 : y - 1;
  let v_BB = h_BB < 4 ? y - 1 : h_BB === 12 || h_BB === 14 ? x - 1 : z;
  let grad_BB = ((h_BB & 1) === 0 ? u_BB : -u_BB) + ((h_BB & 2) === 0 ? v_BB : -v_BB);

  let lerp_2 = grad_AB + u * (grad_BB - grad_AB);
  let lerp_3 = lerp_1 + v * (lerp_2 - lerp_1);

  let h_AA1 = p[AA + 1] & 15;
  let u_AA1 = h_AA1 < 8 ? x : y;
  let v_AA1 = h_AA1 < 4 ? y : h_AA1 === 12 || h_AA1 === 14 ? x : z - 1;
  let grad_AA1 = ((h_AA1 & 1) === 0 ? u_AA1 : -u_AA1) + ((h_AA1 & 2) === 0 ? v_AA1 : -v_AA1);

  let h_BA1 = p[BA + 1] & 15;
  let u_BA1 = h_BA1 < 8 ? x - 1 : y;
  let v_BA1 = h_BA1 < 4 ? y : h_BA1 === 12 || h_BA1 === 14 ? x - 1 : z - 1;
  let grad_BA1 = ((h_BA1 & 1) === 0 ? u_BA1 : -u_BA1) + ((h_BA1 & 2) === 0 ? v_BA1 : -v_BA1);

  let lerp_4 = grad_AA1 + u * (grad_BA1 - grad_AA1);

  let h_AB1 = p[AB + 1] & 15;
  let u_AB1 = h_AB1 < 8 ? x : y - 1;
  let v_AB1 = h_AB1 < 4 ? y - 1 : h_AB1 === 12 || h_AB1 === 14 ? x : z - 1;
  let grad_AB1 = ((h_AB1 & 1) === 0 ? u_AB1 : -u_AB1) + ((h_AB1 & 2) === 0 ? v_AB1 : -v_AB1);

  let h_BB1 = p[BB + 1] & 15;
  let u_BB1 = h_BB1 < 8 ? x - 1 : y - 1;
  let v_BB1 = h_BB1 < 4 ? y - 1 : h_BB1 === 12 || h_BB1 === 14 ? x - 1 : z - 1;
  let grad_BB1 = ((h_BB1 & 1) === 0 ? u_BB1 : -u_BB1) + ((h_BB1 & 2) === 0 ? v_BB1 : -v_BB1);

  let lerp_5 = grad_AB1 + u * (grad_BB1 - grad_AB1);
  let lerp_6 = lerp_4 + v * (lerp_5 - lerp_4);

  return lerp_3 + w * (lerp_6 - lerp_3);
}

export const Noise = {
  permutation: p,
  init(seed = 12345) {
    let p_init = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p_init[i] = i;

    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = Math.imul(1664525, s) + 1013904223 | 0;
      let rand = Math.floor((((s >>> 8) & 0xfffff) / 0x100000) * (i + 1));
      let temp = p_init[i];
      p_init[i] = p_init[rand];
      p_init[rand] = temp;
    }
    for (let i = 0; i < 512; i++) p[i] = p_init[i & 255];
  },
  fade,
  lerp,
  grad,
  noise,
  fractal(x, z, octaves, persistence, scale) {
    if (persistence === 0.5) {
      let f = scale;
      if (octaves === 5) {
        let xf = x * f;
        let zf = z * f;
        const n0 = noise(xf, 0, zf);
        xf *= 2; zf *= 2;
        const n1 = noise(xf, 0, zf);
        xf *= 2; zf *= 2;
        const n2 = noise(xf, 0, zf);
        xf *= 2; zf *= 2;
        const n3 = noise(xf, 0, zf);
        xf *= 2; zf *= 2;
        const n4 = noise(xf, 0, zf);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625) * 0.5161290322580645;
      }
      if (octaves === 6) {
        let xf = x * f;
        let zf = z * f;
        const n0 = noise(xf, 0, zf);
        xf *= 2; zf *= 2;
        const n1 = noise(xf, 0, zf);
        xf *= 2; zf *= 2;
        const n2 = noise(xf, 0, zf);
        xf *= 2; zf *= 2;
        const n3 = noise(xf, 0, zf);
        xf *= 2; zf *= 2;
        const n4 = noise(xf, 0, zf);
        xf *= 2; zf *= 2;
        const n5 = noise(xf, 0, zf);
        return (n0 + n1 * 0.5 + n2 * 0.25 + n3 * 0.125 + n4 * 0.0625 + n5 * 0.03125) * 0.5079365079365079;
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
};

Noise.init();
