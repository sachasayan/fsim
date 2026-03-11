import { createEnvironment } from './environment.js';
import { createTerrainSystem } from './terrain.js';
import { createRunwaySystem } from './runway.js';
import { createTowerSystem } from './tower.js';
import { createApron } from './apron.js';
import { createTaxiwaySystem } from './taxiway.js';
import { createHangarSystem } from './hangar.js';
import { createRadarSystem } from './radar.js';
import { createCloudSystem } from './clouds.js';
import { createParticleSystem } from './particles.js';
import { createAircraftSystem } from './aircraft.js';

import { createWorldLodManager } from './WorldLodManager.js';

export function createWorldObjects({ scene, renderer, Noise, PHYSICS, AIRCRAFT, WEATHER }) {
  const lodManager = createWorldLodManager();

  const environment = createEnvironment({ scene, renderer, WEATHER });
  const terrain = createTerrainSystem({ scene, renderer, Noise, PHYSICS });
  const runway = createRunwaySystem({ scene, renderer, getTerrainHeight: terrain.getTerrainHeight });
  const tower = createTowerSystem({ scene, getTerrainHeight: terrain.getTerrainHeight });
  const apron = createApron({ scene, renderer, getTerrainHeight: terrain.getTerrainHeight });
  const taxiway = createTaxiwaySystem({ scene, renderer, getTerrainHeight: terrain.getTerrainHeight });
  const hangar = createHangarSystem({ scene, getTerrainHeight: terrain.getTerrainHeight });
  const radar = createRadarSystem({ scene, getTerrainHeight: terrain.getTerrainHeight });
  const cloudSystem = createCloudSystem({ scene });
  const particles = createParticleSystem({ scene });
  const aircraft = createAircraftSystem({ scene, renderer });

  // Register objects for centralized LOD management
  lodManager.register(runway);
  lodManager.register(tower);
  lodManager.register(apron);
  lodManager.register(taxiway);
  lodManager.register(hangar);
  lodManager.register(radar);

  return {
    ...environment,
    ...terrain,
    ...runway,
    ...tower,
    ...apron,
    ...taxiway,
    ...hangar,
    ...cloudSystem,
    ...particles,
    ...aircraft,
    updateWorldObjects: (time) => {
      radar.update(time);
    },
    updateWorldLOD: lodManager.updateWorldLOD
  };
}
