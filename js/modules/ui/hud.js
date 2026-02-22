import * as THREE from 'three';

export function createHUD({ PHYSICS, WEATHER, getTerrainHeight }) {
        const UI = {
            speedReadout: document.getElementById('speed-readout'),
            speedTape: document.getElementById('speed-tape-content'),
            altReadout: document.getElementById('alt-readout'),
            altTape: document.getElementById('alt-tape-content'),
            radAlt: document.getElementById('rad-alt'),
            ilsLoc: document.getElementById('ils-loc'),
            ilsGs: document.getElementById('ils-gs'),
            locDiamond: document.getElementById('loc-diamond'),
            gsDiamond: document.getElementById('gs-diamond'),
            compassTape: document.getElementById('compass-tape'),
            pitchLadder: document.getElementById('pitch-ladder'),
            horizonSky: document.getElementById('horizon-sky'),
            fpv: document.getElementById('fpv'),
            fmaSpd: document.getElementById('fma-spd'),
            fmaHdg: document.getElementById('fma-hdg'),
            fmaAlt: document.getElementById('fma-alt'),
            fmaIls: document.getElementById('fma-ils'),
            thrust: document.getElementById('hud-thrust'),
            aoa: document.getElementById('hud-aoa'),
            gforce: document.getElementById('hud-gforce'),
            vs: document.getElementById('hud-vs'),
            gear: document.getElementById('hud-gear'),
            flaps: document.getElementById('hud-flaps'),
            spoilers: document.getElementById('hud-spoilers'),
            brakes: document.getElementById('hud-brakes'),
            warning: document.getElementById('warning-overlay')
        };

        const minimapCanvas = document.getElementById('minimap');
        const mmCtx = minimapCanvas.getContext('2d');

        // Initialize HUD generation
        function initHUD() {
            // Generate Pitch Ladder Lines
            for (let i = 90; i >= -90; i -= 10) {
                if (i === 0) continue;
                let line = document.createElement('div');
                line.className = 'pitch-line';
                line.dataset.pitch = Math.abs(i);
                // 1 degree = 4px spacing
                line.style.position = 'absolute';
                line.style.top = `calc(50% - ${i * 4}px)`;
                UI.pitchLadder.appendChild(line);
            }

            // Generate Compass marks
            for (let i = 0; i <= 360; i += 10) {
                let mark = document.createElement('div');
                mark.className = 'compass-mark';
                mark.innerText = i % 90 === 0 ? (i === 0 || i === 360 ? 'N' : i === 90 ? 'E' : i === 180 ? 'S' : 'W') : (i / 10).toString().padStart(2, '0');
                UI.compassTape.appendChild(mark);
            }

            // Generate Tape marks (lazy loaded visually in CSS, physically in DOM)
            for (let i = 500; i >= 0; i -= 10) {
                let mark = document.createElement('div');
                mark.className = 'tape-mark' + (i % 50 === 0 ? ' major' : '');
                mark.innerText = i % 50 === 0 ? i : '';
                UI.speedTape.appendChild(mark);
            }
            for (let i = 40000; i >= -1000; i -= 100) {
                let mark = document.createElement('div');
                mark.className = 'tape-mark' + (i % 500 === 0 ? ' major' : '');
                mark.innerText = i % 500 === 0 ? i : '';
                UI.altTape.appendChild(mark);
            }
        }
        initHUD();

        function updateHUD() {
            // Conversions
            const kts = PHYSICS.airspeed * 1.94384;
            const altFt = PHYSICS.position.y * 3.28084;
            const vsFpm = PHYSICS.velocity.y * 196.85;

            // Extract Pitch, Roll, Heading from Quaternion
            const euler = new THREE.Euler().setFromQuaternion(PHYSICS.quaternion, 'YXZ');
            const pitch = euler.x * (180 / Math.PI);
            const roll = -euler.z * (180 / Math.PI); // Invert for display
            let heading = -euler.y * (180 / Math.PI);
            if (heading < 0) heading += 360;

            const aoaDeg = PHYSICS.aoa * (180 / Math.PI);
            const slipDeg = PHYSICS.slip * (180 / Math.PI);

            // Artificial Horizon
            UI.horizonSky.style.transform = `rotate(${roll}deg) translateY(${pitch * 4}px)`;

            // Flight Path Vector (FPA = Pitch - AoA)
            const fpa = pitch - aoaDeg;
            UI.fpv.style.transform = `translate(${slipDeg * 4}px, ${-fpa * 4}px)`;

            // Tapes (1 unit per pixel mapped mathematically)
            UI.speedReadout.innerText = Math.round(kts).toString().padStart(3, '0');
            // speed tape: 500 max, 10 units = 20px -> 1 unit = 2px. Offset from middle.
            let speedOffset = (500 - kts) * 2;
            UI.speedTape.style.transform = `translateY(calc(-50% + 150px - ${speedOffset}px))`;

            UI.altReadout.innerText = Math.round(altFt).toString().padStart(5, '0');
            // alt tape: 40000 max, 100 units = 20px -> 1 unit = 0.2px.
            let altOffset = (40000 - altFt) * 0.2;
            UI.altTape.style.transform = `translateY(calc(-50% + 150px - ${altOffset}px))`;

            // Radio Altimeter (Visible < 2500ft)
            const radAltFt = PHYSICS.heightAgl * 3.28084;
            if (radAltFt < 2500) {
                UI.radAlt.style.display = 'block';
                UI.radAlt.innerText = 'R ' + Math.round(radAltFt).toString().padStart(4, '0');
                if (radAltFt < 500) { UI.radAlt.style.color = '#ff0'; UI.radAlt.style.borderColor = '#ff0'; }
                if (radAltFt < 200) { UI.radAlt.style.color = '#f00'; UI.radAlt.style.borderColor = '#f00'; }
                if (radAltFt >= 500) { UI.radAlt.style.color = '#0f0'; UI.radAlt.style.borderColor = '#0f0'; }
            } else {
                UI.radAlt.style.display = 'none';
            }

            // Compass (360 degrees = 36 * 30px = 1080px width)
            let headingOffset = (heading / 10) * 30;
            UI.compassTape.style.transform = `translateX(calc(50% - ${headingOffset}px))`;

            // Update FMA (Autopilot Status Board)
            UI.fmaSpd.innerText = PHYSICS.autopilot.spd ? `SPD ${Math.round(PHYSICS.autopilot.targetSpd * 1.94384)}` : '';
            let hdgDeg = PHYSICS.autopilot.targetHdg * (180 / Math.PI);
            if (hdgDeg < 0) hdgDeg += 360;
            UI.fmaHdg.innerText = PHYSICS.autopilot.hdg ? `HDG ${Math.round(hdgDeg).toString().padStart(3, '0')}` : '';
            UI.fmaAlt.innerText = PHYSICS.autopilot.alt ? `ALT ${Math.round(PHYSICS.autopilot.targetAlt * 3.28084)}` : '';

            // ILS Logic UI Update
            if (PHYSICS.ils.active) {
                UI.ilsLoc.style.display = 'flex';
                UI.ilsGs.style.display = 'flex';

                // FMA Status
                if (PHYSICS.autopilot.app) {
                    UI.fmaIls.innerText = 'AUTOLAND';
                    UI.fmaIls.style.color = '#0f0';
                } else {
                    let catText = WEATHER.mode > 0 ? " CAT III" : "";
                    UI.fmaIls.innerText = 'ILS 36' + catText;
                    UI.fmaIls.style.color = '#f0f';
                }

                // Localizer (Horizontal alignment)
                let locNormalized = Math.max(-4, Math.min(4, PHYSICS.ils.locError)) / 4;
                UI.locDiamond.style.transform = `translateX(calc(-50% + ${-locNormalized * 70}px)) rotate(45deg)`;

                // Glideslope (Vertical alignment)
                let gsNormalized = Math.max(-100, Math.min(100, PHYSICS.ils.gsError)) / 100;
                UI.gsDiamond.style.transform = `translateY(calc(-50% + ${gsNormalized * 70}px)) rotate(45deg)`;
            } else {
                UI.ilsLoc.style.display = 'none';
                UI.ilsGs.style.display = 'none';
                UI.fmaIls.innerText = '';
            }

            // Values
            UI.thrust.innerText = (PHYSICS.throttle * 100).toFixed(0) + '%';
            UI.aoa.innerText = aoaDeg.toFixed(1) + '°';
            UI.gforce.innerText = PHYSICS.gForce.toFixed(1);
            UI.vs.innerText = Math.round(vsFpm);

            if (PHYSICS.gearTransition === 1) { UI.gear.innerText = 'DOWN'; UI.gear.style.color = '#0f0'; }
            else if (PHYSICS.gearTransition === 0) { UI.gear.innerText = 'UP'; UI.gear.style.color = '#fff'; }
            else { UI.gear.innerText = 'MOVING'; UI.gear.style.color = '#ff0'; }

            // Flaps, Spoilers, Brakes
            UI.flaps.innerText = (PHYSICS.flaps * 100).toFixed(0) + '%';

            if (PHYSICS.spoilers) { UI.spoilers.innerText = 'DEPLOYED'; UI.spoilers.style.color = '#ff0'; }
            else { UI.spoilers.innerText = 'RETRACTED'; UI.spoilers.style.color = '#fff'; }

            if (PHYSICS.brakes) { UI.brakes.innerText = 'ON'; UI.brakes.style.color = '#f00'; }
            else { UI.brakes.innerText = 'OFF'; UI.brakes.style.color = '#fff'; }

            // Advanced Warning System (GPWS) - Disabled for relaxing gameplay
            UI.warning.style.display = 'none';

            // Draw Minimap
            mmCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
            mmCtx.save();

            // Move to center of minimap
            mmCtx.translate(minimapCanvas.width / 2, minimapCanvas.height / 2);

            // Rotate the world opposite to the plane's heading so plane always points UP
            mmCtx.rotate(euler.y);

            const mmScale = 0.015; // Zoom level

            // Scale and translate the context to match world coordinates
            mmCtx.scale(mmScale, mmScale);
            mmCtx.translate(-PHYSICS.position.x, -PHYSICS.position.z);

            // Calculate visible bounds in world coordinates
            const viewRadiusWorld = (minimapCanvas.width / 2) / mmScale;
            const step = 400; // Resolution of the minimap terrain (lower is higher res)

            // Draw top-down procedural terrain
            const startX = Math.floor((PHYSICS.position.x - viewRadiusWorld * 1.5) / step) * step;
            const endX = Math.floor((PHYSICS.position.x + viewRadiusWorld * 1.5) / step) * step;
            const startZ = Math.floor((PHYSICS.position.z - viewRadiusWorld * 1.5) / step) * step;
            const endZ = Math.floor((PHYSICS.position.z + viewRadiusWorld * 1.5) / step) * step;

            for (let x = startX; x <= endX; x += step) {
                for (let z = startZ; z <= endZ; z += step) {
                    let height = getTerrainHeight(x, z);

                    if (PHYSICS.egpwsMode) {
                        // EGPWS Terrain Radar (Relative Altitude)
                        let altDiff = height - PHYSICS.position.y;
                        if (altDiff > 0) mmCtx.fillStyle = '#ff0000'; // Danger (Terrain above)
                        else if (altDiff > -150) mmCtx.fillStyle = '#ffaa00'; // Orange
                        else if (altDiff > -300) mmCtx.fillStyle = '#ffff00'; // Yellow
                        else if (altDiff > -600) mmCtx.fillStyle = '#00ff00'; // Green
                        else if (altDiff > -1000) mmCtx.fillStyle = '#004400'; // Dark Green
                        else if (height <= -5) mmCtx.fillStyle = '#000022'; // Deep water tracking
                        else mmCtx.fillStyle = '#000000'; // Safe / Not picked up by radar
                    } else {
                        // Color code the topography (VFR Map)
                        if (height <= -5) {
                            mmCtx.fillStyle = '#0a5b8c'; // Deep Water
                        } else if (height < 25) {
                            mmCtx.fillStyle = '#355e3b'; // Lowland
                        } else if (height < 150) {
                            mmCtx.fillStyle = '#2a4b2a'; // Forest
                        } else if (height < 400) {
                            mmCtx.fillStyle = '#555555'; // Rock
                        } else {
                            mmCtx.fillStyle = '#ffffff'; // Snow Peak
                        }
                    }

                    // Overlap slightly to prevent gaps when rotating
                    mmCtx.fillRect(x, z, step + 15, step + 15);
                }
            }

            // Draw Runway on minimap
            mmCtx.fillStyle = '#222222';
            mmCtx.fillRect(-75, -2000, 150, 4000);

            // Draw Runway Centerline
            mmCtx.fillStyle = '#ffffff';
            mmCtx.fillRect(-5, -1950, 10, 3900);

            // Animated Sweeping Radar Beam for EGPWS
            if (PHYSICS.egpwsMode) {
                let sweepAngle = (performance.now() / 600) % (Math.PI * 2);

                mmCtx.fillStyle = 'rgba(0, 255, 0, 0.15)';
                mmCtx.beginPath();
                mmCtx.moveTo(PHYSICS.position.x, PHYSICS.position.z);
                mmCtx.arc(PHYSICS.position.x, PHYSICS.position.z, viewRadiusWorld * 1.5, sweepAngle, sweepAngle + 0.4);
                mmCtx.lineTo(PHYSICS.position.x, PHYSICS.position.z);
                mmCtx.fill();

                mmCtx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
                mmCtx.lineWidth = 150; // Thick line relative to the zoomed out world scale
                mmCtx.beginPath();
                mmCtx.moveTo(PHYSICS.position.x, PHYSICS.position.z);
                mmCtx.lineTo(PHYSICS.position.x + Math.cos(sweepAngle + 0.4) * viewRadiusWorld * 1.5,
                    PHYSICS.position.z + Math.sin(sweepAngle + 0.4) * viewRadiusWorld * 1.5);
                mmCtx.stroke();
            }

            mmCtx.restore();

            // Draw ND Range Rings (Glass Cockpit Style)
            mmCtx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
            mmCtx.lineWidth = 2;
            mmCtx.beginPath();
            mmCtx.arc(minimapCanvas.width / 2, minimapCanvas.height / 2, 50, 0, Math.PI * 2);
            mmCtx.stroke();
            mmCtx.beginPath();
            mmCtx.arc(minimapCanvas.width / 2, minimapCanvas.height / 2, 100, 0, Math.PI * 2);
            mmCtx.stroke();
            mmCtx.beginPath();
            mmCtx.arc(minimapCanvas.width / 2, minimapCanvas.height / 2, 150, 0, Math.PI * 2);
            mmCtx.stroke();

            // Draw Plane marker (Always center, pointing up)
            mmCtx.fillStyle = '#0f0';
            mmCtx.beginPath();
            mmCtx.moveTo(minimapCanvas.width / 2, minimapCanvas.height / 2 - 10);
            mmCtx.lineTo(minimapCanvas.width / 2 + 8, minimapCanvas.height / 2 + 10);
            mmCtx.lineTo(minimapCanvas.width / 2, minimapCanvas.height / 2 + 5);
            mmCtx.lineTo(minimapCanvas.width / 2 - 8, minimapCanvas.height / 2 + 10);
            mmCtx.fill();

            // Draw Map Mode Text
            mmCtx.fillStyle = PHYSICS.egpwsMode ? '#0f0' : '#0aa';
            mmCtx.font = 'bold 16px monospace';
            mmCtx.textAlign = 'left';
            mmCtx.fillText(PHYSICS.egpwsMode ? 'EGPWS' : 'VFR', 10, 25);
        }

  return { updateHUD };
}
