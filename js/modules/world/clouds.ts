// @ts-check

import * as THREE from 'three';
import {
  createFarCloudUniforms,
  getFarCloudOwnedShaderSource,
  getNearCloudShaderDescriptor
} from './shaders/CloudOwnedShaderSource.js';
import { configureMaterialShaderPipeline } from './shaders/MaterialShaderPipeline.js';
import { applyOwnedShaderDescriptor } from './shaders/ShaderDescriptor.js';

type CloudTuning = {
  nearFadeStart: number;
  nearFadeEnd: number;
  minLight: number;
  farFadeStart: number;
  farFadeEnd: number;
  farOpacityScale: number;
};

type CloudWeatherState = {
  cloudColorClear: THREE.ColorRepresentation;
  cloudColorStorm: THREE.ColorRepresentation;
  cloudOpacityBase: number;
  cloudOpacityStorm: number;
  transition: number;
};

type CloudWorkerTile = {
  count: number;
  positions: ArrayLike<number>;
  scales: ArrayLike<number>;
  rotations: ArrayLike<number>;
  colors: ArrayLike<number>;
  ox: number;
  oz: number;
};

type CloudWorkerGeneratedMessage = {
  type: 'CLOUDS_GENERATED';
  tiles: CloudWorkerTile[];
};

type CloudSystemArgs = {
  scene: THREE.Scene;
};

/**
 * @param {CloudSystemArgs} args
 */
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
    transparent: true,
    opacity: 0.35,
    fog: false // Prevent scene ground fog from flat-tinting the clouds
  });
  voxelMat.alphaTest = 0.02;
  voxelMat.depthWrite = false;
  voxelMat.premultipliedAlpha = false;

  /** @type {CloudTuning} */
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

  applyOwnedShaderDescriptor(voxelMat, getNearCloudShaderDescriptor(), {
    sharedCloudUniforms
  });

  const clouds = new THREE.Group();
  scene.add(clouds);

  // Initialize Web Worker
  const cloudWorker = new Worker(new URL('./CloudWorker', import.meta.url), { type: 'module' });

  /**
   * @param {MessageEvent<CloudWorkerGeneratedMessage>} e
   */
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
    const uniforms = createFarCloudUniforms({ cloudTuning });
    const source = getFarCloudOwnedShaderSource();

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: source.vertexShader,
      fragmentShader: source.fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    configureMaterialShaderPipeline(material, {
      baseCacheKey: 'far-clouds-owned-v1'
    });

    return material;
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

  /**
   * @param {number} dt
   * @param {THREE.Camera | null | undefined} camera
   * @param {CloudWeatherState | null | undefined} [weather]
   * @param {THREE.Color | null | undefined} [cloudTint]
   * @param {THREE.Vector3 | null | undefined} [sunDir]
   */
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

  /**
   * @returns {ShaderVariantEntry[]}
   */
  function getShaderValidationVariants() {
    return [
      {
        id: 'cloud-near',
        metadata: { system: 'clouds', variant: 'near' },
        /**
         * @param {THREE.Camera | null} [camera]
         */
        build(camera = null) {
          if (camera) {
            sharedCloudUniforms.uCloudCameraPos.value.copy(camera.position);
          }

          const nearCloudGeo = new THREE.PlaneGeometry(1, 1);
          const warmupDummy = new THREE.Object3D();
          warmupDummy.position.set(0, 3200, 0);
          warmupDummy.scale.set(1800, 900, 1);
          warmupDummy.updateMatrix();

          const nearCloudMesh = new THREE.InstancedMesh(nearCloudGeo, voxelMat, 1);
          nearCloudMesh.setMatrixAt(0, warmupDummy.matrix);
          nearCloudMesh.instanceMatrix.needsUpdate = true;
          nearCloudMesh.updateMatrixWorld(true);

          return {
            objects: [nearCloudMesh],
            dispose() {
              nearCloudGeo.dispose();
            }
          };
        }
      },
      {
        id: 'cloud-far',
        metadata: { system: 'clouds', variant: 'far' },
        /**
         * @param {THREE.Camera | null} [camera]
         */
        build(camera = null) {
          if (camera) {
            farCloudMat.uniforms.uCloudCameraPos.value.copy(camera.position);
          }

          const farCloudGeo = new THREE.PlaneGeometry(240000, 240000, 1, 1);
          const farCloudMesh = new THREE.Mesh(farCloudGeo, farCloudMat);
          farCloudMesh.rotation.x = -Math.PI / 2;
          farCloudMesh.position.y = 3600;
          farCloudMesh.updateMatrixWorld(true);

          return {
            objects: [farCloudMesh],
            dispose() {
              farCloudGeo.dispose();
            }
          };
        }
      }
    ];
  }

  function getCloudTuning() {
    return { ...cloudTuning };
  }

  /**
   * @param {Partial<CloudTuning>} [partial]
   */
  function setCloudTuning(partial: Partial<CloudTuning> = {}) {
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

  return { clouds, cloudMaterial: voxelMat, updateClouds, getCloudTuning, setCloudTuning, getShaderValidationVariants };
}
