import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { calculateAerodynamics } from '../js/modules/physics/updatePhysics.js';
import { solveStabilityTorques } from '../js/modules/physics/AeroSolver.js';

// Minimal aircraft constants matching the real sim
const AIRCRAFT = {
    mass: 50000,
    wingArea: 180,
    maxThrust: 800000,
    cdBase: 0.025,
    clSlope: 0.1,
    stallAngle: 35,
    gearHeight: 3.5,
    movableSurfaces: {}
};

function makePhysics(overrides = {}) {
    return {
        gravity: 9.81,
        rho: 1.225,
        dt: 0.016,
        position: new THREE.Vector3(0, 200, 0),  // 200 m AGL by default
        velocity: new THREE.Vector3(0, 0, 0),
        quaternion: new THREE.Quaternion(),
        angularVelocity: new THREE.Vector3(0, 0, 0),
        externalForce: new THREE.Vector3(0, 0, 0),
        externalTorque: new THREE.Vector3(0, 0, 0),
        throttle: 0,
        elevator: 0,
        aileron: 0,
        rudder: 0,
        flaps: 0,
        targetFlaps: 0,
        gearDown: true,
        gearTransition: 1.0,
        spoilers: false,
        brakes: false,
        airspeed: 0,
        aoa: 0,
        slip: 0,
        gForce: 1.0,
        heightAgl: 0,
        isStalling: false,
        onGround: false,
        crashed: false,
        ...overrides
    };
}

function makeCtx(physicsOverrides = {}, extra = {}) {
    const PHYSICS = makePhysics(physicsOverrides);
    return {
        THREE,
        PHYSICS,
        AIRCRAFT,
        // Flat terrain at y = 0
        getTerrainHeight: () => 0,
        WEATHER: { windX: 0, windZ: 0 },
        keys: {
            ArrowUp: false, ArrowDown: false,
            ArrowLeft: false, ArrowRight: false,
            a: false, z: false, q: false, e: false
        },
        gearGroup: null,
        planeGroup: null,
        Noise: null,
        ...extra
    };
}

test('calculateAerodynamics – zero throttle produces no thrust', () => {
    const ctx = makeCtx({ throttle: 0, position: new THREE.Vector3(0, 500, 0) });
    calculateAerodynamics(ctx);
    // Net force should be negative Y (gravity dominant) and near-zero X/Z when hovering stationary
    const fy = ctx.PHYSICS.externalForce.y;
    assert.ok(fy < 0, `Expected net downward force, got ${fy}`);
    assert.ok(Math.abs(ctx.PHYSICS.externalForce.x) < 1,
        `Expected near-zero X force, got ${ctx.PHYSICS.externalForce.x}`);
    assert.ok(Math.abs(ctx.PHYSICS.externalForce.z) < 1,
        `Expected near-zero Z force, got ${ctx.PHYSICS.externalForce.z}`);
});

test('calculateAerodynamics – full throttle produces positive thrust', () => {
    // Level flight aligned with -Z axis (aircraft forward = -Z in world)
    const ctx = makeCtx({ throttle: 1.0, position: new THREE.Vector3(0, 500, 0) });
    calculateAerodynamics(ctx);
    // Forward thrust is along -Z in world space (quaternion identity, forward = (0,0,-1))
    const fz = ctx.PHYSICS.externalForce.z;
    assert.ok(fz < 0, `Expected thrust along -Z, got ${fz}`);
    // Thrust magnitude should be close to maxThrust
    assert.ok(Math.abs(fz) > AIRCRAFT.maxThrust * 0.5,
        `Expected substantial thrust, got ${fz}`);
});

test('calculateAerodynamics – aircraft far above terrain is not onGround', () => {
    const ctx = makeCtx({ position: new THREE.Vector3(0, 500, 0) });
    calculateAerodynamics(ctx);
    assert.equal(ctx.PHYSICS.onGround, false);
});

