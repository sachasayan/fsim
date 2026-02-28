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
  const gridStep = 220;
  const layersMax = 6;
  const tileSize = 6000;

  // Rounded low-poly puffs read much less blocky than box voxels at similar cost.
  const voxelGeo = new THREE.SphereGeometry(voxelSize * 0.52, 7, 5);
  const voxelMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.24,
    roughness: 0.88,
    metalness: 0.0,
    emissive: 0xffffff,
    emissiveIntensity: 0.18
  });
  voxelMat.depthWrite = false;
  voxelMat.premultipliedAlpha = true;

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
    uCloudMinLight: { value: cloudTuning.minLight }
  };

  voxelMat.onBeforeCompile = (shader) => {
    shader.uniforms.uCloudCameraPos = sharedCloudUniforms.uCloudCameraPos;
    shader.uniforms.uNearFadeStart = sharedCloudUniforms.uNearFadeStart;
    shader.uniforms.uNearFadeEnd = sharedCloudUniforms.uNearFadeEnd;
    shader.uniforms.uCloudMinLight = sharedCloudUniforms.uCloudMinLight;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCloudWorldPos;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vCloudWorldPos = worldPosition.xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCloudWorldPos;
uniform vec3 uCloudCameraPos;
uniform float uNearFadeStart;
uniform float uNearFadeEnd;
uniform float uCloudMinLight;`
      )
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
float cloudDist = distance(vCloudWorldPos.xz, uCloudCameraPos.xz);
float nearFade = 1.0 - smoothstep(uNearFadeStart, uNearFadeEnd, cloudDist);
diffuseColor.a *= nearFade;`
      )
      .replace(
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
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
      const nLarge = fbm2D(x * 0.00018, z * 0.00018, 4, 2.0, 0.5, 11);
      const nDetail = fbm2D(x * 0.00052, z * 0.00052, 3, 2.1, 0.55, 29);
      const density = nLarge * 0.78 + nDetail * 0.22;
      if (density < 0.58) continue;

      const baseY = 900 + nLarge * 3200;
      const columnLayers = 1 + Math.floor((density - 0.6) / 0.4 * layersMax);
      const cappedLayers = Math.min(layersMax, Math.max(1, columnLayers));
      const spread = 1.0 + hash2D(x / gridStep, z / gridStep, 3) * 1.0;

      for (let l = 0; l < cappedLayers; l++) {
        const jitterX = (hash2D(x + l, z - l, 41) - 0.5) * gridStep * 0.65;
        const jitterZ = (hash2D(x - l, z + l, 53) - 0.5) * gridStep * 0.65;
        const jitterY = (hash2D(x + l * 3, z + l * 5, 67) - 0.5) * 55;
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
        c.s * (1.45 + hash2D(c.x, c.z, 81) * 0.75),
        c.s * (0.95 + hash2D(c.z, c.x, 82) * 0.55),
        c.s * (1.25 + hash2D(c.z, c.x, 84) * 0.6)
      );
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

  function makeFarCloudMaterial() {
    const uniforms = {
      uTime: { value: 0 },
      uCloudCameraPos: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(0xffffff) },
      uOpacity: { value: 0.28 },
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
      uniform vec3 uColor;
      uniform float uOpacity;
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
        float n = fbm(p);
        float coverage = smoothstep(0.54, 0.78, n);
        float detail = smoothstep(0.44, 0.82, fbm(p * 2.4 + vec2(14.0, 31.0)));
        float alpha = coverage * mix(0.7, 1.0, detail);

        float dist = distance(vWorldPos.xz, uCloudCameraPos.xz);
        float farFade = smoothstep(uFarFadeStart, uFarFadeEnd, dist);
        alpha *= farFade;

        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha * uOpacity);
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
  scene.add(farCloudLayer);

  const farColor = new THREE.Color();

  function updateClouds(dt, camera, weather = null, cloudTint = null) {
    if (camera) {
      sharedCloudUniforms.uCloudCameraPos.value.copy(camera.position);
      farCloudMat.uniforms.uCloudCameraPos.value.copy(camera.position);
      farCloudLayer.position.x = camera.position.x;
      farCloudLayer.position.z = camera.position.z;
    }

    farCloudMat.uniforms.uTime.value += dt;

    if (cloudTint) {
      farCloudMat.uniforms.uColor.value.copy(cloudTint);
    } else if (weather) {
      farColor.set(weather.cloudColorClear).lerp(new THREE.Color(weather.cloudColorStorm), weather.transition);
      farCloudMat.uniforms.uColor.value.copy(farColor);
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
