// @ts-check

import { getPhysicsTmp } from './PhysicsUtils.js';

/**
 * @typedef GroundPhysicsLike
 * @property {boolean} gearDown
 * @property {number} gearTransition
 * @property {import('three').Quaternion} quaternion
 * @property {import('three').Vector3} position
 * @property {import('three').Vector3} angularVelocity
 * @property {import('three').Vector3} velocity
 * @property {number} airspeed
 * @property {boolean} brakes
 * @property {number} rudder
 */

/**
 * @typedef GroundAircraftLike
 * @property {{ gears?: Array<{ animGroup: import('three').Object3D & { userData: { hingeAxis: import('three').Vector3 } }, type: string }> }} movableSurfaces
 */

/**
 * @typedef GroundContext
 * @property {GroundPhysicsLike} PHYSICS
 * @property {GroundAircraftLike} AIRCRAFT
 * @property {typeof import('three')} THREE
 * @property {(x: number, z: number) => number} getTerrainHeight
 */

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/** @param {number} t */
function smoothstep01(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * @param {GroundPhysicsLike} p
 * @param {GroundAircraftLike} AIRCRAFT
 * @param {number} dt
 * @returns {void}
 */
export function updateGearAnimation(p, AIRCRAFT, dt) {
    if (p.gearDown && p.gearTransition < 1.0) p.gearTransition = Math.min(1.0, p.gearTransition + dt * 0.2);
    if (!p.gearDown && p.gearTransition > 0.0) p.gearTransition = Math.max(0.0, p.gearTransition - dt * 0.2);

    const gT = 1.0 - p.gearTransition; // 1.0 when UP
    if (AIRCRAFT.movableSurfaces.gears) {
        AIRCRAFT.movableSurfaces.gears.forEach(g => {
            let angle = 0;
            if (g.type === 'nose') angle = gT * 120 * Math.PI / 180;
            else if (g.type === 'mainLH') angle = gT * 81.5 * Math.PI / 180;
            else if (g.type === 'mainRH') angle = gT * -81.5 * Math.PI / 180;
            else if (g.type === 'doorLH' || g.type === 'doorRH') {
                let doorAmt = p.gearTransition < 0.25 ? p.gearTransition / 0.25 : 1.0;
                angle = doorAmt * (g.type === 'doorLH' ? -90 : 90) * Math.PI / 180;
            }
            g.animGroup.setRotationFromAxisAngle(g.animGroup.userData.hingeAxis, angle);
        });
    }
}

/**
 * @param {GroundContext} ctx
 * @param {number} liftRatio
 */
export function solveGroundPhysics(ctx, liftRatio) {
    const { PHYSICS, AIRCRAFT, THREE, getTerrainHeight } = ctx;
    const p = PHYSICS;
    const t = getPhysicsTmp(THREE);

    const forward = t.forward.set(0, 0, -1).applyQuaternion(p.quaternion);
    const baseForward = t.wheelForwardBase.copy(forward);
    baseForward.y = 0;
    if (baseForward.lengthSq() < 1e-6) baseForward.set(0, 0, -1);
    baseForward.normalize();
    const baseRight = t.wheelRightBase.crossVectors(t.worldUp, baseForward).normalize();

    const wheelPoints = [
        { local: t.gearLocalL, isNose: false },
        { local: t.gearLocalR, isNose: false },
        { local: t.gearLocalN, isNose: true }
    ];

    const wheelForceSum = t.wheelForceSum.set(0, 0, 0);
    const wheelTorqueSum = t.wheelTorqueSum.set(0, 0, 0);
    let contactCount = 0;
    let noseWheelLoad = 0;

    for (const wheel of wheelPoints) {
        const wp = t.wheelOffset.copy(wheel.local).applyQuaternion(p.quaternion).add(p.position);
        const terrainY = getTerrainHeight(wp.x, wp.z);
        const penetration = (terrainY + 0.28) - wp.y;
        if (penetration <= 0) continue;

        contactCount++;
        const wheelOffset = t.wheelOffset.copy(wp).sub(p.position);
        const pointVel = t.wheelPointVel.copy(p.angularVelocity).cross(wheelOffset).add(p.velocity);

        const gearUnload = wheel.isNose ? 1.0 : (1.0 - liftRatio * 0.88);
        const springK = (wheel.isNose ? 900000 : 1200000) * gearUnload;
        const damperC = (wheel.isNose ? 140000 : 190000) * gearUnload;
        const normMag = Math.max(0, penetration * springK - pointVel.y * damperC);
        if (wheel.isNose) noseWheelLoad = normMag;

        let wFwd = t.wheelForward.copy(baseForward);
        let wRight = t.wheelRight.copy(baseRight);
        if (wheel.isNose) {
            const steerBlend = smoothstep01((p.airspeed - 18) / 52);
            const steerAuthority = 1.0 - steerBlend;
            const steerAngle = -p.rudder * 0.62 * steerAuthority;
            wFwd.applyAxisAngle(t.worldUp, steerAngle).normalize();
            wRight.crossVectors(t.worldUp, wFwd).normalize();
        }

        const longVel = pointVel.dot(wFwd);
        const latVel = pointVel.dot(wRight);
        const rolloutBlend = smoothstep01((p.airspeed - 12) / 58);
        const highSpeedBlend = smoothstep01((p.airspeed - 45) / 45);
        const muLong = p.brakes ? 0.95 : 0.12;
        const muLat = wheel.isNose
            ? lerp(1.05, 0.38, highSpeedBlend)
            : lerp(0.52, 0.74, rolloutBlend);
        const longDamp = p.brakes ? 220000 : 42000;
        const latDamp = wheel.isNose
            ? lerp(210000, 90000, highSpeedBlend)
            : lerp(76000, 128000, rolloutBlend);

        let fLong = Math.max(-normMag * muLong, Math.min(normMag * muLong, -longVel * longDamp));
        let fLat = Math.max(-normMag * muLat, Math.min(normMag * muLat, -latVel * latDamp));

        const totalF = t.wheelForce.set(0, normMag, 0).add(t.wheelLongForce.copy(wFwd).multiplyScalar(fLong)).add(t.wheelLatForce.copy(wRight).multiplyScalar(fLat));
        wheelForceSum.add(totalF);
        wheelTorqueSum.add(t.wheelTmpCross.copy(wheelOffset).cross(totalF));
    }

    return { wheelForceSum, wheelTorqueSum, contactCount, noseWheelLoad };
}
