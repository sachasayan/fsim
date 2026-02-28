import { createRapierWorld } from './rapierWorld.js';

export function createPhysicsAdapter({ PHYSICS, AIRCRAFT }) {
  let rapier = null;
  let RAPIER = null;
  let body = null;
  let collider = null;
  let runwayCollider = null;
  let needsSyncFromState = false;

  async function init() {
    try {
      rapier = await createRapierWorld({ gravityY: -PHYSICS.gravity });
      ({ RAPIER } = rapier);
      const { world } = rapier;

      const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(80000, 2.0, 80000)
          .setTranslation(0, -2.0, 0)
          .setFriction(0.12)
          .setRestitution(0.0),
        groundBody
      );
      runwayCollider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(50, 0.15, 2050)
          .setTranslation(0, 0.15, 0)
          .setFriction(0.08)
          .setRestitution(0.0),
        groundBody
      );

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(PHYSICS.position.x, PHYSICS.position.y, PHYSICS.position.z)
        .setLinearDamping(0.08)
        .setAngularDamping(0.25)
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
        console.info('[physics] Rapier body scale', {
          targetMass: AIRCRAFT.mass,
          rigidBodyMass: Number.isFinite(rbMass) ? Number(rbMass.toFixed(1)) : 'unknown',
          targetInertia: {
            x: AIRCRAFT.inertia.x,
            y: AIRCRAFT.inertia.y,
            z: AIRCRAFT.inertia.z
          },
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
      console.info('[physics] Rapier backend initialized (force/torque flight dynamics)');
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
    if (needsSyncFromState) syncFromState();

    const speed = PHYSICS.airspeed || PHYSICS.velocity.length();
    if (PHYSICS.onGround) {
      const takeoffBlend = Math.max(0, Math.min(1, speed / 90));
      body.setLinearDamping(0.16 - 0.11 * takeoffBlend);
      body.setAngularDamping(1.4 - 0.95 * takeoffBlend);
    } else {
      body.setLinearDamping(0.04);
      body.setAngularDamping(0.18);
    }

    body.resetForces(true);
    body.resetTorques(true);
    body.addForce(PHYSICS.externalForce, true);
    body.addTorque(PHYSICS.externalTorque, true);
    rapier.step(dt);

    const p = body.translation();
    const q = body.rotation();
    const lv = body.linvel();
    const av = body.angvel();
    PHYSICS.position.set(p.x, p.y, p.z);
    PHYSICS.quaternion.set(q.x, q.y, q.z, q.w);
    PHYSICS.velocity.set(lv.x, lv.y, lv.z);
    PHYSICS.angularVelocity.set(av.x, av.y, av.z);

  }
  return {
    init,
    step,
    syncFromState,
    getRapier: () => rapier,
    getBody: () => body,
    getCollider: () => collider,
    getRunwayCollider: () => runwayCollider
  };
}
