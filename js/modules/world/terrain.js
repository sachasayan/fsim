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
  const CHUNK_RES = 128; // Doubled resolution from 64 to 128 for smoother terrain
  const terrainChunks = new Map();
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    flatShading: true
  });

  // Instanced Mesh Resources (Trees & Buildings)
  const treeGeo = new THREE.ConeGeometry(8, 24, 5);
  treeGeo.translate(0, 12, 0); // Base at y=0
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x1e3a15, roughness: 0.9 });

  // Instanced Boats
  const hullGeo = new THREE.BoxGeometry(2.5, 1.2, 8);
  hullGeo.translate(0, 0.6, 0);
  const cabinGeo = new THREE.BoxGeometry(2.0, 1.5, 3);
  cabinGeo.translate(0, 1.9, -1); // Lift cabin above hull, push back slightly
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.6 });

  // We now use a 1x1x1 base box. We will scale and color it per-instance to create varied buildings
  const baseBuildingGeo = new THREE.BoxGeometry(1, 1, 1);
  baseBuildingGeo.translate(0, 0.5, 0); // Base at y=0
  const baseBuildingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });

  const dummy = new THREE.Object3D();

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

  function generateChunk(cx, cz) {
    const chunkGroup = new THREE.Group();
    chunkGroup.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

    const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES, CHUNK_RES);
    geometry.rotateX(-Math.PI / 2); // Lay flat

    const positions = geometry.attributes.position.array;
    const colors = [];
    const colorObj = new THREE.Color();

    const treePositions = [];
    const buildingPositions = [];
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

      // Object Placement Logic (Biomes)
      let distFromRunwayX = Math.abs(vx);
      let distFromRunwayZ = Math.abs(vz);

      if (height < -30 && Math.random() < 0.0002) {
        boatPositions.push({ x: lx, z: lz, rot: Math.random() * Math.PI * 2 });
      }

      if (distFromRunwayX < 200 && distFromRunwayZ < 2600) continue;
      if (height < -5 || height > 400) continue;

      let cityNoise = Noise.fractal(vx, vz, 4, 0.5, 0.001);
      let forestNoise = Noise.fractal(vx + 5000, vz + 5000, 4, 0.5, 0.002);

      if (cityNoise > 0.3) {
        if (cityNoise > 0.7 && Math.random() < 0.15) {
          buildingPositions.push({ x: lx, y: height, z: lz, zone: 'downtown' });
        } else if (cityNoise > 0.5 && cityNoise <= 0.7 && Math.random() < 0.15) {
          buildingPositions.push({ x: lx, y: height, z: lz, zone: 'commercial' });
          if (Math.random() < 0.5) {
            let ox = 25;
            let oz = 25;
            let exactY = getTerrainHeight(vx + ox, vz + oz);
            buildingPositions.push({ x: lx + ox, y: exactY, z: lz + oz, zone: 'commercial' });
          }
        } else if (cityNoise <= 0.5 && Math.random() < 0.2) {
          let numHouses = 2 + Math.floor(Math.random() * 3);
          for (let k = 0; k < numHouses; k++) {
            let ox = (Math.random() - 0.5) * 60;
            let oz = (Math.random() - 0.5) * 60;
            let exactY = getTerrainHeight(vx + ox, vz + oz);
            if (exactY > -5) {
              buildingPositions.push({ x: lx + ox, y: exactY, z: lz + oz, zone: 'suburb' });
            }
          }
        }
      } else if (forestNoise > 0.1) {
        if (Math.random() < 0.2) {
          treePositions.push({ x: lx + (Math.random() - 0.5) * 20, y: height, z: lz + (Math.random() - 0.5) * 20 });
        }
      }
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const terrainMesh = new THREE.Mesh(geometry, terrainMaterial);
    terrainMesh.receiveShadow = true;
    chunkGroup.add(terrainMesh);

    // --- Generate Procedural Water Chunk ---
    const waterGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES, CHUNK_RES);
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

    if (treePositions.length > 0) {
      const treeMesh = new THREE.InstancedMesh(treeGeo, treeMat, treePositions.length);
      treeMesh.castShadow = true;
      treeMesh.receiveShadow = true;
      for (let j = 0; j < treePositions.length; j++) {
        let tp = treePositions[j];
        let exactY = getTerrainHeight(tp.x + cx * CHUNK_SIZE, tp.z + cz * CHUNK_SIZE);
        dummy.position.set(tp.x, exactY, tp.z);
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        let scale = 0.6 + Math.random() * 0.8;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        treeMesh.setMatrixAt(j, dummy.matrix);
      }
      chunkGroup.add(treeMesh);
    }

    if (buildingPositions.length > 0) {
      const bldgMesh = new THREE.InstancedMesh(baseBuildingGeo, baseBuildingMat, buildingPositions.length);
      bldgMesh.castShadow = true;
      bldgMesh.receiveShadow = true;

      const instColor = new THREE.Color();
      for (let j = 0; j < buildingPositions.length; j++) {
        let bp = buildingPositions[j];
        dummy.position.set(bp.x, bp.y, bp.z);
        dummy.rotation.set(0, Math.floor(Math.random() * 4) * (Math.PI / 2), 0);

        let hScale;
        let wScale;
        if (bp.zone === 'downtown') {
          hScale = 80 + Math.random() * 200;
          wScale = 25 + Math.random() * 20;
          const colors = [0x1a2b3c, 0x111111, 0x2c3e50, 0x34495e];
          instColor.setHex(colors[Math.floor(Math.random() * colors.length)]);
        } else if (bp.zone === 'commercial') {
          hScale = 20 + Math.random() * 40;
          wScale = 15 + Math.random() * 15;
          const colors = [0x8B4513, 0x808080, 0xA9A9A9, 0x5c4033, 0x696969];
          instColor.setHex(colors[Math.floor(Math.random() * colors.length)]);
        } else {
          hScale = 6 + Math.random() * 6;
          wScale = 8 + Math.random() * 6;
          dummy.rotation.set(0, Math.random() * Math.PI, 0);
          const colors = [0xffffff, 0xf5f5dc, 0xd3d3d3, 0xfaebd7, 0xe0e0e0, 0xdeb887];
          instColor.setHex(colors[Math.floor(Math.random() * colors.length)]);
        }

        dummy.scale.set(wScale, hScale, wScale);
        dummy.updateMatrix();
        bldgMesh.setMatrixAt(j, dummy.matrix);
        bldgMesh.setColorAt(j, instColor);
      }

      bldgMesh.instanceColor.needsUpdate = true;
      chunkGroup.add(bldgMesh);
    }

    if (boatPositions.length > 0) {
      const hullMesh = new THREE.InstancedMesh(hullGeo, hullMat, boatPositions.length);
      const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, boatPositions.length);
      hullMesh.castShadow = true;
      cabinMesh.castShadow = true;

      for (let j = 0; j < boatPositions.length; j++) {
        let bp = boatPositions[j];
        dummy.position.set(bp.x, -10.2, bp.z);
        dummy.rotation.set(0, bp.rot, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();

        hullMesh.setMatrixAt(j, dummy.matrix);
        cabinMesh.setMatrixAt(j, dummy.matrix);
      }
      chunkGroup.add(hullMesh, cabinMesh);
    }

    scene.add(chunkGroup);
    return chunkGroup;
  }

  function updateTerrain() {
    const px = Math.floor(PHYSICS.position.x / CHUNK_SIZE);
    const pz = Math.floor(PHYSICS.position.z / CHUNK_SIZE);
    const renderDistance = 2;
    const activeChunks = new Set();

    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        const key = `${px + dx},${pz + dz}`;
        activeChunks.add(key);
        if (!terrainChunks.has(key)) {
          terrainChunks.set(key, generateChunk(px + dx, pz + dz));
        }
      }
    }

    for (const [key, chunkGroup] of terrainChunks.entries()) {
      if (!activeChunks.has(key)) {
        scene.remove(chunkGroup);
        chunkGroup.traverse((child) => {
          if (child.isMesh || child.isInstancedMesh) {
            child.geometry.dispose();
          }
        });
        terrainChunks.delete(key);
      }
    }
  }

  return { waterMaterial, getTerrainHeight, updateTerrain };
}