test('calculateAerodynamics – aircraft at terrain level is onGround', () => {
    // Position at gear height exactly on the flat terrain (y=0)
    // Gear penetrates terrain → onGround = true
    const ctx = makeCtx({
        position: new THREE.Vector3(0, AIRCRAFT.gearHeight, 0),
        velocity: new THREE.Vector3(0, 0, 0)
    });
    calculateAerodynamics(ctx);
    assert.equal(ctx.PHYSICS.onGround, true);
});

test('calculateAerodynamics – high AoA sets isStalling flag', () => {
    // Tilt nose way up: rotate ~45° pitch up around X in body frame.
    // In THREE, Y-up world: pitch up = rotate around +X axis.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 4, 0, 0));
    // Assign sufficient airspeed to get a non-zero AoA calculation
    const ctx = makeCtx({
        position: new THREE.Vector3(0, 500, 0),
        velocity: new THREE.Vector3(0, 0, -100),   // flying forward
        quaternion: q,
        airspeed: 100
    });
    calculateAerodynamics(ctx);
    assert.equal(ctx.PHYSICS.isStalling, true, 'Expected stall at extreme pitch angle');
});

test('calculateAerodynamics – straight level cruise below stall angle is not stalling', () => {
    const ctx = makeCtx({
        position: new THREE.Vector3(0, 500, 0),
        velocity: new THREE.Vector3(0, 0, -200),   // fast cruise
        airspeed: 200
    });
    calculateAerodynamics(ctx);
    assert.equal(ctx.PHYSICS.isStalling, false, 'Should not stall in level cruise');
});

test('calculateAerodynamics – gearTransition increments when gear is down', () => {
    const ctx = makeCtx({
        position: new THREE.Vector3(0, 500, 0),
        gearDown: true,
        gearTransition: 0.5   // mid-transition
    });
    calculateAerodynamics(ctx);
    assert.ok(ctx.PHYSICS.gearTransition > 0.5,
        `gearTransition should increase when gearDown=true, got ${ctx.PHYSICS.gearTransition}`);
});

test('calculateAerodynamics – gearTransition decrements when gear is up', () => {
    // Point the aircraft perpendicular to the runway (east) so it is NOT in the
    // approach cone and the gear automation leaves gearDown=false as seeded.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
    const ctx = makeCtx({
        position: new THREE.Vector3(0, 500, 0),
        quaternion: q,
        gearDown: false,
        gearTransition: 0.5   // mid-transition
    });
    calculateAerodynamics(ctx);
    assert.ok(ctx.PHYSICS.gearTransition < 0.5,
        `gearTransition should decrease when gearDown=false, got ${ctx.PHYSICS.gearTransition}`);
});

test('calculateAerodynamics – spoilers are auto-deployed on ground at idle', () => {
    // The onGround branch that auto-deploys spoilers reads `p.onGround` at the *top*
    // of the function (i.e., the value set on the previous physics tick).  Seed it
    // true so the idle-ground branch fires, and place the aircraft at gear height so
    // the wheel spring loop also registers contact within the same call.
    const ctx = makeCtx({
        position: new THREE.Vector3(0, AIRCRAFT.gearHeight, 0),
        throttle: 0,
        velocity: new THREE.Vector3(0, 0, 0),
        onGround: true   // previous-frame value
    });
    calculateAerodynamics(ctx);
    assert.equal(ctx.PHYSICS.spoilers, true, 'Spoilers should auto-deploy on ground at idle');
    assert.equal(ctx.PHYSICS.brakes, true, 'Brakes should auto-apply on ground at idle');
});

test('calculateAerodynamics – gForce is finite', () => {
    const ctx = makeCtx({ position: new THREE.Vector3(0, 500, 0) });
    calculateAerodynamics(ctx);
    assert.ok(Number.isFinite(ctx.PHYSICS.gForce), `gForce should be finite, got ${ctx.PHYSICS.gForce}`);
});

test('solveStabilityTorques – neutral aileron damps existing roll rate', () => {
    const ctx = makeCtx({
        airspeed: 120,
        aileron: 0,
        elevator: 0,
        rudder: 0,
        aoa: 0,
        slip: 0,
        onGround: false
    });
    const localVel = new THREE.Vector3(0, 0, -120);
    const angVelLocal = new THREE.Vector3(0, 0, 0.8);
    const torque = solveStabilityTorques(ctx, localVel, angVelLocal, 1.0);
    assert.ok(torque.z < 0, `Expected negative roll torque to arrest positive roll rate, got ${torque.z}`);
});

