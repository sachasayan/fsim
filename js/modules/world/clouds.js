import * as THREE from 'three';
import { CLOUD_NOISE } from './cloudNoise.js';

export function createCloudSystem({ scene }) {
  const voxelSize = 220;
  const worldHalfExtent = 22000;
  const gridStep = 220;
  const layersMax = 6;
  // Use one large tile to avoid transparent per-tile sort boundaries ("vertical panes").
  const tileSize = worldHalfExtent * 4;

  // Replace spheres with quads. 1x1 base size, scaled per-instance.
  const voxelGeo = new THREE.PlaneGeometry(1, 1);
  const voxelMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.24,
    roughness: 0.88,
    metalness: 0.0,
    emissive: 0xffffff,
    emissiveIntensity: 0.18
  });
  voxelMat.alphaTest = 0.05;
  voxelMat.depthWrite = false;
  voxelMat.premultipliedAlpha = false; // Changed to false for better standard alpha blending with alphaTest

  const cloudTuning = {
    nearFadeStart: 13000.0,
    nearFadeEnd: 18000.0,
    minLight: 0.5,
    farFadeStart: 9000.0,
    farFadeEnd: 14500.0,
    farOpacityScale: 0.7
  };
  const sharedCloudUniforms = {
    uCloudCameraPos: { value: new THREE.Vector3() },
    uNearFadeStart: { value: cloudTuning.nearFadeStart },
    uNearFadeEnd: { value: cloudTuning.nearFadeEnd },
    uCloudMinLight: { value: cloudTuning.minLight },
    uCloudSunDir: { value: new THREE.Vector3(0.25, 0.85, 0.45).normalize() },
    uCloudPhaseStrength: { value: 0.25 }
  };

  voxelMat.onBeforeCompile = (shader) => {
    shader.uniforms.uCloudCameraPos = sharedCloudUniforms.uCloudCameraPos;
    shader.uniforms.uNearFadeStart = sharedCloudUniforms.uNearFadeStart;
    shader.uniforms.uNearFadeEnd = sharedCloudUniforms.uNearFadeEnd;
    shader.uniforms.uCloudMinLight = sharedCloudUniforms.uCloudMinLight;
    shader.uniforms.uCloudSunDir = sharedCloudUniforms.uCloudSunDir;
    shader.uniforms.uCloudPhaseStrength = sharedCloudUniforms.uCloudPhaseStrength;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vCloudWorldPos;
      varying vec2 vCloudUv;`
    ).replace(
      '#include <worldpos_vertex>',
      `
      vCloudUv = uv;
      
      // Correct Instance World Mapping - Name it worldPosition for compatibility with other Three.js chunks
      #ifdef USE_INSTANCING
        vec4 worldPosition = modelMatrix * (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0));
      #else
        vec4 worldPosition = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      #endif
      vCloudWorldPos = worldPosition.xyz;
      
      // Spherical Billboarding: Force the instance to face the camera in View Space
      mvPosition = viewMatrix * worldPosition;
      
      // Extract instance scale
      #ifdef USE_INSTANCING
        vec2 instanceScale = vec2(
          length(vec3(instanceMatrix[0].xyz)), 
          length(vec3(instanceMatrix[1].xyz))
        );
      #else
        vec2 instanceScale = vec2(1.0);
      #endif
      
      // Expand the quad in view-space xy
      mvPosition.xy += position.xy * instanceScale;
      
      gl_Position = projectionMatrix * mvPosition;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vCloudWorldPos;
      varying vec2 vCloudUv;
      uniform vec3 uCloudCameraPos;
      uniform float uNearFadeStart;
      uniform float uNearFadeEnd;
      uniform float uCloudMinLight;
      uniform vec3 uCloudSunDir;
      uniform float uCloudPhaseStrength;`
    ).replace(
      '#include <alphatest_fragment>',
      `#include <alphatest_fragment>
      float cloudDist = distance(vCloudWorldPos.xz, uCloudCameraPos.xz);
      float radialMask = 1.0 - smoothstep(0.35, 0.5, length(vCloudUv - 0.5));
      float nearFade = 1.0 - smoothstep(uNearFadeStart, uNearFadeEnd, cloudDist);
      float edgeNoise = 0.5 + 0.5 * sin(vCloudWorldPos.x * 0.016 + vCloudWorldPos.z * 0.009 + vCloudWorldPos.y * 0.011);
      float jitter = fract(sin(dot(vCloudWorldPos.xz, vec2(0.0143, 0.0101))) * 43758.5453);
      edgeNoise = mix(0.84, 1.06, edgeNoise) * mix(0.96, 1.04, jitter);
      diffuseColor.a = clamp(diffuseColor.a * nearFade * edgeNoise * radialMask, 0.0, 1.0);`
    ).replace(
      'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
      vec3 viewDir = normalize(uCloudCameraPos - vCloudWorldPos);
      float phase = pow(max(dot(viewDir, normalize(uCloudSunDir)), 0.0), 5.0) * uCloudPhaseStrength;
      float topBoost = smoothstep(1200.0, 5400.0, vCloudWorldPos.y) * 0.12;
      outgoingLight += diffuseColor.rgb * (phase * 0.35 + topBoost);
      outgoingLight = max(outgoingLight, diffuseColor.rgb * uCloudMinLight);`
    );
  };

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
      const nLarge = CLOUD_NOISE.fbm2D(x * 0.00018, z * 0.00018, 4, 2.0, 0.5, 11);
      const nDetail = CLOUD_NOISE.fbm2D(x * 0.00052, z * 0.00052, 3, 2.1, 0.55, 29);
      const density = nLarge * 0.78 + nDetail * 0.22;
      if (density < 0.58) continue;

      const baseY = 900 + nLarge * 3200;
      const columnLayers = 1 + Math.floor((density - 0.6) / 0.4 * layersMax);
      const cappedLayers = Math.min(layersMax, Math.max(1, columnLayers));
      const spread = 1.0 + CLOUD_NOISE.hash2D(x / gridStep, z / gridStep, 3) * 1.0;

      for (let l = 0; l < cappedLayers; l++) {
        const jitterX = (CLOUD_NOISE.hash2D(x + l, z - l, 41) - 0.5) * gridStep * 0.65;
        const jitterZ = (CLOUD_NOISE.hash2D(x - l, z + l, 53) - 0.5) * gridStep * 0.65;
        const jitterY = (CLOUD_NOISE.hash2D(x + l * 3, z + l * 5, 67) - 0.5) * 55;
        const wx = x + jitterX;
        const wz = z + jitterZ;
        const entry = getTileEntry(wx, wz);

        entry.instances.push({
          x: wx - entry.ox,
          y: baseY + l * voxelSize * 0.3 + jitterY,
          z: wz - entry.oz,
          s: spread * (0.86 + l * 0.08)
        });

        const shade = 0.97 + (density - 0.58) * 0.1 + l * 0.01;
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
      dummy.scale.set(
        voxelSize * c.s * (1.65 + CLOUD_NOISE.hash2D(c.x, c.z, 81) * 0.75),
        voxelSize * c.s * (1.65 + CLOUD_NOISE.hash2D(c.z, c.x, 82) * 0.55),
        1.0 // Plane depth doesn't matter, it's billboarded
      );
      dummy.rotation.set(0, CLOUD_NOISE.hash2D(c.x, c.z, 83) * Math.PI * 2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, entry.colors[i]);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.position.set(entry.ox, 0, entry.oz);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    clouds.add(mesh);
  }

  function makeFarCloudMaterial() {
    const uniforms = {
      uTime: { value: 0 },
      uCloudCameraPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0.25, 0.85, 0.45).normalize() },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.28 },
      uDomainRadius: { value: 114000.0 },
      uFarFadeStart: { value: cloudTuning.farFadeStart },
      uFarFadeEnd: { value: cloudTuning.farFadeEnd }
    };

    const vertexShader = `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `;

    const fragmentShader = `
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform vec3 uCloudCameraPos;
      uniform vec3 uSunDir;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uDomainRadius;
      uniform float uFarFadeStart;
      uniform float uFarFadeEnd;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash2(i + vec2(0.0, 0.0));
        float b = hash2(i + vec2(1.0, 0.0));
        float c = hash2(i + vec2(0.0, 1.0));
        float d = hash2(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float sum = 0.0;
        float amp = 0.55;
        float freq = 1.0;
        for (int i = 0; i < 4; i++) {
          sum += noise2(p * freq) * amp;
          freq *= 2.05;
          amp *= 0.52;
        }
        return sum;
      }

      void main() {
        vec2 wind = vec2(uTime * 0.0012, -uTime * 0.0007);
        vec2 p = (vWorldPos.xz * 0.00007) + wind;
        vec2 warp = vec2(
          fbm(p * 0.78 + vec2(9.2, 17.1)),
          fbm(p * 0.72 - vec2(15.6, 5.1))
        );
        p += (warp - 0.5) * 0.55;
        float n = fbm(p);
        float coverage = smoothstep(0.54, 0.78, n);
        float detail = smoothstep(0.44, 0.82, fbm(p * 2.4 + vec2(14.0, 31.0)));
        float alpha = coverage * mix(0.7, 1.0, detail);

        float dist = distance(vWorldPos.xz, uCloudCameraPos.xz);
        float farFade = smoothstep(uFarFadeStart, uFarFadeEnd, dist);
        alpha *= farFade;
        float domainFade = 1.0 - smoothstep(uDomainRadius * 0.7, uDomainRadius, dist);
        alpha *= domainFade;

        // Soft edge rolloff to reduce hard cloud boundaries.
        float edge = fwidth(alpha) * 1.8 + 0.015;
        alpha = smoothstep(0.04 - edge, 0.98 + edge, alpha);

        vec3 viewDir = normalize(uCloudCameraPos - vWorldPos);
        float phase = pow(max(dot(viewDir, normalize(uSunDir)), 0.0), 6.0);
        vec3 phaseTint = mix(uColor, vec3(1.0, 0.97, 0.88), 0.38);
        vec3 finalColor = mix(uColor, phaseTint, phase * 0.45);

        if (alpha < 0.01) discard;
        gl_FragColor = vec4(finalColor, alpha * uOpacity);
      }
    `;

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  const farCloudMat = makeFarCloudMaterial();
  const farCloudLayer = new THREE.Mesh(new THREE.PlaneGeometry(240000, 240000, 1, 1), farCloudMat);
  farCloudLayer.rotation.x = -Math.PI / 2;
  farCloudLayer.position.y = 3600;
  farCloudLayer.renderOrder = 1;
  scene.add(farCloudLayer);

  const farColor = new THREE.Color();
  const clearFarColor = new THREE.Color();
  const stormFarColor = new THREE.Color();

  function updateClouds(dt, camera, weather = null, cloudTint = null, sunDir = null) {
    if (camera) {
      sharedCloudUniforms.uCloudCameraPos.value.copy(camera.position);
      farCloudMat.uniforms.uCloudCameraPos.value.copy(camera.position);
      farCloudLayer.position.x = camera.position.x;
      farCloudLayer.position.z = camera.position.z;
    }
    if (sunDir) {
      sharedCloudUniforms.uCloudSunDir.value.copy(sunDir).normalize();
      farCloudMat.uniforms.uSunDir.value.copy(sunDir).normalize();
    }

    farCloudMat.uniforms.uTime.value += dt;

    if (cloudTint) {
      farCloudMat.uniforms.uColor.value.copy(cloudTint);
    } else if (weather) {
      // Use pre-allocated Colors to avoid per-frame heap allocation.
      clearFarColor.set(weather.cloudColorClear);
      stormFarColor.set(weather.cloudColorStorm);
      farCloudMat.uniforms.uColor.value.lerpColors(clearFarColor, stormFarColor, weather.transition);
    }

    if (weather) {
      farCloudMat.uniforms.uOpacity.value =
        (weather.cloudOpacityBase + (weather.cloudOpacityStorm - weather.cloudOpacityBase) * weather.transition) * cloudTuning.farOpacityScale;
    }
  }

  function getCloudTuning() {
    return { ...cloudTuning };
  }

  function setCloudTuning(partial = {}) {
    if (typeof partial.nearFadeStart === 'number') cloudTuning.nearFadeStart = partial.nearFadeStart;
    if (typeof partial.nearFadeEnd === 'number') cloudTuning.nearFadeEnd = partial.nearFadeEnd;
    if (typeof partial.minLight === 'number') cloudTuning.minLight = partial.minLight;
    if (typeof partial.farFadeStart === 'number') cloudTuning.farFadeStart = partial.farFadeStart;
    if (typeof partial.farFadeEnd === 'number') cloudTuning.farFadeEnd = partial.farFadeEnd;
    if (typeof partial.farOpacityScale === 'number') cloudTuning.farOpacityScale = partial.farOpacityScale;

    sharedCloudUniforms.uNearFadeStart.value = cloudTuning.nearFadeStart;
    sharedCloudUniforms.uNearFadeEnd.value = cloudTuning.nearFadeEnd;
    sharedCloudUniforms.uCloudMinLight.value = cloudTuning.minLight;
    farCloudMat.uniforms.uFarFadeStart.value = cloudTuning.farFadeStart;
    farCloudMat.uniforms.uFarFadeEnd.value = cloudTuning.farFadeEnd;
  }

  scene.add(clouds);
  return { clouds, cloudMaterial: voxelMat, updateClouds, getCloudTuning, setCloudTuning };
}
