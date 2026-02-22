import * as THREE from 'three';

function createWaterNormalMap(Noise) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);

  // Generate a bumpy noise normal map
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let scale = 4; // Much lower scale for wide, sweeping ocean swells (Fixes tiling)
      let h0 = Noise.fractal((x / size) * scale, (y / size) * scale, 3, 0.5, 1);
      let hx = Noise.fractal(((x + 1) / size) * scale, (y / size) * scale, 3, 0.5, 1);
      let hy = Noise.fractal((x / size) * scale, ((y + 1) / size) * scale, 3, 0.5, 1);

      let dx = (hx - h0) * 5.0; // Gentler slope
      let dy = (hy - h0) * 5.0;
      let dz = 1.0;
      let len = Math.sqrt(dx * dx + dy * dy + dz * dz);

      let idx = (y * size + x) * 4;
      imgData.data[idx] = Math.floor(((dx / len) * 0.5 + 0.5) * 255);
      imgData.data[idx + 1] = Math.floor(((dy / len) * 0.5 + 0.5) * 255);
      imgData.data[idx + 2] = 255;
      imgData.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4); // Minimal repetition to remove the grid effect
  return tex;
}

function createTreeBillboardTexture(THREE, kind) {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // Trunk
  ctx.fillStyle = kind === 'dry' ? '#6f5b45' : '#5a4029';
  ctx.fillRect(56, 156, 16, 86);

  if (kind === 'conifer') {
    ctx.fillStyle = '#2d5525';
    ctx.beginPath();
    ctx.moveTo(64, 26);
    ctx.lineTo(20, 170);
    ctx.lineTo(108, 170);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#38652d';
    ctx.beginPath();
    ctx.moveTo(64, 52);
    ctx.lineTo(30, 182);
    ctx.lineTo(98, 182);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'poplar') {
    ctx.fillStyle = '#5f8a3e';
    ctx.beginPath();
    ctx.ellipse(64, 98, 26, 74, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6a9646';
    ctx.beginPath();
    ctx.ellipse(64, 110, 18, 60, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'dry') {
    ctx.strokeStyle = '#7e6951';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(64, 158);
    ctx.lineTo(50, 98);
    ctx.moveTo(64, 150);
    ctx.lineTo(78, 92);
    ctx.moveTo(64, 126);
    ctx.lineTo(38, 84);
    ctx.moveTo(64, 118);
    ctx.lineTo(92, 76);
    ctx.stroke();
  } else {
    // broadleaf default
    ctx.fillStyle = '#487532';
    ctx.beginPath();
    ctx.arc(50, 106, 32, 0, Math.PI * 2);
    ctx.arc(80, 104, 30, 0, Math.PI * 2);
    ctx.arc(65, 76, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#56883b';
    ctx.beginPath();
    ctx.arc(62, 96, 24, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

export function createTerrainSystem({ scene, Noise, PHYSICS }) {
  const TREE_DENSITY_MULTIPLIER = 4.0;
  const waterMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    roughness: 0.3, // Increased roughness to scatter the blinding sun reflection
    metalness: 0.8,
    normalMap: createWaterNormalMap(Noise),
    normalScale: new THREE.Vector2(0.5, 0.5)
  });

  const CHUNK_SIZE = 4000;
  const LOD_LEVELS = [
    {
      terrainRes: 224,
      waterRes: 72,
      propDensity: 1.0,
      enableBuildings: true,
      enableTrees: true,
      enableBoats: true
    },
    {
      terrainRes: 64,
      waterRes: 40,
      propDensity: 0.48,
      enableBuildings: true,
      enableTrees: true,
      enableBoats: false
    },
    {
      terrainRes: 28,
      waterRes: 20,
      propDensity: 0.16,
      enableBuildings: false,
      enableTrees: true,
      enableBoats: false
    },
    {
      terrainRes: 12,
      waterRes: 10,
      propDensity: 0.0,
      enableBuildings: false,
      enableTrees: false,
      enableBoats: false
    }
  ];
  const terrainChunks = new Map();
  const pendingChunkBuilds = [];
  const pendingChunkKeys = new Set();
  let pendingQueueDirty = false;
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    flatShading: true
  });

  // Instanced Tree Resources: crossed low-poly billboard cards
  const treeBillboardGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  treeBillboardGeo.translate(0, 0.5, 0);
  const treeTextures = {
    conifer: createTreeBillboardTexture(THREE, 'conifer'),
    broadleaf: createTreeBillboardTexture(THREE, 'broadleaf'),
    poplar: createTreeBillboardTexture(THREE, 'poplar'),
    dry: createTreeBillboardTexture(THREE, 'dry')
  };
  function makeTreeBillboardMaterial(texture, tint) {
    return new THREE.MeshStandardMaterial({
      map: texture,
      color: tint,
      transparent: true,
      alphaTest: 0.12,
      side: THREE.DoubleSide,
      roughness: 1.0,
      metalness: 0.0
    });
  }
  const treeBillboardMats = {
    conifer: makeTreeBillboardMaterial(treeTextures.conifer, 0x9eb38a),
    broadleaf: makeTreeBillboardMaterial(treeTextures.broadleaf, 0xa3b88e),
    poplar: makeTreeBillboardMaterial(treeTextures.poplar, 0xafc093),
    dry: makeTreeBillboardMaterial(treeTextures.dry, 0xc6b696)
  };

  // Instanced Boats
  const hullGeo = new THREE.BoxGeometry(2.5, 1.2, 8);
  hullGeo.translate(0, 0.6, 0);
  const cabinGeo = new THREE.BoxGeometry(2.0, 1.5, 3);
  cabinGeo.translate(0, 1.9, -1); // Lift cabin above hull, push back slightly
  const mastGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.8, 6);
  mastGeo.translate(0, 2.8, 0.2);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.6 });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.4, metalness: 0.6 });

  // We now use a 1x1x1 base box. We will scale and color it per-instance to create varied buildings
  const baseBuildingGeo = new THREE.BoxGeometry(1, 1, 1);
  baseBuildingGeo.translate(0, 0.5, 0); // Base at y=0
  const baseBuildingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });
  const roofCapGeo = new THREE.BoxGeometry(1.06, 0.18, 1.06);
  roofCapGeo.translate(0, 0.09, 0);
  const roofCapMat = new THREE.MeshStandardMaterial({ color: 0x3f3f3f, roughness: 0.8, metalness: 0.1 });
  const podiumGeo = new THREE.BoxGeometry(1.02, 1, 1.02);
  podiumGeo.translate(0, 0.5, 0);
  const podiumMat = new THREE.MeshStandardMaterial({ color: 0x585858, roughness: 0.78, metalness: 0.12 });
  const spireGeo = new THREE.CylinderGeometry(0.06, 0.12, 1, 8);
  spireGeo.translate(0, 0.5, 0);
  const spireMat = new THREE.MeshStandardMaterial({ color: 0xc7c7c7, roughness: 0.3, metalness: 0.9 });
  const terrainColorSand = new THREE.Color(0xc2b280);
  const terrainColorLowland = new THREE.Color(0x355e3b);
  const terrainColorForest = new THREE.Color(0x2a4b2a);
  const terrainColorRock = new THREE.Color(0x555555);
  const terrainColorSnow = new THREE.Color(0xffffff);
  const waterColorFoam = new THREE.Color(0xffffff);
  const waterColorBlue = new THREE.Color(0x0077be);
  const waterColorDeep = new THREE.Color(0x003377);

  const dummy = new THREE.Object3D();

  function hash2(x, z, seed = 0) {
    const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function cityHubInfluence(vx, vz) {
    const cellSize = 14000;
    const gx = Math.floor(vx / cellSize);
    const gz = Math.floor(vz / cellSize);
    let influence = 0;

    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const cx = gx + ox;
        const cz = gz + oz;
        const hubChance = hash2(cx, cz, 1);
        if (hubChance < 0.35) continue;

        const centerX = (cx + 0.15 + hash2(cx, cz, 2) * 0.7) * cellSize;
        const centerZ = (cz + 0.15 + hash2(cx, cz, 3) * 0.7) * cellSize;
        const radius = 2600 + hash2(cx, cz, 4) * 5200;
        const intensity = 0.45 + hash2(cx, cz, 5) * 0.55;

        const d = Math.hypot(vx - centerX, vz - centerZ);
        const local = Math.max(0, 1 - d / radius) * intensity;
        influence = Math.max(influence, local);
      }
    }

    return influence;
  }

  function pickWeighted(value01, weights) {
    let sum = 0;
    for (const w of Object.values(weights)) sum += w;
    if (sum <= 0) return Object.keys(weights)[0];
    let t = value01 * sum;
    for (const [key, weight] of Object.entries(weights)) {
      t -= weight;
      if (t <= 0) return key;
    }
    return Object.keys(weights)[Object.keys(weights).length - 1];
  }

  function getDistrictProfile(vx, vz, urbanScore, height) {
    const dx = Math.floor(vx / 3200);
    const dz = Math.floor(vz / 3200);
    const districtNoise = hash2(dx, dz, 40);
    const nearWater = height < 35;

    if (urbanScore > 0.78) {
      return {
        kind: 'financial_core',
        roadScale: 0.72,
        lotDensity: 0.18,
        classWeights: { supertall: 0.22, highrise: 0.44, office: 0.27, apartment: 0.07 }
      };
    }
    if (nearWater && urbanScore > 0.5) {
      return {
        kind: 'waterfront_mixed',
        roadScale: 0.9,
        lotDensity: 0.13,
        classWeights: { highrise: 0.2, office: 0.23, apartment: 0.33, townhouse: 0.2, industrial: 0.04 }
      };
    }
    if (districtNoise > 0.72 && urbanScore > 0.42) {
      return {
        kind: 'industrial_belt',
        roadScale: 1.12,
        lotDensity: 0.1,
        classWeights: { industrial: 0.54, office: 0.22, apartment: 0.1, townhouse: 0.14 }
      };
    }
    if (urbanScore > 0.52) {
      return {
        kind: 'mixed_use',
        roadScale: 0.96,
        lotDensity: 0.12,
        classWeights: { highrise: 0.18, office: 0.3, apartment: 0.34, townhouse: 0.14, industrial: 0.04 }
      };
    }
    return {
      kind: 'residential_ring',
      roadScale: 1.15,
      lotDensity: 0.08,
      classWeights: { apartment: 0.26, townhouse: 0.56, industrial: 0.18 }
    };
  }

  function getForestProfile(vx, vz, height, forestNoise, urbanScore) {
    const moisture = (Noise.fractal(vx + 9000, vz - 7000, 3, 0.5, 0.0018) + 1) * 0.5;
    const heat = (Noise.fractal(vx - 12000, vz + 6000, 3, 0.5, 0.0012) + 1) * 0.5 - Math.max(0, height - 220) / 520;

    if (urbanScore > 0.35) {
      return {
        kind: 'parkland',
        density: 0.06,
        typeWeights: { broadleaf: 0.55, poplar: 0.35, conifer: 0.1 }
      };
    }
    if (height > 280 || heat < 0.28) {
      return {
        kind: 'alpine',
        density: 0.08 + forestNoise * 0.08,
        typeWeights: { conifer: 0.72, dry: 0.2, poplar: 0.08 }
      };
    }
    if (moisture > 0.66) {
      return {
        kind: 'dense_mixed',
        density: 0.16 + forestNoise * 0.1,
        typeWeights: { conifer: 0.46, broadleaf: 0.34, poplar: 0.2 }
      };
    }
    if (moisture < 0.35) {
      return {
        kind: 'dry_scrub',
        density: 0.05 + forestNoise * 0.05,
        typeWeights: { dry: 0.52, poplar: 0.18, broadleaf: 0.16, conifer: 0.14 }
      };
    }
    return {
      kind: 'temperate_mixed',
      density: 0.1 + forestNoise * 0.07,
      typeWeights: { broadleaf: 0.42, conifer: 0.35, poplar: 0.2, dry: 0.03 }
    };
  }

  function getTerrainHeight(x, z) {
    let distFromRunwayZ = Math.abs(z);
    let distFromRunwayX = Math.abs(x);

    // Base noise averages around 0, multiply and add 100 so land is naturally elevated above water
    let noiseVal = Noise.fractal(x, z, 6, 0.5, 0.0003) * 600 + 100;

    // Flatten for runway (centered at origin, extending along Z)
    let runwayMask = 1.0;
    if (distFromRunwayX < 150 && distFromRunwayZ < 2500) {
      return 0; // Lock runway exactly to Y=0
    } else if (distFromRunwayX < 600 && distFromRunwayZ < 3500) {
      // Smooth transition
      let blendX = Math.max(0, (distFromRunwayX - 150) / 450);
      let blendZ = Math.max(0, (distFromRunwayZ - 2500) / 1000);
      runwayMask = Math.min(1.0, blendX + blendZ);
      return noiseVal * runwayMask;
    }

    return noiseVal;
  }

  function getLodForRingDistance(ringDistance, currentLod = null) {
    // Hysteresis band to avoid rapid LOD toggling near ring boundaries.
    if (currentLod === 0) {
      if (ringDistance <= 1) return 0;
      if (ringDistance <= 3) return 1;
      if (ringDistance <= 6) return 2;
      return 3;
    }
    if (currentLod === 1) {
      if (ringDistance <= 1) return 0;
      if (ringDistance <= 4) return 1;
      if (ringDistance <= 7) return 2;
      return 3;
    }
    if (currentLod === 2) {
      if (ringDistance <= 2) return 1;
      if (ringDistance <= 7) return 2;
      return 3;
    }
    if (currentLod === 3) {
      if (ringDistance <= 6) return 2;
      return 3;
    }

    if (ringDistance <= 1) return 0;
    if (ringDistance <= 3) return 1;
    if (ringDistance <= 6) return 2;
    return 3;
  }

  function disposeChunkGroup(chunkGroup) {
    scene.remove(chunkGroup);
    chunkGroup.traverse((child) => {
      if (child.isMesh || child.isInstancedMesh) {
        child.geometry.dispose();
      }
    });
  }

  function enqueueChunkBuild(cx, cz, lod, priority) {
    const key = `${cx},${cz}`;
    if (pendingChunkKeys.has(key)) return;
    pendingChunkKeys.add(key);
    pendingChunkBuilds.push({ cx, cz, lod, key, priority });
    pendingQueueDirty = true;
  }

  function processChunkBuildQueue(maxBuildsPerFrame = 2) {
    if (pendingChunkBuilds.length === 0) return;
    if (pendingQueueDirty) {
      pendingChunkBuilds.sort((a, b) => b.priority - a.priority);
      pendingQueueDirty = false;
    }

    let builds = 0;
    while (builds < maxBuildsPerFrame && pendingChunkBuilds.length > 0) {
      const job = pendingChunkBuilds.pop();
      pendingChunkKeys.delete(job.key);
      const existing = terrainChunks.get(job.key);
      if (existing && existing.lod === job.lod) {
        builds++;
        continue;
      }

      if (existing) {
        disposeChunkGroup(existing.group);
        terrainChunks.delete(job.key);
      }

      const group = generateChunk(job.cx, job.cz, job.lod);
      terrainChunks.set(job.key, { group, lod: job.lod });
      builds++;
    }
  }

  function generateChunk(cx, cz, lod = 0) {
    const lodCfg = LOD_LEVELS[lod] || LOD_LEVELS[LOD_LEVELS.length - 1];
    const chunkGroup = new THREE.Group();
    chunkGroup.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    chunkGroup.userData.lod = lod;

    const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, lodCfg.terrainRes, lodCfg.terrainRes);
    geometry.rotateX(-Math.PI / 2); // Lay flat

    const positions = geometry.attributes.position.array;
    const colors = [];
    const colorObj = new THREE.Color();

    const treePositions = {
      conifer: [],
      broadleaf: [],
      poplar: [],
      dry: []
    };
    const buildingPositions = {
      supertall: [],
      highrise: [],
      office: [],
      apartment: [],
      townhouse: [],
      industrial: []
    };
    const boatPositions = [];

    for (let i = 0; i < positions.length; i += 3) {
      let lx = positions[i];
      let lz = positions[i + 2];
      let vx = lx + cx * CHUNK_SIZE;
      let vz = lz + cz * CHUNK_SIZE;

      let height = getTerrainHeight(vx, vz);
      positions[i + 1] = height;

      // Natural terrain coloring
      if (height < -5) {
        colorObj.copy(terrainColorSand); // Underwater Seabed / Sand
      } else if (height < 25) {
        colorObj.copy(terrainColorLowland); // Lowland / Hunter green
      } else if (height < 150) {
        colorObj.copy(terrainColorForest); // Dark forest green
      } else if (height < 400) {
        let rockBlend = (height - 150) / 250;
        colorObj.lerpColors(terrainColorForest, terrainColorRock, rockBlend);
      } else if (height < 600) {
        colorObj.copy(terrainColorRock); // Solid Rock
      } else {
        let snowBlend = Math.min(1.0, (height - 600) / 100);
        colorObj.lerpColors(terrainColorRock, terrainColorSnow, snowBlend);
      }
      colors.push(colorObj.r, colorObj.g, colorObj.b);

      // Object Placement Logic (cities, roads, parks, forests)
      const distFromRunwayX = Math.abs(vx);
      const distFromRunwayZ = Math.abs(vz);
      const cellX = Math.floor(vx / 18);
      const cellZ = Math.floor(vz / 18);
      const rng = hash2(cellX, cellZ, 9);

      if (lodCfg.enableBoats && height < -30 && rng > (0.9988 + (1 - lodCfg.propDensity) * 0.0008)) {
        boatPositions.push({ x: lx, z: lz, rot: hash2(cellX, cellZ, 10) * Math.PI * 2 });
      }

      if (distFromRunwayX < 250 && distFromRunwayZ < 2800) continue;
      if (height < -5 || height > 430) continue;

      const macroUrban = (Noise.fractal(vx, vz, 3, 0.5, 0.00035) + 1) * 0.5;
      const hubUrban = cityHubInfluence(vx, vz);
      const corridorUrban = Math.max(0, 1 - Math.abs(Math.abs(vx) - 1800) / 1800) * Math.max(0, 1 - Math.abs(vz) / 14000);
      const urbanScore = Math.max(0, Math.min(1, hubUrban * 0.65 + macroUrban * 0.25 + corridorUrban * 0.25));
      const district = getDistrictProfile(vx, vz, urbanScore, height);

      const warpX = Noise.fractal(vx + 7000, vz - 11000, 2, 0.5, 0.0013) * 60;
      const warpZ = Noise.fractal(vx - 9000, vz + 13000, 2, 0.5, 0.0013) * 60;
      const roadSpacing = (90 + (1 - urbanScore) * 140) * district.roadScale;
      const roadWidth = 4 + urbanScore * 4;
      const roadX = Math.abs((((vx + warpX) % roadSpacing) + roadSpacing) % roadSpacing - roadSpacing / 2);
      const roadZ = Math.abs((((vz + warpZ) % roadSpacing) + roadSpacing) % roadSpacing - roadSpacing / 2);
      const isRoad = roadX < roadWidth || roadZ < roadWidth;

      const parkNoise = (Noise.fractal(vx - 20000, vz + 15000, 3, 0.5, 0.0025) + 1) * 0.5;
      const isPark = urbanScore > 0.35 && parkNoise > 0.7 && !isRoad;
      const forestNoise = (Noise.fractal(vx + 5000, vz + 5000, 3, 0.5, 0.002) + 1) * 0.5;

      if (lodCfg.enableBuildings && urbanScore > 0.22 && !isRoad && !isPark) {
        const lotDensity = district.lotDensity * (0.55 + urbanScore * 0.95);
        if (rng < lotDensity * lodCfg.propDensity) {
          const classNoise = hash2(cellX, cellZ, 12);
          const buildingClass = pickWeighted(classNoise, district.classWeights);

          const ox = (hash2(cellX, cellZ, 14) - 0.5) * 24;
          const oz = (hash2(cellX, cellZ, 15) - 0.5) * 24;
          const px = lx + ox;
          const pz = lz + oz;
          const py = getTerrainHeight(vx + ox, vz + oz);
          if (py > -5 && py < 430) {
            buildingPositions[buildingClass].push({
              x: px,
              y: py,
              z: pz,
              angle: Math.floor(hash2(cellX, cellZ, 16) * 4) * (Math.PI / 2),
              seed: hash2(cellX, cellZ, 17),
              seed2: hash2(cellX, cellZ, 18),
              seed3: hash2(cellX, cellZ, 19)
            });
          }
        }
      } else if (lodCfg.enableTrees && forestNoise > 0.45 && !isRoad && !isPark) {
        const forest = getForestProfile(vx, vz, height, forestNoise, urbanScore);
        const treeChance = Math.min(0.95, forest.density * lodCfg.propDensity * TREE_DENSITY_MULTIPLIER);
        if (rng < treeChance) {
          const treeType = pickWeighted(hash2(cellX, cellZ, 24), forest.typeWeights);
          treePositions[treeType].push({
            x: lx + (hash2(cellX, cellZ, 20) - 0.5) * 20,
            y: height,
            z: lz + (hash2(cellX, cellZ, 21) - 0.5) * 20,
            lean: (hash2(cellX, cellZ, 22) - 0.5) * 0.08,
            seed: hash2(cellX, cellZ, 23),
            seed2: hash2(cellX, cellZ, 25)
          });
        }
      }
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const terrainMesh = new THREE.Mesh(geometry, terrainMaterial);
    terrainMesh.receiveShadow = true;
    chunkGroup.add(terrainMesh);

    // --- Generate Procedural Water Chunk ---
    const waterGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, lodCfg.waterRes, lodCfg.waterRes);
    waterGeo.rotateX(-Math.PI / 2);
    const wPos = waterGeo.attributes.position.array;
    const wCols = [];
    const wColObj = new THREE.Color();

    for (let i = 0; i < wPos.length; i += 3) {
      let vx = wPos[i] + cx * CHUNK_SIZE;
      let vz = wPos[i + 2] + cz * CHUNK_SIZE;
      let th = getTerrainHeight(vx, vz); // Terrain depth

      wPos[i + 1] = -10; // Flat water level

      let waveNoise = Noise.fractal(vx / 30, vz / 30, 2, 0.5, 1);
      let depth = -10 - th + waveNoise * 4.0;

      if (depth < 2) {
        wColObj.copy(waterColorFoam); // Shoreline Froth
      } else if (depth < 25) {
        let blend = (depth - 2) / 23;
        wColObj.lerpColors(waterColorFoam, waterColorBlue, Math.pow(blend, 0.6));
      } else {
        wColObj.copy(waterColorDeep);
      }
      wCols.push(wColObj.r, wColObj.g, wColObj.b);
    }
    waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(wCols, 3));
    const waterMesh = new THREE.Mesh(waterGeo, waterMaterial);
    waterMesh.receiveShadow = true;
    chunkGroup.add(waterMesh);

    const treeTypeConfigs = {
      conifer: { mat: treeBillboardMats.conifer, hRange: [14, 24], wScale: 0.45 },
      broadleaf: { mat: treeBillboardMats.broadleaf, hRange: [11, 19], wScale: 0.6 },
      poplar: { mat: treeBillboardMats.poplar, hRange: [13, 23], wScale: 0.42 },
      dry: { mat: treeBillboardMats.dry, hRange: [8, 15], wScale: 0.52 }
    };

    for (const [treeType, trees] of Object.entries(treePositions)) {
      if (trees.length === 0) continue;
      const cfg = treeTypeConfigs[treeType];
      const cardA = new THREE.InstancedMesh(treeBillboardGeo, cfg.mat, trees.length);
      const cardB = new THREE.InstancedMesh(treeBillboardGeo, cfg.mat, trees.length);
      cardA.castShadow = false;
      cardB.castShadow = false;
      cardA.receiveShadow = false;
      cardB.receiveShadow = false;

      for (let j = 0; j < trees.length; j++) {
        const tp = trees[j];
        const exactY = lod <= 1 ? getTerrainHeight(tp.x + cx * CHUNK_SIZE, tp.z + cz * CHUNK_SIZE) : tp.y;
        const heading = tp.seed * Math.PI * 2;
        const treeHeight = cfg.hRange[0] + tp.seed * (cfg.hRange[1] - cfg.hRange[0]);
        const treeWidth = treeHeight * cfg.wScale * (0.92 + tp.seed2 * 0.3);

        dummy.position.set(tp.x, exactY, tp.z);
        dummy.rotation.set(tp.lean * 0.5, heading, 0);
        dummy.scale.set(treeWidth, treeHeight, 1);
        dummy.updateMatrix();
        cardA.setMatrixAt(j, dummy.matrix);

        dummy.rotation.set(tp.lean * 0.5, heading + Math.PI * 0.5, 0);
        dummy.updateMatrix();
        cardB.setMatrixAt(j, dummy.matrix);
      }

      chunkGroup.add(cardA, cardB);
    }

    const classConfigs = {
      supertall: {
        height: [180, 380],
        width: [24, 42],
        depth: [24, 42],
        colors: [0x1b2738, 0x111111, 0x202a36, 0x27364a],
        roof: [0x2d2d2d, 0x353535],
        podium: true,
        spire: true
      },
      highrise: {
        height: [80, 190],
        width: [18, 30],
        depth: [16, 28],
        colors: [0x34495e, 0x2c3e50, 0x4a6073, 0x3b4a59],
        roof: [0x3d3d3d, 0x4a4a4a],
        podium: true,
        spire: false
      },
      office: {
        height: [35, 90],
        width: [14, 26],
        depth: [12, 24],
        colors: [0x6e7b85, 0x7a7f89, 0x5e6970, 0x8a8f97],
        roof: [0x555555, 0x636363],
        podium: false,
        spire: false
      },
      apartment: {
        height: [18, 48],
        width: [12, 20],
        depth: [10, 18],
        colors: [0xb6b1a5, 0x9f9a90, 0xc7c2b5, 0xa8a39a],
        roof: [0x6a5e50, 0x736857],
        podium: false,
        spire: false
      },
      townhouse: {
        height: [8, 16],
        width: [7, 12],
        depth: [8, 13],
        colors: [0xe0d7cc, 0xd5cabf, 0xcbc0b3, 0xede4da],
        roof: [0x6a5035, 0x5a4731],
        podium: false,
        spire: false
      },
      industrial: {
        height: [10, 24],
        width: [18, 34],
        depth: [16, 30],
        colors: [0x8b8d8f, 0x7b7d7f, 0x6d7278, 0x9a9ca0],
        roof: [0x53575e, 0x454a52],
        podium: false,
        spire: false
      }
    };

    for (const [buildingClass, entries] of Object.entries(buildingPositions)) {
      if (entries.length === 0) continue;

      const cfg = classConfigs[buildingClass];
      const bldgMesh = new THREE.InstancedMesh(baseBuildingGeo, baseBuildingMat, entries.length);
      const roofMesh = new THREE.InstancedMesh(roofCapGeo, roofCapMat, entries.length);
      const podiumMesh = cfg.podium ? new THREE.InstancedMesh(podiumGeo, podiumMat, entries.length) : null;
      const spireMesh = cfg.spire ? new THREE.InstancedMesh(spireGeo, spireMat, entries.length) : null;

      bldgMesh.castShadow = true;
      bldgMesh.receiveShadow = true;
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      if (podiumMesh) {
        podiumMesh.castShadow = true;
        podiumMesh.receiveShadow = true;
      }
      if (spireMesh) {
        spireMesh.castShadow = true;
        spireMesh.receiveShadow = true;
      }

      const baseColor = new THREE.Color();
      const roofColor = new THREE.Color();
      const podiumColor = new THREE.Color();
      for (let j = 0; j < entries.length; j++) {
        const bp = entries[j];
        const h = cfg.height[0] + bp.seed * (cfg.height[1] - cfg.height[0]);
        const w = cfg.width[0] + bp.seed2 * (cfg.width[1] - cfg.width[0]);
        const d = cfg.depth[0] + bp.seed3 * (cfg.depth[1] - cfg.depth[0]);

        dummy.position.set(bp.x, bp.y, bp.z);
        dummy.rotation.set(0, bp.angle, 0);
        dummy.scale.set(w, h, d);
        dummy.updateMatrix();
        bldgMesh.setMatrixAt(j, dummy.matrix);
        baseColor.setHex(cfg.colors[Math.floor(bp.seed * cfg.colors.length) % cfg.colors.length]);
        bldgMesh.setColorAt(j, baseColor);

        dummy.position.set(bp.x, bp.y + h, bp.z);
        dummy.scale.set(w * 1.04, 1, d * 1.04);
        dummy.updateMatrix();
        roofMesh.setMatrixAt(j, dummy.matrix);
        roofColor.setHex(cfg.roof[Math.floor(bp.seed2 * cfg.roof.length) % cfg.roof.length]);
        roofMesh.setColorAt(j, roofColor);

        if (podiumMesh) {
          const podiumH = Math.max(5, h * 0.08);
          dummy.position.set(bp.x, bp.y, bp.z);
          dummy.scale.set(w * 1.2, podiumH, d * 1.2);
          dummy.updateMatrix();
          podiumMesh.setMatrixAt(j, dummy.matrix);
          podiumColor.copy(baseColor).offsetHSL(0, 0, -0.06);
          podiumMesh.setColorAt(j, podiumColor);
        }

        if (spireMesh) {
          const spireH = 18 + bp.seed2 * 32;
          dummy.position.set(bp.x, bp.y + h, bp.z);
          dummy.scale.set(1.6, spireH, 1.6);
          dummy.updateMatrix();
          spireMesh.setMatrixAt(j, dummy.matrix);
        }
      }

      bldgMesh.instanceColor.needsUpdate = true;
      roofMesh.instanceColor.needsUpdate = true;
      chunkGroup.add(bldgMesh, roofMesh);
      if (podiumMesh) {
        podiumMesh.instanceColor.needsUpdate = true;
        chunkGroup.add(podiumMesh);
      }
      if (spireMesh) {
        chunkGroup.add(spireMesh);
      }
    }

    if (lodCfg.enableBoats && boatPositions.length > 0) {
      const hullMesh = new THREE.InstancedMesh(hullGeo, hullMat, boatPositions.length);
      const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, boatPositions.length);
      const mastMesh = new THREE.InstancedMesh(mastGeo, mastMat, boatPositions.length);
      hullMesh.castShadow = true;
      cabinMesh.castShadow = true;
      mastMesh.castShadow = true;

      for (let j = 0; j < boatPositions.length; j++) {
        let bp = boatPositions[j];
        dummy.position.set(bp.x, -10.2, bp.z);
        dummy.rotation.set(0, bp.rot, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();

        hullMesh.setMatrixAt(j, dummy.matrix);
        cabinMesh.setMatrixAt(j, dummy.matrix);
        mastMesh.setMatrixAt(j, dummy.matrix);
      }
      chunkGroup.add(hullMesh, cabinMesh, mastMesh);
    }

    scene.add(chunkGroup);
    return chunkGroup;
  }

  function updateTerrain() {
    const px = Math.floor(PHYSICS.position.x / CHUNK_SIZE);
    const pz = Math.floor(PHYSICS.position.z / CHUNK_SIZE);
    const renderDistance = 8; // 17x17 loaded chunk window (2x previous radius)
    const activeChunks = new Map();

    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        const cx = px + dx;
        const cz = pz + dz;
        const key = `${cx},${cz}`;
        const ringDistance = Math.max(Math.abs(dx), Math.abs(dz));
        const currentLod = terrainChunks.has(key) ? terrainChunks.get(key).lod : null;
        const lod = getLodForRingDistance(ringDistance, currentLod);
        activeChunks.set(key, lod);

        if (!terrainChunks.has(key)) {
          enqueueChunkBuild(cx, cz, lod, ringDistance);
        } else {
          const chunkState = terrainChunks.get(key);
          if (chunkState.lod !== lod) {
            enqueueChunkBuild(cx, cz, lod, ringDistance + 0.25);
          }
        }
      }
    }

    // Drop pending jobs that are no longer in the active window.
    for (let i = pendingChunkBuilds.length - 1; i >= 0; i--) {
      const job = pendingChunkBuilds[i];
      if (!activeChunks.has(job.key)) {
        pendingChunkKeys.delete(job.key);
        pendingChunkBuilds.splice(i, 1);
        pendingQueueDirty = true;
      }
    }

    for (const [key, chunkState] of terrainChunks.entries()) {
      if (!activeChunks.has(key)) {
        disposeChunkGroup(chunkState.group);
        terrainChunks.delete(key);
      }
    }

    const buildBudget = pendingChunkBuilds.length > 160 ? 5 : pendingChunkBuilds.length > 80 ? 3 : 2;
    processChunkBuildQueue(buildBudget);
  }

  return { waterMaterial, getTerrainHeight, updateTerrain };
}
