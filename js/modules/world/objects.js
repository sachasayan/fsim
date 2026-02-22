import { createEnvironment } from './environment.js';
import { createTerrainSystem } from './terrain.js';
import { createRunwaySystem } from './runway.js';
import { createCloudSystem } from './clouds.js';
import { createParticleSystem } from './particles.js';
import { createAircraftSystem } from './aircraft.js';

export function createWorldObjects({ scene, renderer, Noise, PHYSICS }) {
  const environment = createEnvironment({ scene, renderer });
  const terrain = createTerrainSystem({ scene, Noise, PHYSICS });
  const runway = createRunwaySystem({ scene, renderer, getTerrainHeight: terrain.getTerrainHeight });
  const cloudSystem = createCloudSystem({ scene });
  const particles = createParticleSystem({ scene });
  const aircraft = createAircraftSystem({ scene, renderer });

  return {
    ...environment,
    ...terrain,
    ...runway,
    ...cloudSystem,
    ...particles,
    ...aircraft
  };
}
