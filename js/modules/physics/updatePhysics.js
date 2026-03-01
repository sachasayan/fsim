let _tmp = null;

// Approximate wingspan for ground effect onset (~b metres AGL)
const GROUND_EFFECT_WINGSPAN = 30.0;

const FLIGHT_TUNING = {
    controlAuthorityMultiplier: 4.0,
    sideForceSlipGain: 0.9,
    sideForceMaxCoeff: 0.45,
    takeoffAutoFlaps: 0.22,
    takeoffArmThrottle: 0.55,
    takeoffFlapMaxSpeed: 72,
    groundRotationBoost: 1.35
};

function getTmp(THREE) {
    if (_tmp) return _tmp;
    _tmp = {
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
    return _tmp;
}

export function calculateAerodynamics(ctx) {
    const { THREE, PHYSICS, AIRCRAFT, WEATHER, keys, getTerrainHeight, gearGroup, planeGroup, Noise } = ctx;
    const p = PHYSICS;
    const t = getTmp(THREE);

    // Ground Interaction setup (needed early for ground effect)
    let _terrainY = getTerrainHeight(p.position.x, p.position.z);
    const groundY = _terrainY + AIRCRAFT.gearHeight;
    const heightAgl = p.position.y - groundY;
    p.heightAgl = Math.max(0, heightAgl);

    // Read current orientation for tracking
    const currentEuler = t.euler.setFromQuaternion(p.quaternion, 'YXZ');
    const currentPitch = currentEuler.x;
    const currentRoll = -currentEuler.z;
    const currentHeading = -currentEuler.y;

    // Clean up config if actively climbing away from ground
    if (!p.onGround && p.heightAgl > 150 && p.throttle > 0.5 && p.velocity.y > 0) {
        p.gearDown = false;
        p.targetFlaps = 0.0;
    }

    // Ensure gear is safely locked down if we are physically touching the ground
    if (p.onGround) {
        p.gearDown = true;
        // Auto-set a mild takeoff flap configuration when spooling up on runway.
        if (
            p.throttle >= FLIGHT_TUNING.takeoffArmThrottle &&
            p.airspeed < FLIGHT_TUNING.takeoffFlapMaxSpeed
        ) {
            p.targetFlaps = Math.max(p.targetFlaps, FLIGHT_TUNING.takeoffAutoFlaps);
        }
        // Clean flaps up during rollout if engines are at idle
        if (p.airspeed < 40 && p.throttle <= 0.02) {
            p.targetFlaps = 0.0;
        }
    }


    // Base manual input
    let targetElevator = (keys.ArrowUp ? -1 : 0) + (keys.ArrowDown ? 1 : 0);
    let targetAileron = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
    let targetRudder = (keys.q ? -1 : 0) + (keys.e ? 1 : 0);


    // --- AUTOMATIC SPOILERS & BRAKES ---
    // Keep arcade convenience, but avoid unrealistic in-flight auto deployment at idle thrust.
    if (p.onGround && p.throttle <= 0.02) {
        p.spoilers = true;
        p.brakes = true;
    } else {
        p.spoilers = false;
        p.brakes = false;
    }

    // Apply smoothed control surface deflections
    p.elevator += (targetElevator - p.elevator) * 8.0 * p.dt;
    p.aileron += (targetAileron - p.aileron) * 8.0 * p.dt;
    p.rudder += (targetRudder - p.rudder) * 8.0 * p.dt;
    p.flaps += (p.targetFlaps - p.flaps) * 1.5 * p.dt;

    // Manual Throttle
    if (keys.z) p.throttle = Math.max(0.0, p.throttle - 2.0 * p.dt);
    if (keys.a) p.throttle = Math.min(1.0, p.throttle + 2.0 * p.dt);

    // Gear Logic Animation
    if (p.gearDown && p.gearTransition < 1.0) p.gearTransition = Math.min(1.0, p.gearTransition + p.dt * 0.2);
    if (!p.gearDown && p.gearTransition > 0.0) p.gearTransition = Math.max(0.0, p.gearTransition - p.dt * 0.2);

    gearGroup.position.y = (1.0 - p.gearTransition) * 2; // Move up
    gearGroup.scale.y = Math.max(0.01, p.gearTransition); // Squash
    gearGroup.visible = p.gearTransition > 0;

    // Kinematics setup
    const forward = t.forward.set(0, 0, -1).applyQuaternion(p.quaternion);
    const right = t.right.set(1, 0, 0).applyQuaternion(p.quaternion);
    const up = t.up.set(0, 1, 0).applyQuaternion(p.quaternion);

    // Air-relative velocity: subtract wind from aircraft velocity before all aero calculations.
    // Wind lives in WEATHER.windX / WEATHER.windZ (m/s in world XZ, no vertical component).
    const airVel = t.airVel.set(
        p.velocity.x - (WEATHER.windX ?? 0),
        p.velocity.y,
        p.velocity.z - (WEATHER.windZ ?? 0)
    );
    p.airspeed = airVel.length();

    // Local air-relative velocity to find AoA and sideslip.
    const invQ = t.invQ.copy(p.quaternion).invert();
    const localVel = t.localVel.copy(airVel).applyQuaternion(invQ);

    if (p.airspeed > 1.0) {
        p.aoa = Math.atan2(-localVel.y, -localVel.z);
        p.slip = Math.atan2(localVel.x, -localVel.z);
    } else {
        p.aoa = 0; p.slip = 0;
    }

    // Adjust aerodynamic properties based on flaps & spoilers
    let currentCdBase = AIRCRAFT.cdBase + (p.flaps * 0.05) + (p.spoilers ? 0.08 : 0);
    let currentClSlope = AIRCRAFT.clSlope + (p.flaps * 0.03);
    let currentStallAngle = AIRCRAFT.stallAngle;

    const aoaDeg = p.aoa * (180 / Math.PI);
    p.isStalling = Math.abs(aoaDeg) > currentStallAngle;

    // Dynamics (Forces)
    let dynPressure = 0.5 * p.rho * p.airspeed * p.airspeed;

    // Ground Effect (increases lift, decreases drag near ground)
    // Onset height ≈ one wingspan (GROUND_EFFECT_WINGSPAN)
    let groundEffect = Math.max(0, 1.0 - (heightAgl / GROUND_EFFECT_WINGSPAN));

    // Lift
    let cl = aoaDeg * currentClSlope;
    // Post-stall CL decay: steeper exponent = more realistic sudden departure.
    // At 10° past stall: exp(-2.2) ≈ 0.11 residual lift (was 0.37 with exponent 0.1).
    if (p.isStalling) cl *= Math.exp(-(Math.abs(aoaDeg) - currentStallAngle) * 0.22);
    let liftMag = dynPressure * AIRCRAFT.wingArea * cl;
    liftMag *= (1.0 + groundEffect * 0.15);

    // Spoilers dump 40% of the wing's lift!
    if (p.spoilers) liftMag *= 0.6;

    // Fraction of weight carried by lift — used to unload gear springs at rotation speed.
    const liftRatio = Math.min(1.0, Math.max(0, liftMag / (AIRCRAFT.mass * p.gravity)));

    let liftForce = t.lift.copy(up).multiplyScalar(liftMag);

    // Lateral aerodynamic side force from sideslip only.
    // This damps slip and avoids game-like strafing from direct rudder side-thrust.
    const sideForce = t.side.set(0, 0, 0);
    if (p.airspeed > 1.0) {
        const cy = -p.slip * FLIGHT_TUNING.sideForceSlipGain;
        const maxSide = dynPressure * AIRCRAFT.wingArea * FLIGHT_TUNING.sideForceMaxCoeff;
        const sideMagUnclamped = dynPressure * AIRCRAFT.wingArea * cy;
        const sideMag = Math.max(-maxSide, Math.min(maxSide, sideMagUnclamped));
        sideForce.copy(right).multiplyScalar(sideMag);
    }

    // Drag 
    let gearDrag = p.gearTransition * 0.015;
    let inducedDrag = (cl * cl) / (Math.PI * 8);
    inducedDrag *= (1.0 - groundEffect * 0.5);

    let cd = currentCdBase + inducedDrag + gearDrag;
    if (p.isStalling) cd += 0.2;
    let dragMag = dynPressure * AIRCRAFT.wingArea * cd;
    let dragForce = t.drag;
    if (p.airspeed > 0.1) {
        // Drag opposes air-relative motion, not ground-relative motion.
        dragForce.copy(airVel).multiplyScalar(-dragMag / p.airspeed);
    } else {
        dragForce.set(0, 0, 0);
    }

    // Thrust
    let thrustMag = p.throttle * AIRCRAFT.maxThrust;
    let thrustForce = t.thrust.copy(forward).multiplyScalar(thrustMag);

    // Gravity
    let weightForce = t.weight.set(0, -AIRCRAFT.mass * p.gravity, 0);

    let gearNormalLeft = 0;
    let gearNormalRight = 0;
    let gearNormalNose = 0;

    // 3-point landing gear normal-load estimate for on-ground stability moments.
    // Also cache terrain heights for reuse in the wheel force loop below.
    const gearLoadClearance = 0.22;
    const gearPoints = [
        { local: t.gearLocalL, world: t.gearWorldL, side: 'L' },
        { local: t.gearLocalR, world: t.gearWorldR, side: 'R' },
        { local: t.gearLocalN, world: t.gearWorldN, side: 'N' }
    ];
    const cachedTerrainY = [0, 0, 0]; // reused in wheel force loop

    for (let i = 0; i < gearPoints.length; i++) {
        const gp = gearPoints[i];
        const wp = gp.world.copy(gp.local).applyQuaternion(p.quaternion).add(p.position);
        const terrainWheelY = getTerrainHeight(wp.x, wp.z);
        cachedTerrainY[i] = terrainWheelY;
        const penetration = (terrainWheelY + gearLoadClearance) - wp.y;
        if (penetration <= 0) continue;

        const springForce = penetration * AIRCRAFT.mass * 55;
        const dampForce = -p.velocity.y * AIRCRAFT.mass * 4.5;
        const normalForce = Math.max(0, springForce + dampForce);

        if (gp.side === 'L') gearNormalLeft = normalForce;
        else if (gp.side === 'R') gearNormalRight = normalForce;
        else gearNormalNose = normalForce;
    }

    // Combine Forces
    const netForce = t.net
        .set(0, 0, 0)
        .add(liftForce)
        .add(sideForce)
        .add(dragForce)
        .add(thrustForce)
        .add(weightForce);

    p.externalTorque.set(0, 0, 0);
    p.onGround = false;

    // 3-point gear spring-damper + tire forces against procedural terrain.
    const wheelForceSum = t.wheelForceSum.set(0, 0, 0);
    const wheelTorqueSum = t.wheelTorqueSum.set(0, 0, 0);
    const wheelClearance = 0.28;
    const wheelPoints = [
        { local: t.gearLocalL, world: t.gearWorldL, isNose: false },
        { local: t.gearLocalR, world: t.gearWorldR, isNose: false },
        { local: t.gearLocalN, world: t.gearWorldN, isNose: true }
    ];

    const baseForward = t.wheelForwardBase.copy(forward);
    baseForward.y = 0;
    if (baseForward.lengthSq() < 1e-6) baseForward.set(0, 0, -1);
    baseForward.normalize();
    const baseRight = t.wheelRightBase.crossVectors(t.worldUp, baseForward).normalize();

    let wheelContactCount = 0;
    let noseWheelLoad = 0;
    for (let i = 0; i < wheelPoints.length; i++) {
        const wheel = wheelPoints[i];
        const wp = wheel.world.copy(wheel.local).applyQuaternion(p.quaternion).add(p.position);
        // Reuse terrain height cached from the normal-load loop above (same world positions).
        const terrainWheelY = cachedTerrainY[i];
        const penetration = (terrainWheelY + wheelClearance) - wp.y;
        if (penetration <= 0) continue;

        wheelContactCount++;
        const wheelOffset = t.wheelOffset.copy(wp).sub(p.position);
        const pointVel = t.wheelPointVel.copy(p.angularVelocity).cross(wheelOffset).add(p.velocity);
        // Main gear springs unload as lift approaches aircraft weight, allowing natural rotation.
        // Nose gear stays fully stiff (it should be pushed down by pitch-up, not resist it).
        const gearUnload = wheel.isNose ? 1.0 : (1.0 - liftRatio * 0.88);
        const springK = (wheel.isNose ? 900000 : 1200000) * gearUnload;
        const damperC = (wheel.isNose ? 140000 : 190000) * gearUnload;
        const normalForceMag = Math.max(0, penetration * springK - pointVel.y * damperC);
        if (wheel.isNose) noseWheelLoad = normalForceMag;
        const normalForce = t.wheelForce.set(0, normalForceMag, 0);

        let wheelForward = t.wheelForward.copy(baseForward);
        let wheelRight = t.wheelRight.copy(baseRight);
        if (wheel.isNose) {
            // Smoothly fade nose-wheel steering from full authority at 30 kt to zero at 80 kt.
            const steerFade = Math.max(0, p.airspeed - 30) / 50;
            const steerAuthority = Math.max(0, 1.0 - steerFade * steerFade * (3 - 2 * steerFade));
            const steerAngle = -p.rudder * 0.62 * steerAuthority;
            if (Math.abs(steerAngle) > 1e-4) {
                wheelForward.applyAxisAngle(t.worldUp, steerAngle).normalize();
                wheelRight.crossVectors(t.worldUp, wheelForward).normalize();
            }
        }

        const longVel = pointVel.dot(wheelForward);
        const latVel = pointVel.dot(wheelRight);
        const muLong = p.brakes ? 0.95 : 0.12;
        const muLat = wheel.isNose ? 0.95 : (p.airspeed < 40 ? 0.46 : 0.72);
        const maxLong = normalForceMag * muLong;
        const maxLat = normalForceMag * muLat;
        const longDamp = p.brakes ? 220000 : 42000;
        const latDamp = wheel.isNose ? 180000 : (p.airspeed < 40 ? 76000 : 128000);
        let longForceMag = -longVel * longDamp;
        let latForceMag = -latVel * latDamp;
        if (longForceMag > maxLong) longForceMag = maxLong;
        if (longForceMag < -maxLong) longForceMag = -maxLong;
        if (latForceMag > maxLat) latForceMag = maxLat;
        if (latForceMag < -maxLat) latForceMag = -maxLat;

        const longForce = t.wheelLongForce.copy(wheelForward).multiplyScalar(longForceMag);
        const latForce = t.wheelLatForce.copy(wheelRight).multiplyScalar(latForceMag);
        const wheelTotalForce = normalForce.add(longForce).add(latForce);

        wheelForceSum.add(wheelTotalForce);
        wheelTorqueSum.add(t.wheelTmpCross.copy(wheelOffset).cross(wheelTotalForce));
    }

    if (wheelContactCount > 0) p.onGround = true;
    netForce.add(wheelForceSum);
    p.externalTorque.add(wheelTorqueSum);
    if (noseWheelLoad > 0) {
        const speedFactor = Math.max(0, Math.min(1, (95 - p.airspeed) / 85));
        p.externalTorque.y += -p.rudder * noseWheelLoad * 0.28 * speedFactor;
    }


    const acceleration = t.accel.copy(netForce).divideScalar(AIRCRAFT.mass);

    // Apparent load factor along aircraft "up" axis (felt Gs in seat).
    const specificForce = t.specific.copy(acceleration).sub(t.gravityVec.set(0, -p.gravity, 0));
    p.gForce = specificForce.dot(up) / p.gravity;
    if (!Number.isFinite(p.gForce)) p.gForce = 1.0;
    p.externalForce.copy(netForce);

    // --- ROTATIONAL DYNAMICS ---
    // All torques (control surfaces, aerodynamic stability, damping) flow through
    // the bounded torqueLocal model below, which is applied via p.externalTorque → Rapier.

    // Dedicated bounded torque model for Rapier rigid-body mode.
    // On ground: allow speedFactor to scale up to 1.1 so pitch authority at rotation
    // speed (75-90 kts) is not artificially capped below the in-air value.
    const speedFactor = p.onGround
        ? Math.max(0.28, Math.min(1.1, p.airspeed / 75))
        : Math.max(0.12, Math.min(1.2, (p.airspeed - 20) / 120));
    const torqueLocal = t.torqueLocal.set(
        p.elevator * 180000 * speedFactor * FLIGHT_TUNING.controlAuthorityMultiplier,
        -p.rudder * 120000 * speedFactor * FLIGHT_TUNING.controlAuthorityMultiplier,
        -p.aileron * 260000 * speedFactor * FLIGHT_TUNING.controlAuthorityMultiplier
    );

    if (p.onGround) {
        const taxiYawAuthority = Math.max(0, Math.min(1, (55 - p.airspeed) / 45));
        torqueLocal.y += -p.rudder * 4160000 * taxiYawAuthority * FLIGHT_TUNING.controlAuthorityMultiplier;
        // Boost elevator authority on the ground — real aircraft have full elevator authority
        // at rotation speed; this counteracts the extra friction of three contact points.
        torqueLocal.x *= FLIGHT_TUNING.groundRotationBoost;
    }

    // Mild aerodynamic stability terms (smaller than control authority).
    torqueLocal.x += -p.aoa * 80000 * speedFactor;
    torqueLocal.y += -p.slip * 120000 * speedFactor;
    torqueLocal.z += p.slip * 60000 * speedFactor;

    // Damping in aircraft local axes.
    const angVelLocal = t.angVelLocal.copy(p.angularVelocity).applyQuaternion(t.invQ.copy(p.quaternion).invert());
    torqueLocal.x += -angVelLocal.x * 170000;
    torqueLocal.y += -angVelLocal.y * 140000;
    torqueLocal.z += -angVelLocal.z * 200000;



    const maxPitchTorque = 320000 * FLIGHT_TUNING.controlAuthorityMultiplier;
    const maxYawTorque = 900000 * FLIGHT_TUNING.controlAuthorityMultiplier;
    const maxRollTorque = 420000 * FLIGHT_TUNING.controlAuthorityMultiplier;
    torqueLocal.x = Math.max(-maxPitchTorque, Math.min(maxPitchTorque, torqueLocal.x));
    torqueLocal.y = Math.max(-maxYawTorque, Math.min(maxYawTorque, torqueLocal.y));
    torqueLocal.z = Math.max(-maxRollTorque, Math.min(maxRollTorque, torqueLocal.z));

    p.externalTorque.add(t.torqueWorld.copy(torqueLocal).applyQuaternion(p.quaternion));

    // Update Three.js object
    planeGroup.position.copy(p.position);
    planeGroup.quaternion.copy(p.quaternion);
}
