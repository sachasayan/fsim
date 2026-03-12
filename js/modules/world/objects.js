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
  const warmupProviders = [
    terrain.getShaderWarmupSpec,
    runway.getShaderWarmupSpec,
    cloudSystem.getShaderWarmupSpec
  ].filter(Boolean);
  let warmupPromise = null;
  let shaderValidationReport = null;

  function validateShaders(camera, { force = false } = {}) {
    if (warmupPromise && !force) return warmupPromise;
    warmupPromise = warmupShaderPrograms({
      renderer,
      camera,
      providers: warmupProviders
    }).then((report) => {
      shaderValidationReport = report;
      return report;
    }).catch((error) => {
      console.warn('[world] Shader warmup failed:', error);
      shaderValidationReport = {
        compiled: false,
        skipped: false,
        mode: typeof renderer?.compileAsync === 'function' ? 'compileAsync' : 'compile',
        providerCount: warmupProviders.length,
        objectCount: 0,
        durationMs: 0,
        providers: warmupProviders.map((provider, index) => ({
          id: provider.shaderProviderId || provider.name || `provider-${index}`,
          objectCount: 0
        })),
        error: String(error?.message || error)
      };
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
    warmupShaders,
    updateWorldObjects: (time) => {
      radar.update(time);
    },
    updateWorldLOD: lodManager.updateWorldLOD
  };
}
