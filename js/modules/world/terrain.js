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

export function createTerrainSystem({ scene, Noise, PHYSICS }) {
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
      terrainRes: 112,
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
    }
  ];
  const terrainChunks = new Map();
  const pendingChunkBuilds = [];
  const pendingChunkKeys = new Set();
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    flatShading: true
  });

  // Instanced Tree Resources (multiple forest biomes)
  const treeTrunkGeo = new THREE.CylinderGeometry(0.55, 0.75, 6.8, 6);
  treeTrunkGeo.translate(0, 3.4, 0);
  const coniferCanopyGeo = new THREE.ConeGeometry(6.8, 20, 7);
  coniferCanopyGeo.translate(0, 15.5, 0);
  const coniferTopGeo = new THREE.ConeGeometry(4.3, 11, 7);
  coniferTopGeo.translate(0, 22, 0);
  const broadleafCanopyGeo = new THREE.SphereGeometry(7.2, 10, 8);
  broadleafCanopyGeo.translate(0, 14.5, 0);
  const poplarCanopyGeo = new THREE.CylinderGeometry(3.0, 4.2, 15, 8);
  poplarCanopyGeo.translate(0, 16.0, 0);
  const deadBranchGeo = new THREE.ConeGeometry(1.4, 5.5, 6);
  deadBranchGeo.translate(0, 10.0, 0);
  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.95 });
  const coniferCanopyMat = new THREE.MeshStandardMaterial({ color: 0x1c3d18, roughness: 0.9 });
  const coniferTopMat = new THREE.MeshStandardMaterial({ color: 0x2a4a20, roughness: 0.88 });
  const broadleafCanopyMat = new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 0.92 });
  const poplarCanopyMat = new THREE.MeshStandardMaterial({ color: 0x5b7f34, roughness: 0.92 });
  const deadBranchMat = new THREE.MeshStandardMaterial({ color: 0x5a4938, roughness: 0.95 });

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
      if (ringDistance <= 2) return 0;
      if (ringDistance <= 4) return 1;
      return 2;
    }
    if (currentLod === 1) {
      if (ringDistance <= 1) return 0;
      if (ringDistance <= 4) return 1;
      return 2;
    }
    if (currentLod === 2) {
      if (ringDistance <= 3) return 1;
      return 2;
    }

    if (ringDistance <= 1) return 0;
    if (ringDistance <= 3) return 1;
    return 2;
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
  }

  function processChunkBuildQueue(maxBuildsPerFrame = 2) {
    if (pendingChunkBuilds.length === 0) return;
    pendingChunkBuilds.sort((a, b) => a.priority - b.priority);

    let builds = 0;
    while (builds < maxBuildsPerFrame && pendingChunkBuilds.length > 0) {
      const job = pendingChunkBuilds.shift();
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
        colorObj.setHex(0xc2b280); // Underwater Seabed / Sand
      } else if (height < 25) {
        colorObj.setHex(0x355e3b); // Lowland / Hunter green
      } else if (height < 150) {
        colorObj.setHex(0x2a4b2a); // Dark forest green
      } else if (height < 400) {
        let rockBlend = (height - 150) / 250;
        let cGrass = new THREE.Color(0x2a4b2a);
        let cRock = new THREE.Color(0x555555);
        colorObj.lerpColors(cGrass, cRock, rockBlend);
      } else if (height < 600) {
        colorObj.setHex(0x555555); // Solid Rock
      } else {
        let snowBlend = Math.min(1.0, (height - 600) / 100);
        let cRock = new THREE.Color(0x555555);
        let cSnow = new THREE.Color(0xffffff);
        colorObj.lerpColors(cRock, cSnow, snowBlend);
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
        if (rng < forest.density * lodCfg.propDensity) {
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
        wColObj.setHex(0xffffff); // Shoreline Froth
      } else if (depth < 25) {
        let blend = (depth - 2) / 23;
        wColObj.lerpColors(new THREE.Color(0xffffff), new THREE.Color(0x0077be), Math.pow(blend, 0.6));
      } else {
        wColObj.setHex(0x003377);
      }
      wCols.push(wColObj.r, wColObj.g, wColObj.b);
    }
    waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(wCols, 3));
    const waterMesh = new THREE.Mesh(waterGeo, waterMaterial);
    waterMesh.receiveShadow = true;
    chunkGroup.add(waterMesh);

    const treeTypeConfigs = {
      conifer: {
        canopyGeo: coniferCanopyGeo,
        canopyMat: coniferCanopyMat,
        accentGeo: coniferTopGeo,
        accentMat: coniferTopMat,
        trunkScale: [0.85, 1.0, 0.85],
        canopyScale: [1.0, 1.0, 1.0]
      },
      broadleaf: {
        canopyGeo: broadleafCanopyGeo,
        canopyMat: broadleafCanopyMat,
        accentGeo: null,
        accentMat: null,
        trunkScale: [0.75, 1.1, 0.75],
        canopyScale: [1.0, 0.85, 1.0]
      },
      poplar: {
        canopyGeo: poplarCanopyGeo,
        canopyMat: poplarCanopyMat,
        accentGeo: null,
        accentMat: null,
        trunkScale: [0.7, 1.15, 0.7],
        canopyScale: [0.72, 1.08, 0.72]
      },
      dry: {
        canopyGeo: deadBranchGeo,
        canopyMat: deadBranchMat,
        accentGeo: null,
        accentMat: null,
        trunkScale: [0.6, 0.95, 0.6],
        canopyScale: [0.6, 0.8, 0.6]
      }
    };

    for (const [treeType, trees] of Object.entries(treePositions)) {
      if (trees.length === 0) continue;
      const cfg = treeTypeConfigs[treeType];

      const trunkMesh = new THREE.InstancedMesh(treeTrunkGeo, treeTrunkMat, trees.length);
      const canopyMesh = new THREE.InstancedMesh(cfg.canopyGeo, cfg.canopyMat, trees.length);
      const accentMesh = cfg.accentGeo ? new THREE.InstancedMesh(cfg.accentGeo, cfg.accentMat, trees.length) : null;

      trunkMesh.castShadow = true;
      canopyMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      canopyMesh.receiveShadow = true;
      if (accentMesh) {
        accentMesh.castShadow = true;
        accentMesh.receiveShadow = true;
      }

      for (let j = 0; j < trees.length; j++) {
        const tp = trees[j];
        const exactY = getTerrainHeight(tp.x + cx * CHUNK_SIZE, tp.z + cz * CHUNK_SIZE);
        const heading = tp.seed * Math.PI * 2;
        const scale = 0.62 + tp.seed * 0.95;

        dummy.position.set(tp.x, exactY, tp.z);
        dummy.rotation.set(tp.lean, heading, -tp.lean * 0.8);
        dummy.scale.set(scale * cfg.trunkScale[0], scale * cfg.trunkScale[1], scale * cfg.trunkScale[2]);
        dummy.updateMatrix();
        trunkMesh.setMatrixAt(j, dummy.matrix);

        dummy.scale.set(scale * cfg.canopyScale[0], scale * cfg.canopyScale[1], scale * cfg.canopyScale[2]);
        dummy.updateMatrix();
        canopyMesh.setMatrixAt(j, dummy.matrix);

        if (accentMesh) {
          const accentScale = scale * (0.85 + tp.seed2 * 0.2);
          dummy.scale.set(accentScale, accentScale, accentScale);
          dummy.updateMatrix();
          accentMesh.setMatrixAt(j, dummy.matrix);
        }
      }

      chunkGroup.add(trunkMesh, canopyMesh);
      if (accentMesh) chunkGroup.add(accentMesh);
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
    const renderDistance = 4; // 9x9 loaded chunk window
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
      }
    }

    for (const [key, chunkState] of terrainChunks.entries()) {
      if (!activeChunks.has(key)) {
        disposeChunkGroup(chunkState.group);
        terrainChunks.delete(key);
      }
    }

    processChunkBuildQueue(2);
  }

  return { waterMaterial, getTerrainHeight, updateTerrain };
}
