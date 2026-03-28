// @ts-check

import { createRapierWorld } from './rapierWorld.js';
import { debugInfo } from '../core/logging.js';
import { listRuntimeAirports } from '../world/AirportLayout.js';

/**
 * @typedef AdapterPhysicsLike
 * @property {number} gravity
 * @property {import('three').Vector3} position
 * @property {import('three').Quaternion} quaternion
 * @property {import('three').Vector3} velocity
 * @property {import('three').Vector3} angularVelocity
 * @property {import('three').Vector3} externalForce
 * @property {import('three').Vector3} externalTorque
 */

/**
 * @typedef AdapterAircraftLike
 * @property {number} mass
 */

/** @typedef {Parameters<typeof listRuntimeAirports>[0]} RuntimeAirportWorldData */

/**
 * @typedef PhysicsWindowLike
 * @property {RuntimeAirportWorldData | undefined} [fsimWorld]
 */

/**
 * @param {{
 *   PHYSICS: AdapterPhysicsLike,
 *   AIRCRAFT: AdapterAircraftLike
 * }} options
 */
export function createPhysicsAdapter({ PHYSICS, AIRCRAFT }) {
  let rapier = null;
  let RAPIER = null;
  let groundBody = null;
  let body = null;
  let collider = null;
  let runwayCollider = null;
  let runwayColliders = [];
  let needsSyncFromState = false;
  let mainBodyActive = true;

  function syncRunwayColliders() {
    if (!rapier || !RAPIER) return;
    const { world } = rapier;
    for (const collider of runwayColliders) {
      world.removeCollider?.(collider, false);
    }
    runwayColliders = [];

    const worldData = /** @type {RuntimeAirportWorldData} */ (
      /** @type {PhysicsWindowLike | null} */ (typeof window !== 'undefined' ? window : null)?.fsimWorld || { airports: [] }
    );
    for (const airport of listRuntimeAirports(worldData)) {
      const yawRad = (airport.yaw || 0) * Math.PI / 180;
      const halfYaw = yawRad * 0.5;
      const rotation = {
        x: 0,
        y: Math.sin(halfYaw),
        z: 0,
        w: Math.cos(halfYaw)
      };
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(50, 0.15, 2050)
          .setTranslation(airport.x, 0.15, airport.z)
          .setRotation(rotation)
          .setFriction(0.08)
          .setRestitution(0.0),
        groundBody
      );
      runwayColliders.push(collider);
    }
    runwayCollider = runwayColliders[0] || null;
  }

  async function init() {
    try {
      rapier = await createRapierWorld({ gravityY: -PHYSICS.gravity });
      ({ RAPIER } = rapier);
      const { world } = rapier;

      groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      // Safety-net ground plane placed well below any reachable terrain.
      // Normal ground contact is handled by the spring-damper wheel model in
      // calculateAerodynamics; this collider only catches extreme edge cases.
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(80000, 2.0, 80000)
          .setTranslation(0, -200.0, 0)
          .setFriction(0.12)
          .setRestitution(0.0),
        groundBody
      );
      syncRunwayColliders();

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(PHYSICS.position.x, PHYSICS.position.y, PHYSICS.position.z)
        // Damping is set here once; the step() function no longer overrides it each frame.
        .setLinearDamping(0.04)
        .setAngularDamping(0.18)
        .setCcdEnabled(true);
      body = world.createRigidBody(bodyDesc);

      // Compound aircraft shape for better contact stability.
      collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(2.0, 2.1, 14.5)
          .setTranslation(0, 0.2, 0.0)
          .setDensity(70.0)
          .setFriction(0.08)
          .setRestitution(0.0),
        body
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(11.0, 0.55, 3.8)
          .setTranslation(0, 0.0, 2.0)
          .setDensity(70.0)
          .setFriction(0.08)
          .setRestitution(0.0),
        body
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(3.0, 0.6, 2.2)
          .setTranslation(0, 1.6, -11.2)
          .setDensity(70.0)
          .setFriction(0.08)
          .setRestitution(0.0),
        body
      );

      try {
        const rbMass = body.mass ? body.mass() : NaN;
        const rbInertia = body.principalInertia ? body.principalInertia() : null;
        debugInfo('[physics] Rapier body scale', {
          configuredMass: AIRCRAFT.mass,
          rigidBodyMass: Number.isFinite(rbMass) ? Number(rbMass.toFixed(1)) : 'unknown',
          rigidBodyInertia: rbInertia
            ? {
              x: Number(rbInertia.x.toFixed(1)),
              y: Number(rbInertia.y.toFixed(1)),
              z: Number(rbInertia.z.toFixed(1))
            }
            : 'unknown'
        });
      } catch (_err) {
        // Non-fatal: some Rapier builds omit these accessors.
      }

      needsSyncFromState = true;
      if (typeof window !== 'undefined') {
        window.addEventListener('fsim:world-metadata-updated', syncRunwayColliders);
      }
      debugInfo('[physics] Rapier backend initialized (force/torque flight dynamics)');
    } catch (err) {
      console.error('[physics] Rapier init failed.', err);
      throw err;
    }
  }

  function syncFromState() {
    if (!body) return;
    body.setTranslation(PHYSICS.position, true);
    body.setRotation(PHYSICS.quaternion, true);
    body.setLinvel(PHYSICS.velocity, true);
    body.setAngvel(PHYSICS.angularVelocity, true);
    body.resetForces(true);
    body.resetTorques(true);
    needsSyncFromState = false;
  }

  function step(dt) {
    if (!rapier || !body || !RAPIER) return;
    if (mainBodyActive && needsSyncFromState) syncFromState();

    body.resetForces(true);
    body.resetTorques(true);
    if (mainBodyActive) {
      body.addForce(PHYSICS.externalForce, true);
      body.addTorque(PHYSICS.externalTorque, true);
    } else {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    rapier.step(dt);

    if (mainBodyActive) {
      const p = body.translation();
      const q = body.rotation();
      const lv = body.linvel();
      const av = body.angvel();
      PHYSICS.position.set(p.x, p.y, p.z);
      PHYSICS.quaternion.set(q.x, q.y, q.z, q.w);
      PHYSICS.velocity.set(lv.x, lv.y, lv.z);
      PHYSICS.angularVelocity.set(av.x, av.y, av.z);
    }

  }
  return {
    init,
    step,
    syncFromState,
    setMainBodyActive: (active) => {
      mainBodyActive = active;
      needsSyncFromState = active;
      if (!body) return;
      if (!active) {
        body.resetForces(true);
        body.resetTorques(true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    },
    isMainBodyActive: () => mainBodyActive,
    getRapier: () => rapier,
    getBody: () => body,
    getCollider: () => collider,
    getRunwayCollider: () => runwayCollider,
    syncRunwayColliders
  };
}
