import { getPhysicsTmp } from './PhysicsUtils.js';

export const FLIGHT_TUNING = {
    controlAuthorityMultiplier: 3.2,
    sideForceSlipGain: 0.9,
    sideForceMaxCoeff: 0.45,
    groundRotationBoost: 1.35,
    rollRateGain: 460000,
    pitchDampingBase: 170000,
    yawDampingBase: 140000,
    adverseYawAileronGain: 36000,
    adverseYawRollRateGain: 52000,
    rollDampingBase: 220000,
    rollDampingQuadratic: 120000,
    maxRollRateDegLow: 35,
    maxRollRateDegHigh: 110
};

const GROUND_EFFECT_WINGSPAN = 30.0;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getTargetRollRate(airspeed, aileron) {
    const speedNorm = clamp((airspeed - 20) / 150, 0, 1);
    const maxRollRateDeg = FLIGHT_TUNING.maxRollRateDegLow
        + (FLIGHT_TUNING.maxRollRateDegHigh - FLIGHT_TUNING.maxRollRateDegLow) * speedNorm;
    return -aileron * maxRollRateDeg * (Math.PI / 180);
}

export function solveAerodynamics(ctx, airVel, localVel) {
    const { PHYSICS, AIRCRAFT, THREE } = ctx;
    const p = PHYSICS;
    const t = getPhysicsTmp(THREE);

    const up = t.up.set(0, 1, 0).applyQuaternion(p.quaternion);
    const forward = t.forward.set(0, 0, -1).applyQuaternion(p.quaternion);
    const right = t.right.set(1, 0, 0).applyQuaternion(p.quaternion);

    if (p.airspeed > 1.0) {
        p.aoa = Math.atan2(-localVel.y, -localVel.z);
        p.slip = Math.atan2(localVel.x, -localVel.z);
    } else {
        p.aoa = 0; p.slip = 0;
    }

    let currentCdBase = AIRCRAFT.cdBase + (p.flaps * 0.05) + (p.spoilers ? 0.08 : 0);
    let currentClSlope = AIRCRAFT.clSlope + (p.flaps * 0.03);
    const aoaDeg = p.aoa * (180 / Math.PI);
    p.isStalling = Math.abs(aoaDeg) > AIRCRAFT.stallAngle;

    const dynPressure = 0.5 * p.rho * p.airspeed * p.airspeed;
    const groundEffect = Math.max(0, 1.0 - (p.heightAgl / GROUND_EFFECT_WINGSPAN));

    let cl = aoaDeg * currentClSlope;
    if (p.isStalling) cl *= Math.exp(-(Math.abs(aoaDeg) - AIRCRAFT.stallAngle) * 0.22);
    let liftMag = dynPressure * AIRCRAFT.wingArea * cl * (1.0 + groundEffect * 0.15);
    if (p.spoilers) liftMag *= 0.6;

    const liftRatio = Math.min(1.0, Math.max(0, liftMag / (AIRCRAFT.mass * p.gravity)));
    const liftForce = t.lift.copy(up).multiplyScalar(liftMag);

    const sideForce = t.side.set(0, 0, 0);
    if (p.airspeed > 1.0) {
        const cy = -p.slip * FLIGHT_TUNING.sideForceSlipGain;
        const maxSide = dynPressure * AIRCRAFT.wingArea * FLIGHT_TUNING.sideForceMaxCoeff;
        const sideMag = Math.max(-maxSide, Math.min(maxSide, dynPressure * AIRCRAFT.wingArea * cy));
        sideForce.copy(right).multiplyScalar(sideMag);
    }

    let inducedDrag = (cl * cl) / (Math.PI * 8) * (1.0 - groundEffect * 0.5);
    let cd = currentCdBase + inducedDrag + (p.gearTransition * 0.015);
    if (p.isStalling) cd += 0.2;
    const dragMag = dynPressure * AIRCRAFT.wingArea * cd;
    const dragForce = t.drag.set(0, 0, 0);
    if (p.airspeed > 0.1) dragForce.copy(airVel).multiplyScalar(-dragMag / p.airspeed);

    const thrustMag = p.throttle * AIRCRAFT.maxThrust;
    const thrustForce = t.thrust.copy(forward).multiplyScalar(thrustMag);

    return { liftForce, sideForce, dragForce, thrustForce, liftRatio };
}

export function solveStabilityTorques(ctx, localVel, angVelLocal, speedFactor) {
    const { PHYSICS, THREE } = ctx;
    const p = PHYSICS;
    const t = getPhysicsTmp(THREE);

    const airspeed = Math.max(0, p.airspeed || localVel.length());
    const speedNorm = clamp((airspeed - 20) / 150, 0, 1);
    const targetRollRate = getTargetRollRate(airspeed, p.aileron);
    const rollRateError = targetRollRate - angVelLocal.z;
    const rollRateTorque = rollRateError
        * FLIGHT_TUNING.rollRateGain
        * (0.7 + 0.8 * speedNorm)
        * speedFactor;

    const torque = t.torqueLocal.set(
        p.elevator * 180000 * speedFactor * FLIGHT_TUNING.controlAuthorityMultiplier,
        -p.rudder * 120000 * speedFactor * FLIGHT_TUNING.controlAuthorityMultiplier,
        rollRateTorque
    );

    if (p.onGround) torque.x *= FLIGHT_TUNING.groundRotationBoost;

    // Stability derivatives
    torque.x += -p.aoa * 80000 * speedFactor;
    torque.y += -p.slip * 120000 * speedFactor;
    torque.z += p.slip * 60000 * speedFactor;
    // Adverse yaw: aileron deflection and roll rate create opposing yaw that
    // encourages coordinated rudder use without heavy-handed auto-coordination.
    torque.y += p.aileron * FLIGHT_TUNING.adverseYawAileronGain * speedFactor * (0.65 + 0.9 * speedNorm);
    torque.y += -angVelLocal.z * FLIGHT_TUNING.adverseYawRollRateGain * speedFactor * (0.6 + 0.8 * speedNorm);

    // Local damping
    const pitchLinearDamping = FLIGHT_TUNING.pitchDampingBase * (0.7 + 1.0 * speedNorm);
    const yawLinearDamping = FLIGHT_TUNING.yawDampingBase * (0.7 + 1.0 * speedNorm);
    torque.x += -angVelLocal.x * pitchLinearDamping;
    torque.y += -angVelLocal.y * yawLinearDamping;
    const rollLinearDamping = FLIGHT_TUNING.rollDampingBase * (0.7 + 1.3 * speedNorm);
    torque.z += -angVelLocal.z * rollLinearDamping;
    torque.z += -angVelLocal.z * Math.abs(angVelLocal.z) * FLIGHT_TUNING.rollDampingQuadratic;

    const maxPitch = 300000 * FLIGHT_TUNING.controlAuthorityMultiplier;
    const maxYaw = 780000 * FLIGHT_TUNING.controlAuthorityMultiplier;
    const maxRoll = 280000 * FLIGHT_TUNING.controlAuthorityMultiplier;
    torque.x = Math.max(-maxPitch, Math.min(maxPitch, torque.x));
    torque.y = Math.max(-maxYaw, Math.min(maxYaw, torque.y));
    torque.z = Math.max(-maxRoll, Math.min(maxRoll, torque.z));

    return torque;
}
