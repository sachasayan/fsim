import { createEnvironment } from './environment.js';
import { createTerrainSystem } from './terrain.js';
import { createRunwaySystem } from './runway.js';
import { createTowerSystem } from './tower.js';
import { createCloudSystem } from './clouds.js';
import { createParticleSystem } from './particles.js';
import { createAircraftSystem } from './aircraft.js';

import { createWorldLodManager } from './WorldLodManager.js';

export function createWorldObjects({ scene, renderer, Noise, PHYSICS, AIRCRAFT, WEATHER }) {
  const lodManager = createWorldLodManager();

  const environment = createEnvironment({ scene, renderer, WEATHER });
  const terrain = createTerrainSystem({ scene, Noise, PHYSICS });
  const runway = createRunwaySystem({ scene, renderer, getTerrainHeight: terrain.getTerrainHeight });
  const tower = createTowerSystem({ scene, getTerrainHeight: terrain.getTerrainHeight });
  const cloudSystem = createCloudSystem({ scene });
  const particles = createParticleSystem({ scene });
  const aircraft = createAircraftSystem({ scene, renderer });

  // Register objects for centralized LOD management
  lodManager.register(runway);
  lodManager.register(tower);

  return {
    ...environment,
    ...terrain,
    ...runway,
    ...tower,
    ...cloudSystem,
    ...particles,
    ...aircraft,
    updateWorldLOD: lodManager.updateWorldLOD
  };
}
