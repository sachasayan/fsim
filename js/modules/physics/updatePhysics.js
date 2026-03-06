import { getPhysicsTmp } from './PhysicsUtils.js';
import { solveAerodynamics, solveStabilityTorques, FLIGHT_TUNING } from './AeroSolver.js';
import { solveGroundPhysics, updateGearAnimation } from './GroundPhysics.js';

export function calculateAerodynamics(ctx) {
    const { THREE, PHYSICS, AIRCRAFT, WEATHER, keys, getTerrainHeight } = ctx;
    const p = PHYSICS;
    const t = getPhysicsTmp(THREE);

    // Ground Interaction setup (needed early for ground effect)
    let _terrainY = getTerrainHeight(p.position.x, p.position.z);
    const groundY = _terrainY + AIRCRAFT.gearHeight;
    p.heightAgl = Math.max(0, p.position.y - groundY);

    // Automation & Input Cleanup
    if (!p.onGround && p.heightAgl > 150 && p.throttle > 0.5 && p.velocity.y > 0) {
        p.gearDown = false;
        p.targetFlaps = 0.0;
    }
    if (p.onGround) {
        p.gearDown = true;
        if (p.throttle >= 0.55 && p.airspeed < 72) p.targetFlaps = Math.max(p.targetFlaps, 0.22);
        if (p.airspeed < 40 && p.throttle <= 0.02) p.targetFlaps = 0.0;
    }

    // Input Handling
    let targetElevator = (keys.ArrowUp ? -1 : 0) + (keys.ArrowDown ? 1 : 0);
    let targetAileron = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    let targetRudder = (keys.q ? -1 : 0) + (keys.e ? 1 : 0);

    p.spoilers = (p.onGround && p.throttle <= 0.02);
    p.brakes = (p.onGround && p.throttle <= 0.02);

    p.elevator += (targetElevator - p.elevator) * 8.0 * p.dt;
    p.aileron += (targetAileron - p.aileron) * 8.0 * p.dt;
    p.rudder += (targetRudder - p.rudder) * 8.0 * p.dt;
    p.flaps += (p.targetFlaps - p.flaps) * 1.5 * p.dt;

    if (keys.z) p.throttle = Math.max(0.0, p.throttle - 2.0 * p.dt);
    if (keys.a) p.throttle = Math.min(1.0, p.throttle + 2.0 * p.dt);

    updateGearAnimation(p, AIRCRAFT, p.dt);

    // Kinematics
    const airVel = t.airVel.set(p.velocity.x - (WEATHER.windX ?? 0), p.velocity.y, p.velocity.z - (WEATHER.windZ ?? 0));
    p.airspeed = airVel.length();
    const invQ = t.invQ.copy(p.quaternion).invert();
    const localVel = t.localVel.copy(airVel).applyQuaternion(invQ);

    // Solve Aero
    const { liftForce, sideForce, dragForce, thrustForce, liftRatio } = solveAerodynamics(ctx, airVel, localVel);

    // Solve Ground
    const { wheelForceSum, wheelTorqueSum, contactCount, noseWheelLoad } = solveGroundPhysics(ctx, liftRatio);
    p.onGround = contactCount > 0;

    // Forces
    const weightForce = t.weight.set(0, -AIRCRAFT.mass * p.gravity, 0);
    const netForce = t.net.set(0, 0, 0).add(liftForce).add(sideForce).add(dragForce).add(thrustForce).add(weightForce).add(wheelForceSum);

    // Torques
    const angVelLocal = t.angVelLocal.copy(p.angularVelocity).applyQuaternion(invQ);
    const speedFactor = p.onGround ? Math.max(0.28, Math.min(1.1, p.airspeed / 75)) : Math.max(0.12, Math.min(1.2, (p.airspeed - 20) / 120));
    const torqueLocal = solveStabilityTorques(ctx, localVel, angVelLocal, speedFactor);

    p.externalTorque.set(0, 0, 0).add(wheelTorqueSum).add(t.torqueWorld.copy(torqueLocal).applyQuaternion(p.quaternion));
    if (noseWheelLoad > 0) {
        const taxiFactor = Math.max(0, Math.min(1, (95 - p.airspeed) / 85));
        p.externalTorque.y += -p.rudder * noseWheelLoad * 0.28 * taxiFactor;
    }

    // Acceleration & G-Factor
    const up = t.up.set(0, 1, 0).applyQuaternion(p.quaternion);
    const accel = t.accel.copy(netForce).divideScalar(AIRCRAFT.mass);
    const specific = t.specific.copy(accel).sub(t.gravityVec.set(0, -p.gravity, 0));
    p.gForce = specific.dot(up) / p.gravity;
    if (!Number.isFinite(p.gForce)) p.gForce = 1.0;
    p.externalForce.copy(netForce);
    // Update Three.js object left to the main sim loop for visual interpolation
}
