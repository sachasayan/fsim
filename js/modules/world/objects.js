import { createEnvironment } from './environment.js';
import { createTerrainSystem } from './terrain.js';
import { createRunwaySystem } from './runway.js';
import { createTowerSystem } from './tower.js';
import { createApron } from './apron.js';
import { createHangarSystem } from './hangar.js';
import { createRadarSystem } from './radar.js';
import { createCloudSystem } from './clouds.js';
import { createParticleSystem } from './particles.js';
import { createAircraftSystem } from './aircraft.js';

import { createWorldLodManager } from './WorldLodManager.js';
import { warmupShaderPrograms } from './ShaderWarmup.js';
import {
  createShaderVariantRegistry,
  listShaderVariants,
  registerShaderVariants
} from './ShaderVariantRegistry.js';

export function createWorldObjects({ scene, renderer, Noise, PHYSICS, AIRCRAFT, WEATHER }) {
  const lodManager = createWorldLodManager();

  const environment = createEnvironment({ scene, renderer, WEATHER });
  const terrain = createTerrainSystem({ scene, renderer, Noise, PHYSICS });
  const runway = createRunwaySystem({ scene, renderer, getTerrainHeight: terrain.getTerrainHeight });
  const tower = createTowerSystem({ scene, getTerrainHeight: terrain.getTerrainHeight });
  const apron = createApron({ scene, renderer, getTerrainHeight: terrain.getTerrainHeight });
  const hangar = createHangarSystem({ scene, getTerrainHeight: terrain.getTerrainHeight });
  const radar = createRadarSystem({ scene, getTerrainHeight: terrain.getTerrainHeight });
  const cloudSystem = createCloudSystem({ scene });
  const particles = createParticleSystem({ scene });
  const aircraft = createAircraftSystem({ scene, renderer });
  const shaderVariantRegistry = createShaderVariantRegistry();
  registerShaderVariants(shaderVariantRegistry, [
    terrain.getShaderValidationVariants?.(),
    runway.getShaderValidationVariants?.(),
    cloudSystem.getShaderValidationVariants?.()
  ]);
  const shaderVariants = listShaderVariants(shaderVariantRegistry);
  let warmupPromise = null;
  let shaderValidationReport = null;

  function validateShaders(camera, { force = false } = {}) {
    if (warmupPromise && !force) return warmupPromise;
    warmupPromise = warmupShaderPrograms({
      renderer,
      camera,
      registry: shaderVariantRegistry
    }).then((report) => {
      shaderValidationReport = report;
      return report;
    }).catch((error) => {
      console.warn('[world] Shader warmup failed:', error);
      shaderValidationReport = {
        compiled: false,
        skipped: false,
        mode: typeof renderer?.compileAsync === 'function' ? 'compileAsync' : 'compile',
        variantCount: shaderVariants.length,
        providerCount: shaderVariants.length,
        objectCount: 0,
        durationMs: 0,
        variants: shaderVariants.map((variant, index) => ({
          id: variant.id || `variant-${index}`,
          objectCount: 0,
          metadata: variant.metadata || null
        })),
        error: String(error?.message || error)
      };
      shaderValidationReport.providers = shaderValidationReport.variants;
      return shaderValidationReport;
    });
    return warmupPromise;
  }

  function warmupShaders(camera) {
    return validateShaders(camera);
  }

  function getShaderValidationReport() {
    return shaderValidationReport;
  }

  function getShaderValidationVariants() {
    return shaderVariants.map((variant) => ({
      id: variant.id,
      metadata: variant.metadata || null
    }));
  }

  // Register objects for centralized LOD management
  lodManager.register(runway);
  lodManager.register(tower);
  lodManager.register(apron);
  lodManager.register(hangar);
  lodManager.register(radar);

  return {
    ...environment,
    ...terrain,
    ...runway,
    ...tower,
    ...apron,
    ...hangar,
    ...cloudSystem,
    ...particles,
    ...aircraft,
    validateShaders,
    getShaderValidationReport,
    getShaderValidationVariants,
    warmupShaders,
    updateWorldObjects: (time) => {
      radar.update(time);
    },
    updateWorldLOD: lodManager.updateWorldLOD
  };
}
