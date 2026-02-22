let _tmp = null;

function getTmp(THREE) {
    if (_tmp) return _tmp;
    _tmp = {
        euler: new THREE.Euler(),
        forward: new THREE.Vector3(),
        up: new THREE.Vector3(),
        invQ: new THREE.Quaternion(),
        localVel: new THREE.Vector3(),
        lift: new THREE.Vector3(),
        drag: new THREE.Vector3(),
        thrust: new THREE.Vector3(),
        weight: new THREE.Vector3(),
        ground: new THREE.Vector3(),
        friction: new THREE.Vector3(),
        velHoriz: new THREE.Vector3(),
        net: new THREE.Vector3(),
        accel: new THREE.Vector3(),
        specific: new THREE.Vector3(),
        gravityVec: new THREE.Vector3(),
        deltaEuler: new THREE.Euler(0, 0, 0, 'YXZ'),
        deltaQ: new THREE.Quaternion()
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

            // Mountain strike crash disabled for relaxing gameplay
            if (p.position.y < _terrainY) {
                p.position.y = _terrainY; // Gently bump up instead of exploding
            }

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
                // Clean flaps up during rollout if engines are at idle
                if (p.airspeed < 40 && p.throttle <= 0.02) {
                    p.targetFlaps = 0.0;
                }
            }


            // Base manual input
            let targetElevator = (keys.ArrowUp ? -1 : 0) + (keys.ArrowDown ? 1 : 0);
            let targetAileron = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
            let targetRudder = (keys.q ? 1 : 0) + (keys.e ? -1 : 0);

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
            if (keys.z) p.throttle = Math.min(1.0, p.throttle + 2.0 * p.dt);
            if (keys.a) p.throttle = Math.max(0.0, p.throttle - 2.0 * p.dt);

            // Gear Logic Animation
            if (p.gearDown && p.gearTransition < 1.0) p.gearTransition = Math.min(1.0, p.gearTransition + p.dt * 0.2);
            if (!p.gearDown && p.gearTransition > 0.0) p.gearTransition = Math.max(0.0, p.gearTransition - p.dt * 0.2);

            gearGroup.position.y = (1.0 - p.gearTransition) * 2; // Move up
            gearGroup.scale.y = Math.max(0.01, p.gearTransition); // Squash
            gearGroup.visible = p.gearTransition > 0;

            // Kinematics setup
            const forward = t.forward.set(0, 0, -1).applyQuaternion(p.quaternion);
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

            // Ground Contact Physics
            let groundForce = t.ground.set(0, 0, 0);
            let frictionForce = t.friction.set(0, 0, 0);

            if (p.position.y <= groundY) {
                p.onGround = true;
                // Suspension spring
                const penetration = groundY - p.position.y;
                const springForce = penetration * AIRCRAFT.mass * 50;
                const dampForce = -p.velocity.y * AIRCRAFT.mass * 5;
                let normalForceMag = Math.max(0, springForce + dampForce);

                // Ground stops downward movement forcefully if spring isn't enough
                if (p.position.y < groundY - 0.5) p.position.y = groundY;

                groundForce.set(0, normalForceMag, 0);

                // Friction (Wheel Brakes & Auto-braking)
                let frictionCoeff = 0.05; // Base rolling resistance
                if (p.throttle < 0.1 && p.airspeed < 20) frictionCoeff = 0.3; // Gentle auto brake at low speeds
                if (p.brakes) frictionCoeff = 1.2; // Massive friction from wheel brakes

                let frictionMag = normalForceMag * frictionCoeff;
                let velHorizontal = t.velHoriz.copy(p.velocity); velHorizontal.y = 0;

                let maxFriction = (velHorizontal.length() / p.dt) * AIRCRAFT.mass;
                if (frictionMag > maxFriction) {
                    frictionMag = maxFriction;
                }

                if (velHorizontal.length() > 0.01) {
                    const invLen = 1 / Math.sqrt(velHorizontal.lengthSq());
                    frictionForce.copy(velHorizontal).multiplyScalar(-frictionMag * invLen);
                } else {
                    if (p.throttle < 0.1) {
                        p.velocity.x = 0; p.velocity.z = 0;
                    }
                }

                // Ground steering (Yaw translates to rotational force while on ground)
                if (p.airspeed > 1) {
                    p.angularVelocity.y += -p.rudder * 0.01 * (p.airspeed / 30) * p.dt;
                }

                // Remove lift to prevent floating while parked
                if (p.airspeed < 40) liftForce.multiplyScalar(0.1);
            } else {
                p.onGround = false;
            }

            // Combine Forces
            const netForce = t.net
                .set(0, 0, 0)
                .add(liftForce)
                .add(dragForce)
                .add(thrustForce)
                .add(weightForce)
                .add(groundForce)
                .add(frictionForce);

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

            // Integrate Linear Velocity & Position
            p.velocity.addScaledVector(acceleration, p.dt);
            p.position.addScaledVector(p.velocity, p.dt);

            // --- ARCADE+ ROTATIONAL DYNAMICS ---
            // Blend real-ish inertia response with forgiving control authority.
            // 0x at very low speed, ~1x near approach speed, up to 2x at high speed.
            let controlAuthority = Math.max(0, Math.min(2.0, Math.pow(p.airspeed / 85, 1.4)));
            const pitchTorque = 360000;
            const rollTorque = 800000;
            const yawTorque = 225000;

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
            }

            // --- STORM TURBULENCE (Rotational Buffeting) ---
            if (WEATHER.mode === 2 && p.airspeed > 20 && !p.onGround) {
                let tTime = performance.now() * 0.001;
                pitchAcc += Noise.noise(tTime * 2.2, 10, 0) * 0.5;
                rollAcc += Noise.noise(0, tTime * 2.5, 10) * 0.9;
                yawAcc += Noise.noise(10, 0, tTime * 2.1) * 0.3;
            }

            // Integrate Angular Velocity
            p.angularVelocity.x += pitchAcc * p.dt;
            p.angularVelocity.y += yawAcc * p.dt;
            p.angularVelocity.z += rollAcc * p.dt;

            // ARCADE CLAMP: Prevent windmilling by hard-capping max rotation rates (rad/s)
            const maxPitchRate = 0.8 * Math.max(0.2, controlAuthority);
            const maxYawRate = 0.5 * Math.max(0.2, controlAuthority);
            const maxRollRate = 1.2 * Math.max(0.2, controlAuthority);

            p.angularVelocity.x = Math.max(-maxPitchRate, Math.min(maxPitchRate, p.angularVelocity.x));
            p.angularVelocity.y = Math.max(-maxYawRate, Math.min(maxYawRate, p.angularVelocity.y));
            p.angularVelocity.z = Math.max(-maxRollRate, Math.min(maxRollRate, p.angularVelocity.z));

            // Baseline rotational damping (no hard snap-to-zero; more physical decay).
            p.angularVelocity.multiplyScalar(Math.pow(0.65, p.dt));
            if (p.onGround) p.angularVelocity.multiplyScalar(Math.pow(0.35, p.dt));

            // Create quaternion from angular velocity and apply to current quaternion
            const deltaRotation = t.deltaQ.setFromEuler(
                t.deltaEuler.set(
                    p.angularVelocity.x * p.dt,
                    p.angularVelocity.y * p.dt,
                    p.angularVelocity.z * p.dt
                )
            );
            p.quaternion.multiply(deltaRotation).normalize();

            // Update Three.js object
            planeGroup.position.copy(p.position);
            planeGroup.quaternion.copy(p.quaternion);
}
