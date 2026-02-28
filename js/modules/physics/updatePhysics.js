let _tmp = null;
const FLIGHT_TUNING = {
    controlAuthorityMultiplier: 2.0,
    sideForceSlipGain: 0.9,
    sideForceMaxCoeff: 0.45,
    takeoffAutoFlaps: 0.22,
    takeoffArmThrottle: 0.55,
    takeoffFlapMaxSpeed: 72,
    rapierGroundElevatorFactor: 0.45
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
        gearLocalL: new THREE.Vector3(-4.8, -3.3, 3.2),
        gearLocalR: new THREE.Vector3(4.8, -3.3, 3.2),
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

            // ILS Signal Calculation (Instrument Landing System) for both runway directions
            const touchdownZNorth = 1000;   // Runway 36 touchdown zone
            const touchdownZSouth = -1000;  // Runway 18 touchdown zone
            let headingDeg = currentHeading * (180 / Math.PI);
            if (headingDeg < 0) headingDeg += 360;

            function headingDiffDeg(targetDeg) {
                let d = headingDeg - targetDeg;
                while (d > 180) d -= 360;
                while (d < -180) d += 360;
                return d;
            }

            const candidate36Dist = p.position.z - touchdownZNorth;
            const candidate36HeadingOk = Math.abs(headingDiffDeg(0)) <= 90;
            const candidate36Active = candidate36Dist > 0 && candidate36Dist < 15000 && candidate36HeadingOk;

            const candidate18Dist = touchdownZSouth - p.position.z;
            const candidate18HeadingOk = Math.abs(headingDiffDeg(180)) <= 90;
            const candidate18Active = candidate18Dist > 0 && candidate18Dist < 15000 && candidate18HeadingOk;

            let activeRunway = null;
            let distToTd = 0;
            let runwayHeading = 0;
            if (candidate36Active && candidate18Active) {
                if (candidate36Dist <= candidate18Dist) {
                    activeRunway = '36';
                    distToTd = candidate36Dist;
                    runwayHeading = 0;
                } else {
                    activeRunway = '18';
                    distToTd = candidate18Dist;
                    runwayHeading = Math.PI;
                }
            } else if (candidate36Active) {
                activeRunway = '36';
                distToTd = candidate36Dist;
                runwayHeading = 0;
            } else if (candidate18Active) {
                activeRunway = '18';
                distToTd = candidate18Dist;
                runwayHeading = Math.PI;
            }

            if (activeRunway) {
                p.ils.active = true;
                p.ils.runwayId = activeRunway;
                p.ils.runwayHeading = runwayHeading;
                p.ils.distZ = distToTd;
                p.ils.locError = Math.atan2(p.position.x, distToTd) * (180 / Math.PI);
                let targetAlt = distToTd * Math.tan(3 * Math.PI / 180) + AIRCRAFT.gearHeight;
                p.ils.gsError = p.position.y - targetAlt;
            }
            else {
                p.ils.active = false;
            }

            // --- AUTOMATIC GEAR & FLAPS LOGIC ---
            // Widened the localizer error cone to 45 degrees so it triggers reliably when banking to intercept
            if (p.ils.active && Math.abs(p.ils.locError) <= 45) {
                if (p.ils.distZ < 12000) p.gearDown = true; // Drop gear at 12km out

                // Progressive Flaps based on distance to runway
                if (p.ils.distZ < 3000) p.targetFlaps = 1.0;
                else if (p.ils.distZ < 6000) p.targetFlaps = 0.75;
                else if (p.ils.distZ < 9000) p.targetFlaps = 0.50;
                else if (p.ils.distZ < 12000) p.targetFlaps = 0.25;
            }

            // Clean up config ONLY if taking off or executing a Go-Around (High thrust and actively climbing)
            if (!p.onGround && p.heightAgl > 150 && p.throttle > 0.5 && p.velocity.y > 0 && (!p.ils.active || Math.abs(p.ils.locError) > 45)) {
                p.gearDown = false;
                p.targetFlaps = 0.0;
            }

            // Ensure gear is safely locked down if we are physically touching the ground
            if (p.onGround) {
                p.gearDown = true;
                // Auto-set a mild takeoff flap configuration when spooling up on runway.
                if (
                    !p.ils.active &&
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
            const lowSpeedGroundLock = p.onGround && p.airspeed < 28;
            if (lowSpeedGroundLock) {
                // Prevent parked/taxi aileron input from rolling the whole aircraft into a flip.
                targetAileron = 0;
                targetElevator *= FLIGHT_TUNING.rapierGroundElevatorFactor;
            }

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

            p.airspeed = p.velocity.length();

            // Local velocity to find AoA and Slip
            const invQ = t.invQ.copy(p.quaternion).invert();
            const localVel = t.localVel.copy(p.velocity).applyQuaternion(invQ);

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
            // Simplified wingspan roughly sqrt(wingArea * aspect ratio) ~ 30m
            let groundEffect = Math.max(0, 1.0 - (heightAgl / 30.0));

            // Lift
            let cl = aoaDeg * currentClSlope;
            if (p.isStalling) cl *= Math.exp(-(Math.abs(aoaDeg) - currentStallAngle) * 0.1);
            let liftMag = dynPressure * AIRCRAFT.wingArea * cl;
            liftMag *= (1.0 + groundEffect * 0.15);

            // Spoilers dump 40% of the wing's lift!
            if (p.spoilers) liftMag *= 0.6;

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
                dragForce.copy(p.velocity).multiplyScalar(-dragMag / p.airspeed);
            } else {
                dragForce.set(0, 0, 0);
            }
            if (p.airspeed < 0.1) dragForce.set(0, 0, 0);

            // Thrust
            let thrustMag = p.throttle * AIRCRAFT.maxThrust;
            let thrustForce = t.thrust.copy(forward).multiplyScalar(thrustMag);

            // Gravity
            let weightForce = t.weight.set(0, -AIRCRAFT.mass * p.gravity, 0);

            let gearNormalLeft = 0;
            let gearNormalRight = 0;
            let gearNormalNose = 0;

            // 3-point landing gear normal-load estimate for on-ground stability moments.
            const gearLoadClearance = 0.22;
            const gearPoints = [
                { local: t.gearLocalL, world: t.gearWorldL, side: 'L' },
                { local: t.gearLocalR, world: t.gearWorldR, side: 'R' },
                { local: t.gearLocalN, world: t.gearWorldN, side: 'N' }
            ];

            for (let i = 0; i < gearPoints.length; i++) {
                const gp = gearPoints[i];
                const wp = gp.world.copy(gp.local).applyQuaternion(p.quaternion).add(p.position);
                const terrainWheelY = getTerrainHeight(wp.x, wp.z);
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
                    const terrainWheelY = getTerrainHeight(wp.x, wp.z);
                    const penetration = (terrainWheelY + wheelClearance) - wp.y;
                    if (penetration <= 0) continue;

                    wheelContactCount++;
                    const wheelOffset = t.wheelOffset.copy(wp).sub(p.position);
                    const pointVel = t.wheelPointVel.copy(p.angularVelocity).cross(wheelOffset).add(p.velocity);
                    const springK = wheel.isNose ? 900000 : 1200000;
                    const damperC = wheel.isNose ? 140000 : 190000;
                    const normalForceMag = Math.max(0, penetration * springK - pointVel.y * damperC);
                    if (wheel.isNose) noseWheelLoad = normalForceMag;
                    const normalForce = t.wheelForce.set(0, normalForceMag, 0);

                    let wheelForward = t.wheelForward.copy(baseForward);
                    let wheelRight = t.wheelRight.copy(baseRight);
                    if (wheel.isNose) {
                        const steerAuthority = Math.max(0, Math.min(1.0, 1.0 - Math.max(0, p.airspeed - 40) / 100));
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
            // --- STORM TURBULENCE (Linear Forces) ---
            if (WEATHER.mode === 2 && p.airspeed > 20 && !p.onGround) {
                let tTime = performance.now() * 0.001;
                // Brutal up/downdrafts pushing the plane around
                let turbLift = Noise.noise(tTime * 0.8, 0, 0) * AIRCRAFT.mass * 6;
                netForce.y += turbLift;
            }

            const acceleration = t.accel.copy(netForce).divideScalar(AIRCRAFT.mass);

            // Apparent load factor along aircraft "up" axis (felt Gs in seat).
            const specificForce = t.specific.copy(acceleration).sub(t.gravityVec.set(0, -p.gravity, 0));
            p.gForce = specificForce.dot(up) / p.gravity;
            if (!Number.isFinite(p.gForce)) p.gForce = 1.0;
            p.externalForce.copy(netForce);

            // --- ARCADE+ ROTATIONAL DYNAMICS ---
            // Blend real-ish inertia response with forgiving control authority.
            // 0x at very low speed, ~1x near approach speed, up to 2x at high speed.
            let controlAuthority = Math.max(0, Math.min(2.0, Math.pow(p.airspeed / 85, 1.4)));
            const pitchTorque = 360000 * FLIGHT_TUNING.controlAuthorityMultiplier;
            const rollTorque = 800000 * FLIGHT_TUNING.controlAuthorityMultiplier;
            const yawTorque = 225000 * FLIGHT_TUNING.controlAuthorityMultiplier;

            let pitchAcc = (p.elevator * pitchTorque / AIRCRAFT.inertia.x) * controlAuthority;
            let rollAcc = (-p.aileron * rollTorque / AIRCRAFT.inertia.z) * controlAuthority;
            let yawAcc = (-p.rudder * yawTorque / AIRCRAFT.inertia.y) * controlAuthority;

            // Add aerodynamic stability (weathercocking / auto-level)
            rollAcc += p.slip * 0.005 * dynPressure;
            yawAcc += -p.slip * 0.01 * dynPressure;
            pitchAcc += -p.aoa * 0.002 * dynPressure;
            // Angular damping scales with airflow; helps prevent instant over-rotation.
            const angDamp = 0.25 + controlAuthority * 0.55;
            pitchAcc += -p.angularVelocity.x * angDamp;
            yawAcc += -p.angularVelocity.y * (angDamp * 0.8);
            rollAcc += -p.angularVelocity.z * (angDamp * 1.05);

            // --- GROUND STABILITY (Landing Gear Physics) ---
            if (p.onGround) {
                // Main gear wide stance forces wings level
                rollAcc += (0 - currentRoll) * 15.0;
                p.angularVelocity.z *= Math.pow(0.01, p.dt); // Dampen ground rolling

                // Nose gear prevents the nose from dipping below the horizon
                if (currentPitch < 0) {
                    pitchAcc += (0 - currentPitch) * 20.0;
                    if (p.angularVelocity.x < 0) p.angularVelocity.x *= Math.pow(0.001, p.dt);
                }

                // Use gear load imbalance to apply realistic anti-tip stabilizing moments.
                const totalGearNormal = gearNormalLeft + gearNormalRight + gearNormalNose;
                if (totalGearNormal > 1) {
                    const lrImbalance = (gearNormalRight - gearNormalLeft) / totalGearNormal;
                    const pitchImbalance = (gearNormalNose - (gearNormalLeft + gearNormalRight) * 0.5) / totalGearNormal;
                    rollAcc += -lrImbalance * 35.0;
                    pitchAcc += -pitchImbalance * 18.0;
                }

                // Hard guard: don't allow extreme bank while wheels are loaded on runway.
                const maxGroundRoll = 0.45; // ~26 deg
                if (Math.abs(currentRoll) > maxGroundRoll) {
                    const excess = currentRoll - Math.sign(currentRoll) * maxGroundRoll;
                    rollAcc += -excess * 40.0;
                    p.angularVelocity.z *= Math.pow(0.005, p.dt);
                }

                // Extra lockout at very low speed to avoid unrealistic tip-over behavior.
                if (lowSpeedGroundLock) {
                    rollAcc += (0 - currentRoll) * 22.0;
                    pitchAcc += (0 - currentPitch) * 10.0;
                    p.angularVelocity.z *= Math.pow(0.0001, p.dt);
                    p.angularVelocity.x *= Math.pow(0.05, p.dt);
                }
            }

            // --- STORM TURBULENCE (Rotational Buffeting) ---
            if (WEATHER.mode === 2 && p.airspeed > 20 && !p.onGround) {
                let tTime = performance.now() * 0.001;
                pitchAcc += Noise.noise(tTime * 2.2, 10, 0) * 0.5;
                rollAcc += Noise.noise(0, tTime * 2.5, 10) * 0.9;
                yawAcc += Noise.noise(10, 0, tTime * 2.1) * 0.3;
            }

            // Dedicated bounded torque model for Rapier rigid-body mode.
            const speedFactor = p.onGround
                ? Math.max(0.28, Math.min(0.85, p.airspeed / 80))
                : Math.max(0.12, Math.min(1.2, (p.airspeed - 20) / 120));
            const torqueLocal = t.torqueLocal.set(
                p.elevator * 180000 * speedFactor * FLIGHT_TUNING.controlAuthorityMultiplier,
                -p.rudder * 120000 * speedFactor * FLIGHT_TUNING.controlAuthorityMultiplier,
                -p.aileron * 260000 * speedFactor * FLIGHT_TUNING.controlAuthorityMultiplier
            );

            if (p.onGround) {
                const taxiYawAuthority = Math.max(0, Math.min(1, (55 - p.airspeed) / 45));
                torqueLocal.y += -p.rudder * 4160000 * taxiYawAuthority * FLIGHT_TUNING.controlAuthorityMultiplier;
            }

            // Mild aerodynamic stability terms (smaller than control authority).
            torqueLocal.x += -p.aoa * 80000 * speedFactor;
            torqueLocal.y += -p.slip * 120000 * speedFactor;
            torqueLocal.z += p.slip * 60000 * speedFactor;

            // Damping in aircraft local axes.
            const angVelLocal = t.angVelLocal.copy(p.angularVelocity).applyQuaternion(t.invQ.copy(p.quaternion).invert());
            torqueLocal.x += -angVelLocal.x * (p.onGround ? 300000 : 170000);
            torqueLocal.y += -angVelLocal.y * (p.onGround ? 115000 : 140000);
            torqueLocal.z += -angVelLocal.z * (p.onGround ? 340000 : 200000);

            if (p.onGround) {
                // Keep runway handling predictable and prevent rollover impulses.
                torqueLocal.x *= 0.12;
                torqueLocal.z *= 0.08;
                if (p.airspeed < 35) torqueLocal.y *= 0.9;
            }

            if (p.onGround) {
                const maxPitchTorque = 80000 * FLIGHT_TUNING.controlAuthorityMultiplier;
                const maxYawTorque = 900000 * FLIGHT_TUNING.controlAuthorityMultiplier;
                const maxRollTorque = 70000 * FLIGHT_TUNING.controlAuthorityMultiplier;
                torqueLocal.x = Math.max(-maxPitchTorque, Math.min(maxPitchTorque, torqueLocal.x));
                torqueLocal.y = Math.max(-maxYawTorque, Math.min(maxYawTorque, torqueLocal.y));
                torqueLocal.z = Math.max(-maxRollTorque, Math.min(maxRollTorque, torqueLocal.z));
            } else {
                const maxPitchTorque = 320000 * FLIGHT_TUNING.controlAuthorityMultiplier;
                const maxYawTorque = 360000 * FLIGHT_TUNING.controlAuthorityMultiplier;
                const maxRollTorque = 420000 * FLIGHT_TUNING.controlAuthorityMultiplier;
                torqueLocal.x = Math.max(-maxPitchTorque, Math.min(maxPitchTorque, torqueLocal.x));
                torqueLocal.y = Math.max(-maxYawTorque, Math.min(maxYawTorque, torqueLocal.y));
                torqueLocal.z = Math.max(-maxRollTorque, Math.min(maxRollTorque, torqueLocal.z));
            }

            p.externalTorque.add(t.torqueWorld.copy(torqueLocal).applyQuaternion(p.quaternion));

            // Update Three.js object
            planeGroup.position.copy(p.position);
            planeGroup.quaternion.copy(p.quaternion);
}
