// @ts-check

/** @typedef {typeof import('three')} ThreeNamespace */

/**
 * @typedef PhysicsTmpCache
 * @property {import('three').Euler} euler
 * @property {import('three').Vector3} forward
 * @property {import('three').Vector3} right
 * @property {import('three').Vector3} up
 * @property {import('three').Quaternion} invQ
 * @property {import('three').Vector3} localVel
 * @property {import('three').Vector3} lift
 * @property {import('three').Vector3} side
 * @property {import('three').Vector3} drag
 * @property {import('three').Vector3} thrust
 * @property {import('three').Vector3} weight
 * @property {import('three').Vector3} net
 * @property {import('three').Vector3} accel
 * @property {import('three').Vector3} specific
 * @property {import('three').Vector3} gravityVec
 * @property {import('three').Vector3} airVel
 * @property {import('three').Vector3} torqueLocal
 * @property {import('three').Vector3} torqueWorld
 * @property {import('three').Vector3} angVelLocal
 * @property {import('three').Vector3} worldUp
 * @property {import('three').Vector3} wheelForce
 * @property {import('three').Vector3} wheelForceSum
 * @property {import('three').Vector3} wheelTorqueSum
 * @property {import('three').Vector3} wheelOffset
 * @property {import('three').Vector3} wheelPointVel
 * @property {import('three').Vector3} wheelForwardBase
 * @property {import('three').Vector3} wheelRightBase
 * @property {import('three').Vector3} wheelForward
 * @property {import('three').Vector3} wheelRight
 * @property {import('three').Vector3} wheelLongForce
 * @property {import('three').Vector3} wheelLatForce
 * @property {import('three').Vector3} wheelTmpCross
 * @property {import('three').Vector3} gearLocalL
 * @property {import('three').Vector3} gearLocalR
 * @property {import('three').Vector3} gearLocalN
 * @property {import('three').Vector3} gearWorldL
 * @property {import('three').Vector3} gearWorldR
 * @property {import('three').Vector3} gearWorldN
 */

/**
 * @param {ThreeNamespace} THREE
 * @returns {PhysicsTmpCache}
 */
export function getPhysicsTmp(THREE) {
    if (globalThis._physicsTmp) return globalThis._physicsTmp;
    globalThis._physicsTmp = {
        euler: new THREE.Euler(),
        forward: new THREE.Vector3(),
        right: new THREE.Vector3(),
        up: new THREE.Vector3(),
        invQ: new THREE.Quaternion(),
        localVel: new THREE.Vector3(),
        lift: new THREE.Vector3(),
        side: new THREE.Vector3(),
        drag: new THREE.Vector3(),
        thrust: new THREE.Vector3(),
        weight: new THREE.Vector3(),
        net: new THREE.Vector3(),
        accel: new THREE.Vector3(),
        specific: new THREE.Vector3(),
        gravityVec: new THREE.Vector3(),
        airVel: new THREE.Vector3(),
        torqueLocal: new THREE.Vector3(),
        torqueWorld: new THREE.Vector3(),
        angVelLocal: new THREE.Vector3(),
        worldUp: new THREE.Vector3(0, 1, 0),
        wheelForce: new THREE.Vector3(),
        wheelForceSum: new THREE.Vector3(),
        wheelTorqueSum: new THREE.Vector3(),
        wheelOffset: new THREE.Vector3(),
        wheelPointVel: new THREE.Vector3(),
        wheelForwardBase: new THREE.Vector3(),
        wheelRightBase: new THREE.Vector3(),
        wheelForward: new THREE.Vector3(),
        wheelRight: new THREE.Vector3(),
        wheelLongForce: new THREE.Vector3(),
        wheelLatForce: new THREE.Vector3(),
        wheelTmpCross: new THREE.Vector3(),
        gearLocalL: new THREE.Vector3(-4.8, -3.3, 1.5),
        gearLocalR: new THREE.Vector3(4.8, -3.3, 1.5),
        gearLocalN: new THREE.Vector3(0.0, -3.0, -9.2),
        gearWorldL: new THREE.Vector3(),
        gearWorldR: new THREE.Vector3(),
        gearWorldN: new THREE.Vector3()
    };
    return globalThis._physicsTmp;
}
