import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { calculateAerodynamics } from '../js/modules/physics/updatePhysics.js';

function createMockContext() {
    const physics = {
        position: new THREE.Vector3(0, 100, 0),
        quaternion: new THREE.Quaternion(),
        velocity: new THREE.Vector3(0, 0, -50), // 50 m/s forward
        angularVelocity: new THREE.Vector3(0, 0, 0),
        externalForce: new THREE.Vector3(),
        externalTorque: new THREE.Vector3(),
        throttle: 0,
        airspeed: 50,
        heightAgl: 100,
        dt: 1 / 60,
        gearDown: false,
        targetFlaps: 0,
        onGround: false,
        elevator: 0,
        aileron: 0,
        rudder: 0,
        flaps: 0,
        gearTransition: 0,
        spoilers: false,
        brakes: false,
        rho: 1.225,
        gravity: 9.81,
        aoa: 0,
        slip: 0,
        isStalling: false,
        gForce: 1
    };

    const aircraft = {
        gearHeight: 2,
        cdBase: 0.02,
        clSlope: 0.1,
        stallAngle: 15,
        wingArea: 20,
        mass: 1000,
        maxThrust: 5000
    };

    const weather = { windX: 0, windZ: 0 };

    const keys = {
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false,
        q: false,
        e: false,
        z: false,
        a: false
    };

    const gearGroup = {
        position: new THREE.Vector3(),
        scale: new THREE.Vector3(1, 1, 1),
        visible: true
    };

    const planeGroup = {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion()
    };

    return {
        THREE,
        PHYSICS: physics,
        AIRCRAFT: aircraft,
        WEATHER: weather,
        keys,
        getTerrainHeight: (x, z) => 0, // Flat terrain at y=0
        gearGroup,
        planeGroup,
        Noise: {}
    };
}

test('calculateAerodynamics handles ground interaction and auto-flaps', () => {
    const ctx = createMockContext();
    const p = ctx.PHYSICS;

    // Set position completely on the ground to trigger wheel contact
    // wheelClearance is 0.28, gearLocalN.y is -3.0
    // So the plane must be positioned such that penetration > 0
    p.position.y = ctx.AIRCRAFT.gearHeight;

    // To get p.onGround = true, at least one wheel must be penetrating the terrain.
    // wheel.world.y = p.position.y + gearLocalN.y = 2 - 3.0 = -1.0
    // terrainY = 0
    // penetration = (0 + 0.28) - (-1.0) = 1.28 > 0 -> onGround will be true
    p.velocity.set(0, 0, -10); // 10 m/s
    p.throttle = 0.6; // Above arm throttle (0.55)

    // Setting this to true manually first to test the logic that requires it to be true
    // from the *start* of the frame (like gearDown and targetFlaps changes)
    p.onGround = true;

    calculateAerodynamics(ctx);

    assert.equal(p.heightAgl, 0, 'heightAgl should be 0 when on ground');
    assert.equal(p.onGround, true, 'onGround should be maintained true by wheel contacts');
    assert.equal(p.gearDown, true, 'gearDown should be forced true on ground');

    // FLIGHT_TUNING.takeoffAutoFlaps is 0.22
    assert.ok(p.targetFlaps >= 0.22, 'targetFlaps should be set for takeoff');
});

test('calculateAerodynamics cleans up config when climbing away', () => {
    const ctx = createMockContext();
    const p = ctx.PHYSICS;

    p.position.y = 200; // Above 150m
    p.velocity.set(0, 5, -50); // Climbing
    p.throttle = 0.8;
    p.gearDown = true;
    p.targetFlaps = 0.5;

    calculateAerodynamics(ctx);

    assert.equal(p.gearDown, false, 'gear should auto-retract when climbing safely');
    assert.equal(p.targetFlaps, 0, 'flaps should auto-retract when climbing safely');
});

test('calculateAerodynamics applies manual controls smoothly', () => {
    const ctx = createMockContext();
    const p = ctx.PHYSICS;

    ctx.keys.ArrowUp = true; // Elevator up
    ctx.keys.ArrowRight = true; // Aileron right
    ctx.keys.e = true; // Rudder right

    // Initial state is 0
    calculateAerodynamics(ctx);

    assert.ok(p.elevator < 0, 'elevator should move towards -1 (up)');
    assert.ok(p.aileron > 0, 'aileron should move towards 1 (right)');
    assert.ok(p.rudder > 0, 'rudder should move towards 1 (right)');
});

test('calculateAerodynamics calculates lift and drag forces', () => {
    const ctx = createMockContext();
    const p = ctx.PHYSICS;

    // Pitch up slightly to generate AoA
    p.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 18); // 10 degrees pitch up
    p.velocity.set(0, 0, -50); // Moving forward

    calculateAerodynamics(ctx);

    // With 10 degrees pitch up and forward velocity, AoA is 10 degrees
    // We expect lift (upward force) and drag (backward force)
    assert.ok(p.externalForce.y > 0, 'should generate positive lift force');
    assert.ok(p.externalForce.z > 0, 'should generate drag opposing forward motion (-z)');
    assert.ok(p.aoa > 0, 'should have positive angle of attack');
    assert.equal(p.isStalling, false, 'should not be stalling at 10 degrees');
});

test('calculateAerodynamics detects stall and reduces lift', () => {
    const ctx = createMockContext();
    const p = ctx.PHYSICS;

    // Pitch up heavily to stall
    p.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 6); // 30 degrees pitch up
    p.velocity.set(0, 0, -50); // Moving forward

    calculateAerodynamics(ctx);

    assert.equal(p.isStalling, true, 'should be stalling at 30 degrees AoA (stall angle is 15)');
    assert.ok(p.aoa > ctx.AIRCRAFT.stallAngle * Math.PI / 180, 'AoA should exceed stall angle');
});

test('calculateAerodynamics simulates ground effect', () => {
    const ctxAir = createMockContext();
    const ctxGround = createMockContext();

    // Both moving forward with slight pitch up
    ctxAir.PHYSICS.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 36); // 5 degrees
    ctxAir.PHYSICS.velocity.set(0, 0, -50);
    ctxAir.PHYSICS.position.y = 1000; // High in air

    ctxGround.PHYSICS.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 36);
    ctxGround.PHYSICS.velocity.set(0, 0, -50);
    ctxGround.PHYSICS.position.y = 5; // Close to ground (ground effect < 30m)

    calculateAerodynamics(ctxAir);
    calculateAerodynamics(ctxGround);

    // Lift should be higher in ground effect
    const liftAir = ctxAir.PHYSICS.externalForce.y;
    const liftGround = ctxGround.PHYSICS.externalForce.y;

    assert.ok(liftGround > liftAir, 'lift should be greater when in ground effect');
});