test('solveStabilityTorques – opposite aileron increases roll-rate braking', () => {
    const localVel = new THREE.Vector3(0, 0, -80);
    const angVelLocal = new THREE.Vector3(0, 0, 0.25);

    const neutralCtx = makeCtx({
        airspeed: 80,
        aileron: 0,
        elevator: 0,
        rudder: 0,
        aoa: 0,
        slip: 0,
        onGround: false
    });
    const oppositeCtx = makeCtx({
        airspeed: 80,
        aileron: 1,
        elevator: 0,
        rudder: 0,
        aoa: 0,
        slip: 0,
        onGround: false
    });

    const neutralTorqueZ = solveStabilityTorques(neutralCtx, localVel, angVelLocal, 1.0).z;
    const oppositeTorqueZ = solveStabilityTorques(oppositeCtx, localVel, angVelLocal, 1.0).z;
    assert.ok(
        oppositeTorqueZ < neutralTorqueZ,
        `Opposite aileron should command stronger negative roll torque (${oppositeTorqueZ} vs ${neutralTorqueZ})`
    );
});

test('solveStabilityTorques – pitch/yaw damping increases with airspeed', () => {
    const angVelLocal = new THREE.Vector3(0.5, 0.5, 0);
    const speedFactor = 1.0;

    const lowSpeedCtx = makeCtx({
        airspeed: 35,
        aileron: 0,
        elevator: 0,
        rudder: 0,
        aoa: 0,
        slip: 0,
        onGround: false
    });
    const highSpeedCtx = makeCtx({
        airspeed: 180,
        aileron: 0,
        elevator: 0,
        rudder: 0,
        aoa: 0,
        slip: 0,
        onGround: false
    });

    const lowTorque = solveStabilityTorques(lowSpeedCtx, new THREE.Vector3(0, 0, -35), angVelLocal, speedFactor);
    const lowX = lowTorque.x;
    const lowY = lowTorque.y;
    const highTorque = solveStabilityTorques(highSpeedCtx, new THREE.Vector3(0, 0, -180), angVelLocal, speedFactor);
    const highX = highTorque.x;
    const highY = highTorque.y;
    assert.ok(highX < lowX, `Expected stronger high-speed pitch damping (${highX} vs ${lowX})`);
    assert.ok(highY < lowY, `Expected stronger high-speed yaw damping (${highY} vs ${lowY})`);
});

test('solveStabilityTorques – aileron input introduces adverse yaw moment', () => {
    const localVel = new THREE.Vector3(0, 0, -110);
    const angVelLocal = new THREE.Vector3(0, 0, 0);
    const speedFactor = 1.0;

    const neutralCtx = makeCtx({
        airspeed: 110,
        aileron: 0,
        elevator: 0,
        rudder: 0,
        aoa: 0,
        slip: 0,
        onGround: false
    });
    const rollInputCtx = makeCtx({
        airspeed: 110,
        aileron: 0.7,
        elevator: 0,
        rudder: 0,
        aoa: 0,
        slip: 0,
        onGround: false
    });

    const neutralYaw = solveStabilityTorques(neutralCtx, localVel, angVelLocal, speedFactor).y;
    const rollInputYaw = solveStabilityTorques(rollInputCtx, localVel, angVelLocal, speedFactor).y;
    assert.notEqual(rollInputYaw, neutralYaw, 'Aileron input should alter yaw torque for adverse yaw coupling');
});

test('solveStabilityTorques – roll rate contributes yaw coupling', () => {
    const localVel = new THREE.Vector3(0, 0, -120);
    const speedFactor = 1.0;
    const neutralRateCtx = makeCtx({
        airspeed: 120,
        aileron: 0,
        elevator: 0,
        rudder: 0,
        aoa: 0,
        slip: 0,
        onGround: false
    });
    const rollingCtx = makeCtx({
        airspeed: 120,
        aileron: 0,
        elevator: 0,
        rudder: 0,
        aoa: 0,
        slip: 0,
        onGround: false
    });

    const noRollYaw = solveStabilityTorques(neutralRateCtx, localVel, new THREE.Vector3(0, 0, 0), speedFactor).y;
    const withRollRateYaw = solveStabilityTorques(rollingCtx, localVel, new THREE.Vector3(0, 0, 0.6), speedFactor).y;
    assert.notEqual(withRollRateYaw, noRollYaw, 'Roll rate should contribute to yaw coupling');
});

