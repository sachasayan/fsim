import { getPhysicsTmp } from './PhysicsUtils.js';
import { solveAerodynamics, solveStabilityTorques, FLIGHT_TUNING } from './AeroSolver.js';
import { solveGroundPhysics, updateGearAnimation } from './GroundPhysics.js';

// ── Approach-Cone constants ──────────────────────────────────────────────────
// The runway sits at world origin, oriented along the Z axis (±Z).
// Threshold A is at Z = -2000 (aircraft approaches from -Z, heading ~0°)
// Threshold B is at Z = +2000 (aircraft approaches from +Z, heading ~180°)
const _RUNWAY_THRESHOLDS = [
    { x: 0, z: -2000 },   // runway end A — approach from south
    { x: 0, z: 2000 },   // runway end B — approach from north
];
const _APPROACH_RADIUS = 12000;  // m — horizontal distance to check
const _APPROACH_RADIUS_SQ = _APPROACH_RADIUS * _APPROACH_RADIUS;
const _APPROACH_ALT_MAX = 1200;   // m AGL — arm gear only below this
const _APPROACH_CONE_COS = Math.cos(15 * Math.PI / 180); // cos(15°)

export function calculateAerodynamics(ctx) {
    const { THREE, PHYSICS, AIRCRAFT, WEATHER, keys, getTerrainHeight } = ctx;
    const p = PHYSICS;
    const t = getPhysicsTmp(THREE);

    // Ground Interaction setup (needed early for ground effect)
    let _terrainY = getTerrainHeight(p.position.x, p.position.z);
    const groundY = _terrainY + AIRCRAFT.gearHeight;
    p.heightAgl = Math.max(0, p.position.y - groundY);

    // ── Approach-Cone Gear Automation ───────────────────────────────────────
    // Gear is down when: on the ground, OR on approach to a runway.
    // On approach = below arm altitude AND inside the horizontal radius of a
    // threshold AND aircraft heading is within 15° of the runway axis.
    if (p.onGround) {
        p.gearDown = true;
    } else if (p.heightAgl < _APPROACH_ALT_MAX) {
        // Compute current heading as a unit vector in the XZ plane.
        // Aircraft forward is (0,0,-1) in local space; transform to world.
        const t2 = getPhysicsTmp(THREE);
        const fwd = t2.forward.set(0, 0, -1).applyQuaternion(p.quaternion);
        const hx = fwd.x;
        const hz = fwd.z;
        // ⚡ Bolt: Defer Math.sqrt by checking squared length first
        const hLenSq = hx * hx + hz * hz;

        let onApproach = false;
        if (hLenSq > 1e-8) {
            const hLen = Math.sqrt(hLenSq);
            const nhx = hx / hLen;
            const nhz = hz / hLen;
            for (const thr of _RUNWAY_THRESHOLDS) {
                const dx = p.position.x - thr.x;
                const dz = p.position.z - thr.z;
                // ⚡ Bolt: Use squared distance to avoid Math.sqrt on every threshold check
                const distSq = dx * dx + dz * dz;
                if (distSq > _APPROACH_RADIUS_SQ) continue;

                const dist2D = Math.sqrt(distSq);

                // Vector FROM aircraft TOWARD the threshold (approach direction)
                const ax = -dx / dist2D;
                const az = -dz / dist2D;
                const dot = nhx * ax + nhz * az;
                if (dot >= _APPROACH_CONE_COS) {
                    onApproach = true;
                    break;
                }
            }
        }
        p.gearDown = onApproach;
    } else {
        p.gearDown = false;
    }

    // Ground flap automation
    if (p.onGround) {
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
    const { wheelForceSum, wheelTorqueSum, contactCount } = solveGroundPhysics(ctx, liftRatio);
    p.onGround = contactCount > 0;

    // Forces
    const weightForce = t.weight.set(0, -AIRCRAFT.mass * p.gravity, 0);
    const netForce = t.net.set(0, 0, 0).add(liftForce).add(sideForce).add(dragForce).add(thrustForce).add(weightForce).add(wheelForceSum);

    // Torques
    const angVelLocal = t.angVelLocal.copy(p.angularVelocity).applyQuaternion(invQ);
    const speedFactor = p.onGround ? Math.max(0.28, Math.min(1.1, p.airspeed / 75)) : Math.max(0.12, Math.min(1.2, (p.airspeed - 20) / 120));
    const torqueLocal = solveStabilityTorques(ctx, localVel, angVelLocal, speedFactor);

    p.externalTorque.set(0, 0, 0).add(wheelTorqueSum).add(t.torqueWorld.copy(torqueLocal).applyQuaternion(p.quaternion));

    // Acceleration & G-Factor
    const up = t.up.set(0, 1, 0).applyQuaternion(p.quaternion);
    const accel = t.accel.copy(netForce).divideScalar(AIRCRAFT.mass);
    const specific = t.specific.copy(accel).sub(t.gravityVec.set(0, -p.gravity, 0));
    p.gForce = specific.dot(up) / p.gravity;
    if (!Number.isFinite(p.gForce)) p.gForce = 1.0;
    p.externalForce.copy(netForce);
    // Update Three.js object left to the main sim loop for visual interpolation
}
