import * as THREE from 'three';
import { AIRPORT_CONFIG } from './config.js';

export function createRunwaySystem({ scene, renderer, getTerrainHeight }) {
  const RUNWAY_LIGHT_SIZE_SCALE = 0.5;
  const RUNWAY_LIGHT_GLOW_SCALE = 0.28;
  const RUNWAY_LIGHT_STROBE_SCALE = 0.32;

  // High-Res Procedural Runway Mesh
  function createRunwayMesh() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 4096;
    const ctx = canvas.getContext('2d');

    // Asphalt base (lifted slightly so runway doesn't crush to black at low sun angles)
    ctx.fillStyle = '#30343b';
    ctx.fillRect(0, 0, 1024, 4096);

    // Asphalt Noise — 15k iterations for better surface detail at low altitudes
    for (let i = 0; i < 15000; i++) {
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

    // Runway Numbers
    ctx.font = 'bold 300px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    // North end (pointing South: 18)
    ctx.save();
    ctx.translate(512, 450);
    ctx.rotate(Math.PI);
    ctx.fillText('18', 0, 0);
    ctx.restore();
    // South end (pointing North: 36)
    ctx.fillText('36', 512, 4096 - 450);

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

    function createRunwayNormalMap(width, height) {
      const normalCanvas = document.createElement('canvas');
      normalCanvas.width = width;
      normalCanvas.height = height;
      const normalCtx = normalCanvas.getContext('2d');
      const normalData = normalCtx.createImageData(width, height);

      // Temporary array to store heights before calculating normals
      const heights = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let h = 0.5; // normalized 0-1
          h += Math.sin(x * 0.06 + y * 0.015) * 0.02;
          h += Math.sin(x * 0.11 - y * 0.02) * 0.015;
          h += (Math.random() - 0.5) * 0.03;
          heights[y * width + x] = h;
        }
      }

      // Calculate normals from height differences
      const scale = 2.0; // Normal strength
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Wrap around for seamless tiling
          const xLeft = x === 0 ? width - 1 : x - 1;
          const xRight = x === width - 1 ? 0 : x + 1;
          const yUp = y === 0 ? height - 1 : y - 1;
          const yDown = y === height - 1 ? 0 : y + 1;

          const hL = heights[y * width + xLeft];
          const hR = heights[y * width + xRight];
          const hU = heights[yUp * width + x];
          const hD = heights[yDown * width + x];

          // Compute Sobel or simple differences
          const dx = (hR - hL) * scale;
          const dy = (hD - hU) * scale;
          const dz = 1.0;

          // Normalize the vector
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const nx = dx / len;
          const ny = dy / len;
          const nz = dz / len;

          // Map [-1, 1] to [0, 255]
          const i = (y * width + x) * 4;
          normalData.data[i] = Math.floor((nx * 0.5 + 0.5) * 255);     // R (X)
          normalData.data[i + 1] = Math.floor((ny * 0.5 + 0.5) * 255); // G (Y)
          normalData.data[i + 2] = Math.floor((nz * 0.5 + 0.5) * 255); // B (Z)
          normalData.data[i + 3] = 255;                                // A
        }
      }

      normalCtx.putImageData(normalData, 0, 0);
      return normalCanvas;
    }

    const roughnessCanvas = createRoughnessMapFromAlbedo(canvas);
    const normalCanvas = createRunwayNormalMap(256, 1024);

    const tex = new THREE.CanvasTexture(canvas);
    const roughnessTex = new THREE.CanvasTexture(roughnessCanvas);
    const normalTex = new THREE.CanvasTexture(normalCanvas);
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.anisotropy = anisotropy;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    roughnessTex.anisotropy = Math.min(2, anisotropy);
    roughnessTex.wrapS = THREE.ClampToEdgeWrapping;
    roughnessTex.wrapT = THREE.RepeatWrapping;
    normalTex.anisotropy = Math.min(2, anisotropy);
    normalTex.wrapS = THREE.RepeatWrapping;
    normalTex.wrapT = THREE.RepeatWrapping;
    normalTex.repeat.set(2, 2);
    tex.colorSpace = THREE.SRGBColorSpace;

    const runwayGroup = new THREE.Group();
    const NUM_SEGMENTS = 10;
    const segmentLength = 4000 / NUM_SEGMENTS;
    const runwayMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughnessMap: roughnessTex,
      roughness: 0.92,
      metalness: 0.0,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(0.5, 0.5),
      envMapIntensity: 0.32
    });

    for (let i = 0; i < NUM_SEGMENTS; i++) {
      const segGeo = new THREE.PlaneGeometry(100, segmentLength);

      // Update UVs to map mapping to the giant runway texture.
      // Plane rotates -PI/2 on x, meaning its top (+y, v=1) points to -z,
      // and its bottom (-y, v=0) points to +z. 
      // i=0 is from z=-2000 to z=-1600.
      const uv = segGeo.attributes.uv;
      const vTop = 1.0 - (i / NUM_SEGMENTS);
      const vBottom = 1.0 - ((i + 1) / NUM_SEGMENTS);

      for (let j = 0; j < uv.count; j++) {
        const currentV = uv.getY(j);
        const newV = currentV > 0.5 ? vTop : vBottom;
        uv.setY(j, newV);
      }

      const mesh = new THREE.Mesh(segGeo, runwayMat);
      mesh.rotation.x = -Math.PI / 2;
      const zOffset = -2000 + (segmentLength / 2) + i * segmentLength;
      mesh.position.set(0, 0.2, zOffset);
      mesh.receiveShadow = true;
      runwayGroup.add(mesh);
    }
    scene.add(runwayGroup);
    return { runwayGroup, runwayMat };
  }
  const { runwayGroup, runwayMat } = createRunwayMesh();

  // Global arrays for ALSF-2 Animation
  const alsStrobes = []; // Now stores { mesh, index, dist, dir }
  const strobeColorOn = new THREE.Color(0xffffff);
  const strobeColorOff = new THREE.Color(0x111111);

  function createInstancedLightMaterial(baseEmissive, intensity) {
    const mat = new THREE.MeshBasicMaterial({
      color: baseEmissive, // Basic material uses 'color' for its brightness, not 'emissive'. We manually boost it in the shader.
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uIntensity = { value: intensity };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vInstanceColor;
         varying float vDist;`
      ).replace(
        '#include <color_vertex>',
        `#include <color_vertex>
         #ifdef USE_INSTANCING_COLOR
           vInstanceColor = instanceColor;
         #else
           vInstanceColor = vec3(1.0);
         #endif`
      ).replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vDist = - mvPosition.z;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uIntensity;
         varying vec3 vInstanceColor;
         varying float vDist;`
      ).replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float lodFade = smoothstep(16000.0, 10000.0, vDist);
         vec4 diffuseColor = vec4( diffuse * vInstanceColor * uIntensity * lodFade, opacity );`
      );
    };
    return mat;
  }

  // Runway Lighting
  function createRunwayLights() {
    const lightGroup = new THREE.Group();
    const dummy = new THREE.Object3D();

    // Materials
    const centerMat = createInstancedLightMaterial(0xffffff, 30 * RUNWAY_LIGHT_GLOW_SCALE);
    const alsWhiteMat = createInstancedLightMaterial(0xffffee, 50 * RUNWAY_LIGHT_GLOW_SCALE);
    const strobeMat = createInstancedLightMaterial(0xffffff, 180 * RUNWAY_LIGHT_STROBE_SCALE);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x252525, roughness: 0.9 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });

    // Geometries
    const lightGeo = new THREE.SphereGeometry(0.5 * RUNWAY_LIGHT_SIZE_SCALE, 4, 4);
    const baseGeo = new THREE.CylinderGeometry(0.24 * RUNWAY_LIGHT_SIZE_SCALE, 0.24 * RUNWAY_LIGHT_SIZE_SCALE, 0.28 * RUNWAY_LIGHT_SIZE_SCALE, 8);
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, 1); // Height scaled per instance

    // counts for instancing
    const centerCount = Math.floor(4000 / 100) + 1;
    const centerMesh = new THREE.InstancedMesh(lightGeo, centerMat, centerCount);
    const baseMesh = new THREE.InstancedMesh(baseGeo, baseMat, centerCount);

    let centerIdx = 0, baseIdx = 0;

    // Runway Centerline and Threshold Lights
    for (let z = -2000; z <= 2000; z += 100) {
      // Centerline
      dummy.position.set(0, 0.1 * RUNWAY_LIGHT_SIZE_SCALE, z);
      dummy.updateMatrix();
      centerMesh.setMatrixAt(centerIdx++, dummy.matrix);

      dummy.position.set(0, -0.16 * RUNWAY_LIGHT_SIZE_SCALE, z);
      dummy.updateMatrix();
      baseMesh.setMatrixAt(baseIdx++, dummy.matrix);
    }

    lightGroup.add(centerMesh, baseMesh);

    // ALS
    const alsWhiteMesh = new THREE.InstancedMesh(lightGeo, alsWhiteMat, 400); // Guessed max
    const strobeMesh = new THREE.InstancedMesh(lightGeo, strobeMat, 40);
    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, 100);

    let awIdx = 0, asIdx = 0, apIdx = 0;

    function buildALS(thresholdZ, direction) {
      for (let dist = 30; dist <= 900; dist += 30) {
        let z = thresholdZ + dist * direction;
        let ty = getTerrainHeight(0, z);
        let rowY = ty + 1.5;

        // Pole
        if (rowY - ty > 0.1) {
          const h = rowY - ty;
          dummy.position.set(0, ty + h / 2, z);
          dummy.scale.set(1, h, 1);
          dummy.updateMatrix();
          poleMesh.setMatrixAt(apIdx++, dummy.matrix);
        }

        // Center white bars
        for (let x = -6; x <= 6; x += 3) {
          dummy.position.set(x, rowY, z);
          dummy.scale.set(1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE);
          dummy.updateMatrix();
          alsWhiteMesh.setMatrixAt(awIdx++, dummy.matrix);
        }

        // Crossbar
        if (Math.abs(dist - 300) <= 15) {
          for (let x = -24; x <= 24; x += 3) {
            if (Math.abs(x) > 6) {
              dummy.position.set(x, rowY, z);
              dummy.scale.set(1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE);
              dummy.updateMatrix();
              alsWhiteMesh.setMatrixAt(awIdx++, dummy.matrix);
            }
          }
        }

        // Rabbit Strobes
        if (dist > 300) {
          dummy.position.set(0, rowY + 0.5 * RUNWAY_LIGHT_SIZE_SCALE, z);
          dummy.scale.set(3 * RUNWAY_LIGHT_SIZE_SCALE, 3 * RUNWAY_LIGHT_SIZE_SCALE, 3 * RUNWAY_LIGHT_SIZE_SCALE);
          dummy.updateMatrix();
          strobeMesh.setMatrixAt(asIdx, dummy.matrix);
          strobeMesh.setColorAt(asIdx, strobeColorOff);
          alsStrobes.push({ mesh: strobeMesh, index: asIdx++, dist: dist, dir: direction });
        }
      }
    }

    buildALS(1950, 1);
    buildALS(-1950, -1);

    alsWhiteMesh.count = awIdx;
    strobeMesh.count = asIdx;
    poleMesh.count = apIdx;

    lightGroup.add(alsWhiteMesh, strobeMesh, poleMesh);
    scene.add(lightGroup);
    return lightGroup;
  }
  const lightGroup = createRunwayLights();

  let currentLOD = -1;
  function updateLOD(cameraPos, dist) {
    let newLOD = 0;
    if (dist > AIRPORT_CONFIG.LOD.CULL) newLOD = 2; // Cull lights completely
    else if (dist > AIRPORT_CONFIG.LOD.LOW) newLOD = 1; // Simplify
    else newLOD = 0; // High detail

    if (newLOD === currentLOD) return;
    currentLOD = newLOD;

    if (newLOD === 2) {
      lightGroup.visible = false;
    } else {
      lightGroup.visible = true;
      if (newLOD === 1) {
        // We could swap runwayMat to a simpler one here if needed
        // but for now light culling is the biggest win.
      }
    }
  }

  return { alsStrobes, strobeColorOn, strobeColorOff, updateLOD, position: new THREE.Vector3(0, 0, 0) };
}
