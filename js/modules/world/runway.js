import * as THREE from 'three';

export function createRunwaySystem({ scene, renderer, getTerrainHeight }) {
  const RUNWAY_LIGHT_SIZE_SCALE = 0.5;
  const RUNWAY_LIGHT_GLOW_SCALE = 0.38;
  const RUNWAY_LIGHT_PAPI_SCALE = 0.32;
  const RUNWAY_LIGHT_STROBE_SCALE = 0.42;

  // High-Res Procedural Runway Mesh
  function createRunwayMesh() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 4096;
    const ctx = canvas.getContext('2d');

    // Asphalt base (lifted slightly so runway doesn't crush to black at low sun angles)
    ctx.fillStyle = '#30343b';
    ctx.fillRect(0, 0, 1024, 4096);

    // Asphalt Noise — 50k iterations gives near-identical results to 200k at a quarter of the cost
    for (let i = 0; i < 50000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#434a53' : '#2a3038';
      ctx.fillRect(Math.random() * 1024, Math.random() * 4096, 2, 2);
    }

    // Longitudinal sealing strips and patchwork
    for (let y = 0; y < 4096; y += 180) {
      ctx.fillStyle = 'rgba(42,44,48,0.28)';
      ctx.fillRect(430 + Math.sin(y * 0.003) * 8, y, 6, 130);
      ctx.fillRect(586 + Math.cos(y * 0.004) * 9, y + 20, 5, 110);
      if (Math.random() > 0.5) {
        ctx.fillStyle = 'rgba(62,64,69,0.22)';
        ctx.fillRect(200 + Math.random() * 620, y + Math.random() * 40, 40 + Math.random() * 80, 10 + Math.random() * 28);
      }
    }

    ctx.fillStyle = '#ffffff';
    // Centerline
    for (let y = 0; y < 4096; y += 128) {
      ctx.fillRect(504, y, 16, 64);
    }
    // Edge lines
    ctx.fillRect(100, 0, 16, 4096);
    ctx.fillRect(908, 0, 16, 4096);

    // Thresholds (Piano keys)
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(150 + i * 40, 50, 20, 150);
      ctx.fillRect(570 + i * 40, 50, 20, 150);
      ctx.fillRect(150 + i * 40, 3896, 20, 150);
      ctx.fillRect(570 + i * 40, 3896, 20, 150);
    }

    // Runway aiming point markers
    ctx.fillRect(220, 700, 90, 500);
    ctx.fillRect(715, 700, 90, 500);
    ctx.fillRect(220, 4096 - 1200, 90, 500);
    ctx.fillRect(715, 4096 - 1200, 90, 500);

    // Touchdown zones
    for (let y = 500; y < 1500; y += 250) {
      ctx.fillRect(250, y, 20, 100);
      ctx.fillRect(300, y, 20, 100);
      ctx.fillRect(710, y, 20, 100);
      ctx.fillRect(760, y, 20, 100);
      ctx.fillRect(250, 4096 - y - 100, 20, 100);
      ctx.fillRect(300, 4096 - y - 100, 20, 100);
      ctx.fillRect(710, 4096 - y - 100, 20, 100);
      ctx.fillRect(760, 4096 - y - 100, 20, 100);
    }

    // Realistic Tire Skid Marks (Heavy in touchdown zones)
    for (let i = 0; i < 800; i++) {
      // Bias towards the ends of the runway
      let isNorth = Math.random() > 0.5;
      let yBase = isNorth ? 400 : 2500;
      let yOffset = yBase + Math.random() * 1200;

      let xCenter = 512 + (Math.random() - 0.5) * 40; // Clustered near centerline
      let markW = 2 + Math.random() * 4;
      let markH = 40 + Math.random() * 200;

      ctx.fillStyle = `rgba(10, 10, 10, ${0.1 + Math.random() * 0.4})`;
      // Left main gear
      ctx.fillRect(xCenter - 25, yOffset, markW, markH);
      // Right main gear
      ctx.fillRect(xCenter + 25, yOffset, markW, markH);
      // Nose gear (fainter and fewer)
      if (Math.random() > 0.5) {
        ctx.fillStyle = `rgba(10, 10, 10, ${0.05 + Math.random() * 0.2})`;
        ctx.fillRect(xCenter, yOffset + 50, markW * 0.5, markH * 0.8);
      }
    }

    // Derive roughness at half resolution (512×2048) to reduce startup cost.
    function createRoughnessMapFromAlbedo(sourceCanvas) {
      const outW = sourceCanvas.width / 2;
      const outH = sourceCanvas.height / 2;
      const roughCanvas = document.createElement('canvas');
      roughCanvas.width = outW;
      roughCanvas.height = outH;
      const roughCtx = roughCanvas.getContext('2d');
      // Downsample source into a half-size offscreen canvas first
      const downCanvas = document.createElement('canvas');
      downCanvas.width = outW;
      downCanvas.height = outH;
      const downCtx = downCanvas.getContext('2d');
      downCtx.drawImage(sourceCanvas, 0, 0, outW, outH);
      const src = downCtx.getImageData(0, 0, outW, outH);
      const out = roughCtx.createImageData(outW, outH);

      for (let i = 0; i < src.data.length; i += 4) {
        const r = src.data[i];
        const g = src.data[i + 1];
        const b = src.data[i + 2];
        const x = (i / 4) % outW;
        const y = Math.floor((i / 4) / outW);
        const luma = (r + g + b) / 3;

        // Asphalt is rough; painted markings are smoother; skids become slightly glossier.
        let rough = 188;
        if (luma > 205) rough = 88;
        else if (luma < 22) rough = 146;

        // Fine variation and longitudinal runway wear breakup.
        rough += (Math.sin(x * 0.018 + y * 0.009) + Math.sin(x * 0.031 - y * 0.014)) * 7;
        rough += (Math.random() - 0.5) * 10;
        rough = Math.max(38, Math.min(232, rough));

        out.data[i] = rough;
        out.data[i + 1] = rough;
        out.data[i + 2] = rough;
        out.data[i + 3] = 255;
      }

      roughCtx.putImageData(out, 0, 0);
      return roughCanvas;
    }

    function createRunwayBumpMap(width, height) {
      const bumpCanvas = document.createElement('canvas');
      bumpCanvas.width = width;
      bumpCanvas.height = height;
      const bumpCtx = bumpCanvas.getContext('2d');
      const bumpData = bumpCtx.createImageData(width, height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          let h = 128;
          h += Math.sin(x * 0.06 + y * 0.015) * 6;
          h += Math.sin(x * 0.11 - y * 0.02) * 4;
          h += (Math.random() - 0.5) * 8;
          h = Math.max(90, Math.min(170, h));
          bumpData.data[i] = h;
          bumpData.data[i + 1] = h;
          bumpData.data[i + 2] = h;
          bumpData.data[i + 3] = 255;
        }
      }

      bumpCtx.putImageData(bumpData, 0, 0);
      return bumpCanvas;
    }

    const roughnessCanvas = createRoughnessMapFromAlbedo(canvas);
    const bumpCanvas = createRunwayBumpMap(512, 2048);

    const tex = new THREE.CanvasTexture(canvas);
    const roughnessTex = new THREE.CanvasTexture(roughnessCanvas);
    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.anisotropy = anisotropy;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    roughnessTex.anisotropy = anisotropy;
    roughnessTex.wrapS = THREE.ClampToEdgeWrapping;
    roughnessTex.wrapT = THREE.RepeatWrapping;
    bumpTex.anisotropy = anisotropy;
    bumpTex.wrapS = THREE.ClampToEdgeWrapping;
    bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(2, 2);
    tex.colorSpace = THREE.SRGBColorSpace;

    const runwayGeo = new THREE.PlaneGeometry(100, 4000);
    const runwayMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughnessMap: roughnessTex,
      roughness: 0.92,
      metalness: 0.0,
      bumpMap: bumpTex,
      bumpScale: 0.16,
      envMapIntensity: 0.32
    });
    const runwayMesh = new THREE.Mesh(runwayGeo, runwayMat);
    runwayMesh.rotation.x = -Math.PI / 2;
    runwayMesh.position.set(0, 0.2, 0); // Slightly above terrain to prevent z-fighting
    runwayMesh.receiveShadow = true;
    scene.add(runwayMesh);
  }
  createRunwayMesh();

  // SCALED UP ALL EMISSIVE INTENSITIES SO THEY PIERCE THE NEW BLOOM THRESHOLD
  const PAPI = {
    lights: [],
    lights36: [],
    lights18: [],
    matRed: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0000, emissiveIntensity: 30 * RUNWAY_LIGHT_PAPI_SCALE }),
    matWhite: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 30 * RUNWAY_LIGHT_PAPI_SCALE }),
    matOff: new THREE.MeshBasicMaterial({ color: 0x111111 })
  };

  // Global arrays for ALSF-2 Animation
  const alsStrobes = [];
  const strobeMatOn = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 60 * RUNWAY_LIGHT_STROBE_SCALE });
  const strobeMatOff = new THREE.MeshBasicMaterial({ color: 0x111111 });

  // Runway Lighting
  function createRunwayLights() {
    const lightGroup = new THREE.Group();
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffddaa, emissiveIntensity: 15 * RUNWAY_LIGHT_GLOW_SCALE });
    const centerMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 15 * RUNWAY_LIGHT_GLOW_SCALE });
    const endMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0000, emissiveIntensity: 15 * RUNWAY_LIGHT_GLOW_SCALE });
    const lightGeo = new THREE.SphereGeometry(0.5 * RUNWAY_LIGHT_SIZE_SCALE, 4, 4);
    const baseGeo = new THREE.CylinderGeometry(0.24 * RUNWAY_LIGHT_SIZE_SCALE, 0.24 * RUNWAY_LIGHT_SIZE_SCALE, 0.28 * RUNWAY_LIGHT_SIZE_SCALE, 8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x252525, roughness: 0.9 });

    for (let z = -2000; z <= 2000; z += 50) {
      // Edge lights
      let leftEdge = new THREE.Mesh(lightGeo, Math.abs(z) > 1950 ? endMaterial : edgeMaterial);
      leftEdge.position.set(-25, 0.5 * RUNWAY_LIGHT_SIZE_SCALE, z);
      let rightEdge = new THREE.Mesh(lightGeo, Math.abs(z) > 1950 ? endMaterial : edgeMaterial);
      rightEdge.position.set(25, 0.5 * RUNWAY_LIGHT_SIZE_SCALE, z);
      lightGroup.add(leftEdge, rightEdge);
      const leftBase = new THREE.Mesh(baseGeo, baseMat);
      leftBase.position.set(-25, 0.14 * RUNWAY_LIGHT_SIZE_SCALE, z);
      const rightBase = new THREE.Mesh(baseGeo, baseMat);
      rightBase.position.set(25, 0.14 * RUNWAY_LIGHT_SIZE_SCALE, z);
      lightGroup.add(leftBase, rightBase);

      // Centerline lights
      if (z % 100 === 0) {
        let centerLight = new THREE.Mesh(lightGeo, centerMaterial);
        centerLight.position.set(0, 0.1 * RUNWAY_LIGHT_SIZE_SCALE, z);
        lightGroup.add(centerLight);
        const centerBase = new THREE.Mesh(baseGeo, baseMat);
        centerBase.position.set(0, -0.16 * RUNWAY_LIGHT_SIZE_SCALE, z);
        lightGroup.add(centerBase);
      }
    }

    // --- PAPI System (Precision Approach Path Indicator) ---
    // RWY 36 (touchdown Z=1000), left side for northbound approach.
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.5 * RUNWAY_LIGHT_SIZE_SCALE, 8, 8), PAPI.matWhite);
      mesh.position.set(-45 - i * 12, 1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1000);
      mesh.scale.z = 0.2;
      lightGroup.add(mesh);
      const papiBase = new THREE.Mesh(
        new THREE.BoxGeometry(2.6 * RUNWAY_LIGHT_SIZE_SCALE, 0.4 * RUNWAY_LIGHT_SIZE_SCALE, 1.2 * RUNWAY_LIGHT_SIZE_SCALE),
        baseMat
      );
      papiBase.position.set(-45 - i * 12, 0.3 * RUNWAY_LIGHT_SIZE_SCALE, 1000);
      lightGroup.add(papiBase);
      PAPI.lights36.push(mesh);
      PAPI.lights.push(mesh);
    }
    // RWY 18 (touchdown Z=-1000), left side for southbound approach.
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.5 * RUNWAY_LIGHT_SIZE_SCALE, 8, 8), PAPI.matWhite);
      mesh.position.set(45 + i * 12, 1.5 * RUNWAY_LIGHT_SIZE_SCALE, -1000);
      mesh.scale.z = 0.2;
      lightGroup.add(mesh);
      const papiBase = new THREE.Mesh(
        new THREE.BoxGeometry(2.6 * RUNWAY_LIGHT_SIZE_SCALE, 0.4 * RUNWAY_LIGHT_SIZE_SCALE, 1.2 * RUNWAY_LIGHT_SIZE_SCALE),
        baseMat
      );
      papiBase.position.set(45 + i * 12, 0.3 * RUNWAY_LIGHT_SIZE_SCALE, -1000);
      lightGroup.add(papiBase);
      PAPI.lights18.push(mesh);
      PAPI.lights.push(mesh);
    }

    // --- ALSF-2 Approach Lighting System ("The Rabbit") ---
    const alsWhiteMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffee, emissiveIntensity: 20 * RUNWAY_LIGHT_GLOW_SCALE });
    const alsRedMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0000, emissiveIntensity: 20 * RUNWAY_LIGHT_GLOW_SCALE });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });

    function buildALS(thresholdZ, direction) {
      for (let dist = 30; dist <= 900; dist += 30) {
        let z = thresholdZ + dist * direction;
        let ty = getTerrainHeight(0, z);
        let rowY = ty + 1.5; // Lights elevated 1.5m above local terrain

        // Add vertical pole structure connecting to the ground
        if (rowY - ty > 0.1) {
          let pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, rowY - ty), poleMat);
          pole.position.set(0, ty + (rowY - ty) / 2, z);
          lightGroup.add(pole);
        }

        // Centerline white bar (5 lights)
        for (let x = -6; x <= 6; x += 3) {
          let mesh = new THREE.Mesh(lightGeo, alsWhiteMat);
          mesh.position.set(x, rowY, z);
          mesh.scale.set(1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE);
          lightGroup.add(mesh);
        }

        // 1000ft Crossbar
        if (Math.abs(dist - 300) <= 15) {
          for (let x = -24; x <= 24; x += 3) {
            if (Math.abs(x) > 6) {
              let mesh = new THREE.Mesh(lightGeo, alsWhiteMat);
              mesh.position.set(x, rowY, z);
              mesh.scale.set(1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE);
              lightGroup.add(mesh);
            }
          }
        }

        // Red side row bars (Inner 300m)
        if (dist <= 300) {
          for (let x of [-12, -9, 9, 12]) {
            let redL = new THREE.Mesh(lightGeo, alsRedMat);
            redL.position.set(x, rowY, z);
            redL.scale.set(1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE);
            lightGroup.add(redL);
          }
        }

        // Sequenced Flashing Lights "The Rabbit" (Outer 600m)
        if (dist > 300) {
          let strobe = new THREE.Mesh(lightGeo, strobeMatOff);
          strobe.position.set(0, rowY + 0.5 * RUNWAY_LIGHT_SIZE_SCALE, z);
          strobe.scale.set(3 * RUNWAY_LIGHT_SIZE_SCALE, 3 * RUNWAY_LIGHT_SIZE_SCALE, 3 * RUNWAY_LIGHT_SIZE_SCALE); // Make the flash very large
          lightGroup.add(strobe);
          alsStrobes.push({ mesh: strobe, dist: dist, dir: direction });
        }
      }
    }
    buildALS(1950, 1);   // Approach from the South
    buildALS(-1950, -1); // Approach from the North

    scene.add(lightGroup);
  }
  createRunwayLights();

  return { PAPI, alsStrobes, strobeMatOn, strobeMatOff };
}
