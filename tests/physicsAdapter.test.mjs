import test from 'node:test';
import assert from 'node:assert/strict';

import { createPhysicsAdapter } from '../js/modules/physics/physicsAdapter.js';

function createMockVector3(x = 0, y = 0, z = 0) {
  return {
    x, y, z,
    set(nx, ny, nz) {
      this.x = nx;
      this.y = ny;
      this.z = nz;
    }
  };
}

function createMockQuaternion(x = 0, y = 0, z = 0, w = 1) {
  return {
    x, y, z, w,
    set(nx, ny, nz, nw) {
      this.x = nx;
      this.y = ny;
      this.z = nz;
      this.w = nw;
    }
  };
}

function createMockPhysicsAndAircraft() {
  const PHYSICS = {
    gravity: 9.81,
    position: createMockVector3(0, 100, 0),
    quaternion: createMockQuaternion(),
    velocity: createMockVector3(),
    angularVelocity: createMockVector3(),
    externalForce: createMockVector3(),
    externalTorque: createMockVector3()
  };
  const AIRCRAFT = {
    mass: 1000,
    inertia: createMockVector3(1000, 1000, 1000)
  };
  return { PHYSICS, AIRCRAFT };
}

test('createPhysicsAdapter returns expected methods', () => {
  const { PHYSICS, AIRCRAFT } = createMockPhysicsAndAircraft();
  const adapter = createPhysicsAdapter({ PHYSICS, AIRCRAFT });

  assert.equal(typeof adapter.init, 'function');
  assert.equal(typeof adapter.step, 'function');
  assert.equal(typeof adapter.syncFromState, 'function');
  assert.equal(typeof adapter.getRapier, 'function');
  assert.equal(typeof adapter.getBody, 'function');
  assert.equal(typeof adapter.getCollider, 'function');
  assert.equal(typeof adapter.getRunwayCollider, 'function');
});

test('createPhysicsAdapter initializes Rapier backend', async () => {
  const { PHYSICS, AIRCRAFT } = createMockPhysicsAndAircraft();
  const adapter = createPhysicsAdapter({ PHYSICS, AIRCRAFT });

  await adapter.init();

  assert.ok(adapter.getRapier(), 'Rapier instance should be set');
  assert.ok(adapter.getBody(), 'Rigid body should be created');
  assert.ok(adapter.getCollider(), 'Collider should be created');
  assert.ok(adapter.getRunwayCollider(), 'Runway collider should be created');

  const body = adapter.getBody();
  assert.equal(body.translation().x, 0);
  assert.equal(body.translation().y, 100);
  assert.equal(body.translation().z, 0);
});

test('syncFromState() updates body state', async () => {
  const { PHYSICS, AIRCRAFT } = createMockPhysicsAndAircraft();
  const adapter = createPhysicsAdapter({ PHYSICS, AIRCRAFT });
  await adapter.init();

  // Change state
  PHYSICS.position.set(10, 20, 30);
  PHYSICS.velocity.set(1, 2, 3);
  PHYSICS.angularVelocity.set(0.1, 0.2, 0.3);
  PHYSICS.quaternion.set(0, 1, 0, 0);

  // Calling step forces a syncFromState because init() set needsSyncFromState = true
  adapter.step(0.016);

  // Notice that during step, Rapier processes physics, moving things around.
  // Then the step method updates PHYSICS state with the new position.
  // So to accurately test syncFromState, we'll manually call it.

  // Change PHYSICS state again without calling step
  PHYSICS.position.set(15, 25, 35);
  PHYSICS.velocity.set(2, 3, 4);
  PHYSICS.angularVelocity.set(0.2, 0.3, 0.4);
  PHYSICS.quaternion.set(0, 0, 1, 0);

  adapter.syncFromState();
  const body = adapter.getBody();

  const p2 = body.translation();
  const v2 = body.linvel();
  const a2 = body.angvel();
  const q2 = body.rotation();

  // Check translation within close precision, since Rapier might use f32
  assert.ok(Math.abs(p2.x - 15) < 0.001);
  assert.ok(Math.abs(p2.y - 25) < 0.001);
  assert.ok(Math.abs(p2.z - 35) < 0.001);

  assert.ok(Math.abs(v2.x - 2) < 0.001);
  assert.ok(Math.abs(v2.y - 3) < 0.001);
  assert.ok(Math.abs(v2.z - 4) < 0.001);

  assert.ok(Math.abs(a2.x - 0.2) < 0.001);
  assert.ok(Math.abs(a2.y - 0.3) < 0.001);
  assert.ok(Math.abs(a2.z - 0.4) < 0.001);

  assert.ok(Math.abs(q2.x - 0) < 0.001);
  assert.ok(Math.abs(q2.y - 0) < 0.001);
  assert.ok(Math.abs(q2.z - 1) < 0.001);
  assert.ok(Math.abs(q2.w - 0) < 0.001);
});

test('step() updates PHYSICS state with external forces', async () => {
  const { PHYSICS, AIRCRAFT } = createMockPhysicsAndAircraft();
  const adapter = createPhysicsAdapter({ PHYSICS, AIRCRAFT });

  await adapter.init();

  // Initial step sets things up
  adapter.step(0);

  PHYSICS.externalForce.set(1000, 0, 0);

  adapter.step(0.1); // Step with 100ms

  // Velocity and position should be updated by force
  assert.ok(PHYSICS.velocity.x > 0, 'Velocity should increase due to external force');
  assert.ok(PHYSICS.velocity.y < 0, 'Velocity should decrease due to gravity');
  assert.ok(PHYSICS.position.x > 0, 'Position should increase due to external force');
  assert.ok(PHYSICS.position.y < 100, 'Position should decrease due to gravity');

  const lastVelocityY = PHYSICS.velocity.y;
  adapter.step(0.1);
  assert.ok(PHYSICS.velocity.y < lastVelocityY, 'Velocity Y should decrease further');
});