test('solveStabilityTorques – ground rudder authority is suppressed at taxi speed', () => {
    const lowTaxiCtx = makeCtx({
        airspeed: 12,
        aileron: 0,
        elevator: 0,
        rudder: 1.0,
        aoa: 0,
        slip: 0,
        onGround: true
    });
    const higherSpeedCtx = makeCtx({
        airspeed: 90,
        aileron: 0,
        elevator: 0,
        rudder: 1.0,
        aoa: 0,
        slip: 0,
        onGround: true
    });

    const lowTaxiYaw = solveStabilityTorques(
        lowTaxiCtx,
        new THREE.Vector3(0, 0, -12),
        new THREE.Vector3(0, 0, 0),
        0.28
    ).y;
    const higherSpeedYaw = solveStabilityTorques(
        higherSpeedCtx,
        new THREE.Vector3(0, 0, -90),
        new THREE.Vector3(0, 0, 0),
        1.1
    ).y;

    assert.ok(Math.abs(lowTaxiYaw) < 1000, `Low-speed ground rudder torque should be minimal, got ${lowTaxiYaw}`);
    assert.ok(Math.abs(higherSpeedYaw) > Math.abs(lowTaxiYaw), 'Ground rudder authority should increase with speed');
});

// ── Approach-Cone Gear Automation ────────────────────────────────────────────
// Runway thresholds: Z = -2000 and Z = +2000. Runway axis along Z.
// Approach cone: 15° half-angle. Arm altitude: 1200 m AGL. Radius: 12000 m.

test('gear – deploys when on approach (low altitude, aligned, within radius)', () => {
    // Position 8 km south of threshold A (Z = -2000), so aircraft is at Z = -10000.
    // Aircraft faces north-ish (toward threshold A, heading = 0°, +Z direction in world).
    // In Three.js the aircraft's forward is (0,0,-1) in local space.
    // To make the aircraft face +Z we rotate 180° around Y.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
    const ctx = makeCtx({
        position: new THREE.Vector3(0, 400, -10000),  // 400 m AGL, 8 km out
        quaternion: q,
        onGround: false,
        gearDown: false,
    });
    calculateAerodynamics(ctx);
    assert.equal(ctx.PHYSICS.gearDown, true, 'Gear should deploy on approach');
});

test('gear – stays retracted above arm altitude even when aligned with runway', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
    const ctx = makeCtx({
        position: new THREE.Vector3(0, 1500, -10000), // 1500 m AGL — above 1200 arm alt
        quaternion: q,
        onGround: false,
        gearDown: false,
    });
    calculateAerodynamics(ctx);
    assert.equal(ctx.PHYSICS.gearDown, false, 'Gear should stay up above arm altitude');
});

test('gear – stays retracted when below arm altitude but pointing 90° off runway axis', () => {
    // Aircraft at low altitude, 8 km from threshold A, but heading east (perpendicular)
    // East = rotate -90° around Y → local -Z maps to world +X.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
    const ctx = makeCtx({
        position: new THREE.Vector3(0, 400, -10000),
        quaternion: q,
        onGround: false,
        gearDown: false,
    });
    calculateAerodynamics(ctx);
    assert.equal(ctx.PHYSICS.gearDown, false, 'Gear should stay up when off-axis');
});

test('gear – always down when on ground (regression)', () => {
    const ctx = makeCtx({
        position: new THREE.Vector3(0, AIRCRAFT.gearHeight, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        onGround: true,
        gearDown: false,
    });
    calculateAerodynamics(ctx);
    assert.equal(ctx.PHYSICS.gearDown, true, 'Gear must stay down when on ground');
});
