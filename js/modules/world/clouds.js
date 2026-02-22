import * as THREE from 'three';

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
    sum += valueNoise2D(x * frequency, z * frequency, seed + i * 17) * amplitude;
    norm += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return norm > 0 ? sum / norm : 0;
}

export function createCloudSystem({ scene }) {
  const voxelSize = 220;
  const worldHalfExtent = 22000;
  const gridStep = 300;
  const layersMax = 4;
  const tileSize = 6000;

  const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize * 0.55, voxelSize);
  const voxelMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    roughness: 0.88,
    metalness: 0.0,
    emissive: 0xffffff,
    emissiveIntensity: 0.06
  });

  const tiles = new Map();
  function getTileEntry(worldX, worldZ) {
    const tx = Math.floor((worldX + worldHalfExtent) / tileSize);
    const tz = Math.floor((worldZ + worldHalfExtent) / tileSize);
    const key = `${tx},${tz}`;
    if (!tiles.has(key)) {
      const ox = -worldHalfExtent + tx * tileSize;
      const oz = -worldHalfExtent + tz * tileSize;
      tiles.set(key, { ox, oz, instances: [], colors: [] });
    }
    return tiles.get(key);
  }

  const tint = new THREE.Color();
  for (let x = -worldHalfExtent; x <= worldHalfExtent; x += gridStep) {
    for (let z = -worldHalfExtent; z <= worldHalfExtent; z += gridStep) {
      const nLarge = fbm2D(x * 0.00018, z * 0.00018, 4, 2.0, 0.5, 11);
      const nDetail = fbm2D(x * 0.00052, z * 0.00052, 3, 2.1, 0.55, 29);
      const density = nLarge * 0.78 + nDetail * 0.22;
      if (density < 0.6) continue;

      const baseY = 900 + nLarge * 3200;
      const columnLayers = 1 + Math.floor((density - 0.6) / 0.4 * layersMax);
      const cappedLayers = Math.min(layersMax, Math.max(1, columnLayers));
      const spread = 0.75 + hash2D(x / gridStep, z / gridStep, 3) * 0.6;

      for (let l = 0; l < cappedLayers; l++) {
        const jitterX = (hash2D(x + l, z - l, 41) - 0.5) * gridStep * 0.65;
        const jitterZ = (hash2D(x - l, z + l, 53) - 0.5) * gridStep * 0.65;
        const jitterY = (hash2D(x + l * 3, z + l * 5, 67) - 0.5) * 70;
        const wx = x + jitterX;
        const wz = z + jitterZ;
        const entry = getTileEntry(wx, wz);

        entry.instances.push({
          x: wx - entry.ox,
          y: baseY + l * voxelSize * 0.42 + jitterY,
          z: wz - entry.oz,
          s: spread * (0.86 + l * 0.08)
        });

        const shade = 0.9 + (density - 0.6) * 0.22 + l * 0.03;
        tint.setRGB(Math.min(1, shade), Math.min(1, shade), Math.min(1, shade));
        entry.colors.push(tint.clone());
      }
    }
  }

  const dummy = new THREE.Object3D();
  const clouds = new THREE.Group();
  for (const entry of tiles.values()) {
    if (entry.instances.length === 0) continue;

    const mesh = new THREE.InstancedMesh(voxelGeo, voxelMat, entry.instances.length);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    for (let i = 0; i < entry.instances.length; i++) {
      const c = entry.instances[i];
      dummy.position.set(c.x, c.y, c.z);
      dummy.scale.set(c.s * (1.18 + hash2D(c.x, c.z, 81) * 0.5), c.s * (0.75 + hash2D(c.z, c.x, 82) * 0.35), c.s);
      dummy.rotation.set(0, hash2D(c.x, c.z, 83) * Math.PI * 2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, entry.colors[i]);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.position.set(entry.ox, 0, entry.oz);
    clouds.add(mesh);
  }

  scene.add(clouds);
  return { clouds, cloudMaterial: voxelMat };
}
