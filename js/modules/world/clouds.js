import * as THREE from 'three';
import { CLOUD_NOISE } from './cloudNoise.js';

export function createCloudSystem({ scene }) {
  const voxelSize = 220;
  const worldHalfExtent = 22000;
  const gridStep = 220;
  const layersMax = 6;
  // Use one large tile to avoid transparent per-tile sort boundaries ("vertical panes").
  const tileSize = worldHalfExtent * 4;

  // Creating a procedural soft brush texture for the clouds
  const texSize = 64;
  const texData = new Uint8Array(texSize * texSize * 4);
  for (let y = 0; y < texSize; y++) {
    for (let x = 0; x < texSize; x++) {
      const dx = (x - texSize / 2) / (texSize / 2);
      const dy = (y - texSize / 2) / (texSize / 2);
      const distSq = dx * dx + dy * dy;
      let alpha = 1 - Math.sqrt(distSq);
      alpha = Math.max(0, Math.min(1, alpha));
      alpha = Math.pow(alpha, 1.5); // Slightly sharper falloff
      const idx = (y * texSize + x) * 4;
      texData[idx] = 255;
      texData[idx + 1] = 255;
      texData[idx + 2] = 255;
      texData[idx + 3] = Math.floor(alpha * 255);
    }
  }
  const cloudTexture = new THREE.DataTexture(texData, texSize, texSize, THREE.RGBAFormat);
  cloudTexture.needsUpdate = true;

  // Replace spheres with quads. 1x1 base size, scaled per-instance.
  const voxelGeo = new THREE.PlaneGeometry(1, 1);
  const voxelMat = new THREE.MeshBasicMaterial({
    map: cloudTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.35,
    fog: false // Prevent scene ground fog from flat-tinting the clouds
  });
  voxelMat.alphaTest = 0.02;
  voxelMat.depthWrite = false;
  voxelMat.premultipliedAlpha = false;

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
      
      // Override the normal to always face the camera so we don't get harsh directional shading on flat planes
      #ifndef FLAT_SHADED
        vNormal = normalize( ( modelViewMatrix * vec4( 0.0, 0.0, 1.0, 0.0 ) ).xyz );
      #endif
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
      float nearFade = 1.0 - smoothstep(uNearFadeStart, uNearFadeEnd, cloudDist);
      diffuseColor.a = clamp(diffuseColor.a * nearFade, 0.0, 1.0);`
    ).replace(
      '#include <opaque_fragment>',
      `
      vec3 lightDir = normalize(uCloudSunDir);
      vec3 viewDir = normalize(uCloudCameraPos - vCloudWorldPos);
      float cosTheta = dot(viewDir, -lightDir); // Negative lightDir for correct forward scattering
      
      // Dual-lobe Henyey-Greenstein phase function for forward (silver-lining) and backward scattering
      float g1 = 0.65; // High forward scattering
      float g2 = -0.15; // Slight backward scattering
      float phase1 = (1.0 - g1 * g1) / pow(1.0 + g1 * g1 - 2.0 * g1 * cosTheta, 1.5);
      float phase2 = (1.0 - g2 * g2) / pow(1.0 + g2 * g2 - 2.0 * g2 * cosTheta, 1.5);
      float phase = mix(phase1, phase2, 0.4) * uCloudPhaseStrength;
      
      // Top boost to simulate in-scattering from the sky dome
      float topBoost = smoothstep(1200.0, 5400.0, vCloudWorldPos.y) * 0.12;
      
      // Add bright sun scattering instead of just brightening the base color
      vec3 sunScatterColor = vec3(1.0, 0.97, 0.88);
      vec3 scatterLight = mix(vec3(1.0), sunScatterColor, 0.7) * phase;
      
      // Base color should be fully lit by ambient (which is just diffuseColor since we're unlit Basic material)
      // We add scatter light, and a fake top boost
      outgoingLight = diffuseColor.rgb + scatterLight + (diffuseColor.rgb * topBoost);
      
      // Apply our manual cloud minimum brightness curve
      outgoingLight = max(outgoingLight, diffuseColor.rgb * max(uCloudMinLight, 0.3));
      
      #include <opaque_fragment>
      `
    );
  };

  const clouds = new THREE.Group();
  scene.add(clouds);

  // Initialize Web Worker
  const cloudWorker = new Worker(new URL('./CloudWorker.js', import.meta.url), { type: 'module' });

  cloudWorker.onmessage = function (e) {
    if (e.data.type === 'CLOUDS_GENERATED') {
      const dummy = new THREE.Object3D();

      for (const tile of e.data.tiles) {
        const mesh = new THREE.InstancedMesh(voxelGeo, voxelMat, tile.count);
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        for (let i = 0; i < tile.count; i++) {
          dummy.position.set(tile.positions[i * 3], tile.positions[i * 3 + 1], tile.positions[i * 3 + 2]);
          dummy.scale.set(tile.scales[i * 2], tile.scales[i * 2 + 1], 1.0);
          dummy.rotation.set(0, tile.rotations[i], 0);
          dummy.updateMatrix();

          mesh.setMatrixAt(i, dummy.matrix);
          mesh.setColorAt(i, new THREE.Color(tile.colors[i * 3], tile.colors[i * 3 + 1], tile.colors[i * 3 + 2]));
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.position.set(tile.ox, 0, tile.oz);
        mesh.frustumCulled = false;
        mesh.renderOrder = 2; // Keep in front of far clouds
        clouds.add(mesh);
      }
    }
  };

  // Kick off generation
  cloudWorker.postMessage({
    worldHalfExtent,
    gridStep,
    layersMax,
    tileSize,
    voxelSize
  });

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
        float amp = 0.6;
        float freq = 1.0;
        for (int i = 0; i < 3; i++) {
          sum += noise2(p * freq) * amp;
          freq *= 2.1;
          amp *= 0.45;
        }
        return sum;
      }

      void main() {
        vec2 wind = vec2(uTime * 0.0012, -uTime * 0.0007);
        vec2 p = (vWorldPos.xz * 0.00008) + wind;
        
        // Simplified warping: one FBM call instead of two nested ones
        float n = fbm(p + fbm(p * 0.5) * 0.3);
        
        float coverage = smoothstep(0.58, 0.82, n);
        float alpha = coverage;

        float dist = distance(vWorldPos.xz, uCloudCameraPos.xz);
        float farFade = smoothstep(uFarFadeStart, uFarFadeEnd, dist);
        alpha *= farFade;
        float domainFade = 1.0 - smoothstep(uDomainRadius * 0.7, uDomainRadius, dist);
        alpha *= domainFade;

        // Soft edge rolloff.
        float edge = fwidth(alpha) * 2.0 + 0.02;
        alpha = smoothstep(0.05 - edge, 1.0 + edge, alpha);

        vec3 lightDir = normalize(uSunDir);
        vec3 viewDir = normalize(uCloudCameraPos - vWorldPos);
        float cosTheta = dot(viewDir, -lightDir);
        
        // Dual-lobe Henyey-Greenstein phase function for forward and backward scattering
        float g1 = 0.65;
        float g2 = -0.15;
        float phase1 = (1.0 - g1 * g1) / pow(1.0 + g1 * g1 - 2.0 * g1 * cosTheta, 1.5);
        float phase2 = (1.0 - g2 * g2) / pow(1.0 + g2 * g2 - 2.0 * g2 * cosTheta, 1.5);
        float phase = mix(phase1, phase2, 0.4) * 0.25;
        
        vec3 sunScatterColor = vec3(1.0, 0.97, 0.88);
        vec3 phaseTint = mix(uColor, sunScatterColor, 0.8);
        vec3 finalColor = mix(uColor, phaseTint, clamp(phase, 0.0, 1.0));

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


  return { clouds, cloudMaterial: voxelMat, updateClouds, getCloudTuning, setCloudTuning };
}
