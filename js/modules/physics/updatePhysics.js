export function calculateAerodynamics(ctx) {
  const { THREE, PHYSICS, AIRCRAFT, WEATHER, keys, getTerrainHeight, gearGroup, planeGroup, Noise } = ctx;
            const p = PHYSICS;

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
            const currentEuler = new THREE.Euler().setFromQuaternion(p.quaternion, 'YXZ');
            const currentPitch = currentEuler.x;
            const currentRoll = -currentEuler.z;
            const currentHeading = -currentEuler.y;

            // ILS Signal Calculation (Instrument Landing System)
            const touchdownZ = 1000;
            const distZ = p.position.z - touchdownZ;
            let headingDeg = currentHeading * (180 / Math.PI);
            if (headingDeg < 0) headingDeg += 360;

            // Active if within 15km, approaching from the South, facing broadly North (270 to 90 degrees)
            if (distZ > 0 && distZ < 15000 && (headingDeg > 270 || headingDeg < 90)) {
                p.ils.active = true;
                p.ils.distZ = distZ;
                p.ils.locError = Math.atan2(p.position.x, distZ) * (180 / Math.PI);
                let targetAlt = distZ * Math.tan(3 * Math.PI / 180) + AIRCRAFT.gearHeight;
                p.ils.gsError = p.position.y - targetAlt;
            } else {
                p.ils.active = false;
                p.autopilot.app = false; // Disconnect Autoland if signal lost
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

            // Autopilot Disconnects on manual override
            if (targetElevator !== 0) { p.autopilot.alt = false; p.autopilot.app = false; }
            if (targetAileron !== 0) { p.autopilot.hdg = false; p.autopilot.app = false; }
            if (keys.z || keys.a) p.autopilot.spd = false;

            // --- AUTOMATIC SPOILERS & BRAKES ---
            // 0 thrust means deploy airbrakes and wheel brakes
            if (p.throttle <= 0.02) {
                p.spoilers = true;
                p.brakes = true;
            } else {
                p.spoilers = false;
                p.brakes = false;
            }

            // Autopilot: APP Mode (CAT III Autoland)
            if (p.autopilot.app && p.ils.active) {

                // Auto-Flare & Touchdown Rollout
                if (p.heightAgl < 15) { // Below 45 feet
                    // 1. Flare Pitch
                    let idealPitch = 0.05; // Flare ~3 degrees nose up
                    targetElevator = (idealPitch - currentPitch) * 4.0;

                    // 2. Auto-Retard Thrust
                    p.autopilot.spd = false;
                    p.throttle = Math.max(0, p.throttle - p.dt * 0.2);

                    // 3. Keep wings perfectly level
                    targetAileron = -(0 - currentRoll) * 4.0;

                    // 4. Ground Rollout (Steering)
                    if (p.onGround) {
                        // Spoilers and Brakes are now handled automatically by the 0% thrust check above!
                        // Steer back to centerline using rudder
                        let runwayHeading = 0;
                        let correctionYaw = p.ils.locError * (Math.PI / 180) * 2.0;
                        let idealYaw = runwayHeading - correctionYaw;

                        let hdgErr = idealYaw - currentHeading;
                        while (hdgErr > Math.PI) hdgErr -= Math.PI * 2;
                        while (hdgErr < -Math.PI) hdgErr += Math.PI * 2;

                        targetRudder = -hdgErr * 4.0;
                    }
                } else {
                    // Track Glideslope (GS)
                    let baseSinkRate = Math.sin(3 * Math.PI / 180) * p.airspeed;
                    let targetVS = Math.max(-12, Math.min(5, -baseSinkRate - (p.ils.gsError * 0.5)));
                    let vsError = targetVS - p.velocity.y;
                    let idealPitch = Math.max(-0.15, Math.min(0.25, vsError * 0.05));
                    targetElevator = (idealPitch - currentPitch) * 4.0;

                    // Track Localizer (LOC)
                    let correctionAngle = Math.max(-30, Math.min(30, p.ils.locError * 15)); // Steer towards beam
                    let targetHdg = 0 - (correctionAngle * Math.PI / 180);

                    let hdgErr = targetHdg - currentHeading;
                    while (hdgErr > Math.PI) hdgErr -= Math.PI * 2;
                    while (hdgErr < -Math.PI) hdgErr += Math.PI * 2;

                    let idealRoll = Math.max(-0.5, Math.min(0.5, hdgErr * 2.5));
                    targetAileron = -(idealRoll - currentRoll) * 4.0;
                }
            }
            else {
                // Standard Autopilot: Altitude Hold
                if (p.autopilot.alt) {
                    let altError = p.autopilot.targetAlt - p.position.y;
                    let targetVS = Math.max(-15, Math.min(15, altError * 0.5)); // Climb/Descend up to 15m/s
                    let vsError = targetVS - p.velocity.y;
                    let idealPitch = Math.max(-0.25, Math.min(0.25, vsError * 0.05));
                    targetElevator = (idealPitch - currentPitch) * 4.0;
                }

                // Standard Autopilot: Heading Hold
                if (p.autopilot.hdg) {
                    let hdgError = p.autopilot.targetHdg - currentHeading;
                    while (hdgError > Math.PI) hdgError -= Math.PI * 2;
                    while (hdgError < -Math.PI) hdgError += Math.PI * 2;

                    let idealRoll = Math.max(-0.5, Math.min(0.5, hdgError * 2.5)); // Bank up to ~28 degrees
                    targetAileron = -(idealRoll - currentRoll) * 4.0;
                }
            }

            // Apply smoothed control surface deflections
            p.elevator += (targetElevator - p.elevator) * 8.0 * p.dt;
            p.aileron += (targetAileron - p.aileron) * 8.0 * p.dt;
            p.rudder += (targetRudder - p.rudder) * 8.0 * p.dt;
            p.flaps += (p.targetFlaps - p.flaps) * 1.5 * p.dt;

            // Autopilot: Auto-Throttle Logic
            if (p.autopilot.spd) {
                let spdError = p.autopilot.targetSpd - p.airspeed;
                p.throttle += spdError * 0.5 * p.dt; // Spool up/down to match speed
                p.throttle = Math.max(0, Math.min(1, p.throttle));
            } else {
                // Manual Throttle
                if (keys.z) p.throttle = Math.min(1.0, p.throttle + 2.0 * p.dt);
                if (keys.a) p.throttle = Math.max(0.0, p.throttle - 2.0 * p.dt);
            }

            // Gear Logic Animation
            if (p.gearDown && p.gearTransition < 1.0) p.gearTransition = Math.min(1.0, p.gearTransition + p.dt * 0.2);
            if (!p.gearDown && p.gearTransition > 0.0) p.gearTransition = Math.max(0.0, p.gearTransition - p.dt * 0.2);

            gearGroup.position.y = (1.0 - p.gearTransition) * 2; // Move up
            gearGroup.scale.y = Math.max(0.01, p.gearTransition); // Squash
            gearGroup.visible = p.gearTransition > 0;

            // Kinematics setup
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion);

            p.airspeed = p.velocity.length();

            // Local velocity to find AoA and Slip
            const invQ = p.quaternion.clone().invert();
            const localVel = p.velocity.clone().applyQuaternion(invQ);

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

            let liftForce = up.clone().multiplyScalar(liftMag);

            // Drag 
            let gearDrag = p.gearTransition * 0.015;
            let inducedDrag = (cl * cl) / (Math.PI * 8);
            inducedDrag *= (1.0 - groundEffect * 0.5);

            let cd = currentCdBase + inducedDrag + gearDrag;
            if (p.isStalling) cd += 0.2;
            let dragMag = dynPressure * AIRCRAFT.wingArea * cd;
            let dragForce = p.velocity.clone().normalize().multiplyScalar(-dragMag);
            if (p.airspeed < 0.1) dragForce.set(0, 0, 0);

            // Thrust
            let thrustMag = p.throttle * AIRCRAFT.maxThrust;
            let thrustForce = forward.clone().multiplyScalar(thrustMag);

            // Gravity
            let weightForce = new THREE.Vector3(0, -AIRCRAFT.mass * p.gravity, 0);

            // Ground Contact Physics
            let groundForce = new THREE.Vector3();
            let frictionForce = new THREE.Vector3();

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
                let velHorizontal = p.velocity.clone(); velHorizontal.y = 0;

                let maxFriction = (velHorizontal.length() / p.dt) * AIRCRAFT.mass;
                if (frictionMag > maxFriction) {
                    frictionMag = maxFriction;
                }

                if (velHorizontal.length() > 0.01) {
                    frictionForce = velHorizontal.normalize().multiplyScalar(-frictionMag);
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
            const netForce = new THREE.Vector3()
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
                netForce.add(new THREE.Vector3(0, turbLift, 0));
            }

            const acceleration = netForce.divideScalar(AIRCRAFT.mass);

            // Calculate G-Force
            p.gForce = (liftForce.length() + groundForce.length()) / (AIRCRAFT.mass * p.gravity);
            if (Math.abs(p.gForce) < 0.1 && p.onGround) p.gForce = 1.0; // Rest

            // Integrate Linear Velocity & Position
            p.velocity.add(acceleration.clone().multiplyScalar(p.dt));
            p.position.add(p.velocity.clone().multiplyScalar(p.dt));

            // --- ARCADE ROTATIONAL DYNAMICS ---
            // Aerodynamic control authority requires airflow. 
            // 0x at 0 m/s, 1x at ~80 m/s (takeoff speed), up to 2x at high speeds.
            let controlAuthority = Math.max(0, Math.min(2.0, Math.pow(p.airspeed / 80, 1.5)));

            // Direct Angular Acceleration (Bypasses inertia for predictable, snappy control)
            let pitchAcc = p.elevator * 3.0 * controlAuthority;
            let rollAcc = -p.aileron * 4.0 * controlAuthority;
            let yawAcc = -p.rudder * 1.5 * controlAuthority;

            // Add aerodynamic stability (weathercocking / auto-level)
            rollAcc += p.slip * 0.005 * dynPressure;
            yawAcc += -p.slip * 0.01 * dynPressure;
            pitchAcc += -p.aoa * 0.002 * dynPressure;

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

            // Arcade Auto-Stop & Damping:
            // Always apply a gentle baseline drag to rotation
            p.angularVelocity.multiplyScalar(Math.pow(0.5, p.dt));

            // If no input is actively pressed, bleed off rotational velocity extremely fast (snap to halt)
            if (targetElevator === 0) p.angularVelocity.x *= Math.pow(0.0001, p.dt);
            if (targetRudder === 0) p.angularVelocity.y *= Math.pow(0.0001, p.dt);
            if (targetAileron === 0) p.angularVelocity.z *= Math.pow(0.0001, p.dt);

            // Create quaternion from angular velocity and apply to current quaternion
            const deltaRotation = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                    p.angularVelocity.x * p.dt,
                    p.angularVelocity.y * p.dt,
                    p.angularVelocity.z * p.dt,
                    'YXZ'
                )
            );
            p.quaternion.multiply(deltaRotation).normalize();

            // Update Three.js object
            planeGroup.position.copy(p.position);
            planeGroup.quaternion.copy(p.quaternion);
}
