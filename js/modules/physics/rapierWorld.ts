// @ts-check

/**
 * @param {{ gravityY?: number }} [options]
 */
export async function createRapierWorld({ gravityY = -9.81 } = {}) {
  const RAPIER = await import('@dimforge/rapier3d-compat');
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });

  function step(dt) {
    world.timestep = dt;
    world.step();
  }

  return { RAPIER, world, step };
}
