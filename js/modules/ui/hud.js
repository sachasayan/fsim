import * as THREE from 'three';

export function createHUD({ PHYSICS, WEATHER, getTerrainHeight }) {
    const UI = {
        speedReadout: document.getElementById('speed-readout'),
        speedTape: document.getElementById('speed-tape-content'),
        altReadout: document.getElementById('alt-readout'),
        altTape: document.getElementById('alt-tape-content'),
        radAlt: document.getElementById('rad-alt'),
        vs: document.getElementById('hud-vs'),
        gear: document.getElementById('hud-gear'),
        flaps: document.getElementById('hud-flaps'),
        spoilers: document.getElementById('hud-spoilers'),
        brakes: document.getElementById('hud-brakes'),
        compassTape: document.getElementById('compass-tape'),
        pitchLadder: document.getElementById('pitch-ladder'),
        horizonSky: document.getElementById('horizon-sky'),
        fpv: document.getElementById('fpv'),
        thrust: document.getElementById('hud-thrust'),
        aoa: document.getElementById('hud-aoa'),
        gforce: document.getElementById('hud-gforce')
    };

    const minimapCanvas = document.getElementById('minimap');
    if (!minimapCanvas) return { updateHUD: () => { } };

    const mmCtx = minimapCanvas.getContext('2d');
    const mapW = minimapCanvas.width;
    const mapH = minimapCanvas.height;
    const centerX = mapW * 0.5;
    const centerY = mapH * 0.5;
    const pixelsPerWorld = 0.045;
    const samplePx = 4;
    const coastlineStepY = samplePx * 3;
    const coastlineStepX = samplePx * 2;
    const mapCacheCanvas = document.createElement('canvas');
    mapCacheCanvas.width = mapW;
    mapCacheCanvas.height = mapH;
    const mapCacheCtx = mapCacheCanvas.getContext('2d');
    const mapState = {
        lastRenderTime: 0,
        lastCenterX: Number.POSITIVE_INFINITY,
        lastCenterZ: Number.POSITIVE_INFINITY,
        minRenderIntervalMs: 140,
        moveThresholdWorld: 120
    };

    function terrainColor(heightValue) {
        if (heightValue < -25) return '#1d4f88';
        if (heightValue < -5) return '#2d72a8';
        if (heightValue < 8) return '#d6d2b0';
        if (heightValue < 45) return '#6f9a59';
        if (heightValue < 130) return '#4f7e42';
        if (heightValue < 240) return '#7a8c58';
        if (heightValue < 380) return '#7a736a';
        if (heightValue < 560) return '#9d9890';
        return '#f2f2f2';
    }

    function renderMapBase(centerWorldX, centerWorldZ) {
        mapCacheCtx.clearRect(0, 0, mapW, mapH);
        mapCacheCtx.fillStyle = '#0f1724';
        mapCacheCtx.fillRect(0, 0, mapW, mapH);

        // Terrain raster (cached, not per-frame)
        for (let py = 0; py < mapH; py += samplePx) {
            for (let px = 0; px < mapW; px += samplePx) {
                const wx = centerWorldX + (px - centerX) / pixelsPerWorld;
                const wz = centerWorldZ + (py - centerY) / pixelsPerWorld;
                mapCacheCtx.fillStyle = terrainColor(getTerrainHeight(wx, wz, 3));
                mapCacheCtx.fillRect(px, py, samplePx + 1, samplePx + 1);
            }
        }

        // Coastline contour pass
        mapCacheCtx.strokeStyle = 'rgba(230, 225, 180, 0.55)';
        mapCacheCtx.lineWidth = 1;
        for (let py = 0; py < mapH; py += coastlineStepY) {
            mapCacheCtx.beginPath();
            let started = false;
            for (let px = 0; px < mapW; px += coastlineStepX) {
                const wx = centerWorldX + (px - centerX) / pixelsPerWorld;
                const wz = centerWorldZ + (py - centerY) / pixelsPerWorld;
                const h = getTerrainHeight(wx, wz, 3);
                if (h > -8 && h < 6) {
                    if (!started) {
                        mapCacheCtx.moveTo(px, py);
                        started = true;
                    } else {
                        mapCacheCtx.lineTo(px, py);
                    }
                }
            }
            if (started) mapCacheCtx.stroke();
        }

        // Runway overlay
        const rwCenterX = centerX + (-centerWorldX) * pixelsPerWorld;
        const rwCenterY = centerY + (-centerWorldZ) * pixelsPerWorld;
        const rwW = 100 * pixelsPerWorld;
        const rwL = 4000 * pixelsPerWorld;
        mapCacheCtx.fillStyle = 'rgba(30, 30, 30, 0.95)';
        mapCacheCtx.fillRect(rwCenterX - rwW * 0.5, rwCenterY - rwL * 0.5, rwW, rwL);
        mapCacheCtx.fillStyle = 'rgba(245, 245, 245, 0.95)';
        mapCacheCtx.fillRect(rwCenterX - 1.5, rwCenterY - rwL * 0.48, 3, rwL * 0.96);

        // Airport tower marker (matches world/tower.js coords)
        const twX = centerX + (-190 - centerWorldX) * pixelsPerWorld;
        const twY = centerY + (-300 - centerWorldZ) * pixelsPerWorld;
        mapCacheCtx.fillStyle = '#ffd26f';
        mapCacheCtx.beginPath();
        mapCacheCtx.arc(twX, twY, 3.5, 0, Math.PI * 2);
        mapCacheCtx.fill();
    }

    // Initialize HUD generation
    function initHUD() {
        // Generate Pitch Ladder Lines
        if (UI.pitchLadder) {
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
        }

        // Generate Compass marks
        if (UI.compassTape) {
            for (let i = 0; i <= 360; i += 10) {
                let mark = document.createElement('div');
                mark.className = 'compass-mark';
                mark.innerText = i % 90 === 0 ? (i === 0 || i === 360 ? 'N' : i === 90 ? 'E' : i === 180 ? 'S' : 'W') : (i / 10).toString().padStart(2, '0');
                UI.compassTape.appendChild(mark);
            }
        }

        // Generate Tape marks (lazy loaded visually in CSS, physically in DOM)
        if (UI.speedTape) {
            for (let i = 500; i >= 0; i -= 10) {
                let mark = document.createElement('div');
                mark.className = 'tape-mark' + (i % 50 === 0 ? ' major' : '');
                mark.innerText = i % 50 === 0 ? i : '';
                UI.speedTape.appendChild(mark);
            }
        }
        if (UI.altTape) {
            for (let i = 40000; i >= -1000; i -= 100) {
                let mark = document.createElement('div');
                mark.className = 'tape-mark' + (i % 500 === 0 ? ' major' : '');
                mark.innerText = i % 500 === 0 ? i : '';
                UI.altTape.appendChild(mark);
            }
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
        if (UI.horizonSky) {
            UI.horizonSky.style.transform = `rotate(${roll}deg) translateY(${pitch * 4}px)`;
        }

        // Flight Path Vector (FPA = Pitch - AoA)
        if (UI.fpv) {
            const fpa = pitch - aoaDeg;
            UI.fpv.style.transform = `translate(${slipDeg * 4}px, ${-fpa * 4}px)`;
        }

        // Tapes (1 unit per pixel mapped mathematically)
        if (UI.speedReadout) {
            UI.speedReadout.innerText = Math.round(kts).toString().padStart(3, '0');
        }
        if (UI.speedTape) {
            // speed tape: 500 max, 10 units = 20px -> 1 unit = 2px. Offset from middle.
            let speedOffset = (500 - kts) * 2;
            UI.speedTape.style.transform = `translateY(calc(-50% + 150px - ${speedOffset}px))`;
        }

        if (UI.altReadout) {
            UI.altReadout.innerText = Math.round(altFt).toString().padStart(5, '0');
        }
        if (UI.altTape) {
            // alt tape: 40000 max, 100 units = 20px -> 1 unit = 0.2px.
            let altOffset = (40000 - altFt) * 0.2;
            UI.altTape.style.transform = `translateY(calc(-50% + 150px - ${altOffset}px))`;
        }

        // Radio Altimeter (Visible < 2500ft)
        if (UI.radAlt) {
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
        }

        // Compass (360 degrees = 36 * 30px = 1080px width)
        if (UI.compassTape) {
            let headingOffset = (heading / 10) * 30;
            UI.compassTape.style.transform = `translateX(calc(50% - ${headingOffset}px))`;
        }


        // Values
        if (UI.thrust) UI.thrust.innerText = (PHYSICS.throttle * 100).toFixed(0) + '%';
        if (UI.aoa) UI.aoa.innerText = aoaDeg.toFixed(1) + '°';
        if (UI.gforce) UI.gforce.innerText = PHYSICS.gForce.toFixed(1);
        if (UI.vs) UI.vs.innerText = Math.round(vsFpm);

        if (UI.gear) {
            if (PHYSICS.gearTransition === 1) { UI.gear.innerText = 'DOWN'; UI.gear.style.color = '#0f0'; }
            else if (PHYSICS.gearTransition === 0) { UI.gear.innerText = 'UP'; UI.gear.style.color = '#fff'; }
            else { UI.gear.innerText = 'MOVING'; UI.gear.style.color = '#ff0'; }
        }

        // Flaps, Spoilers, Brakes
        if (UI.flaps) UI.flaps.innerText = (PHYSICS.flaps * 100).toFixed(0) + '%';

        if (UI.spoilers) {
            if (PHYSICS.spoilers) { UI.spoilers.innerText = 'DEPLOYED'; UI.spoilers.style.color = '#ff0'; }
            else { UI.spoilers.innerText = 'RETRACTED'; UI.spoilers.style.color = '#fff'; }
        }

        if (UI.brakes) {
            if (PHYSICS.brakes) { UI.brakes.innerText = 'ON'; UI.brakes.style.color = '#f00'; }
            else { UI.brakes.innerText = 'OFF'; UI.brakes.style.color = '#fff'; }
        }


        // Draw North-up full-color world map (cached/throttled)
        const now = performance.now();
        const moved = Math.hypot(PHYSICS.position.x - mapState.lastCenterX, PHYSICS.position.z - mapState.lastCenterZ);
        if (
            now - mapState.lastRenderTime > mapState.minRenderIntervalMs ||
            moved > mapState.moveThresholdWorld ||
            !Number.isFinite(mapState.lastCenterX)
        ) {
            renderMapBase(PHYSICS.position.x, PHYSICS.position.z);
            mapState.lastRenderTime = now;
            mapState.lastCenterX = PHYSICS.position.x;
            mapState.lastCenterZ = PHYSICS.position.z;
        }

        mmCtx.clearRect(0, 0, mapW, mapH);
        mmCtx.drawImage(mapCacheCanvas, 0, 0);


        // Aircraft icon rotates on north-up map
        mmCtx.save();
        mmCtx.translate(centerX, centerY);
        mmCtx.rotate(-euler.y);
        mmCtx.fillStyle = '#f4ff66';
        mmCtx.beginPath();
        mmCtx.moveTo(0, -11);
        mmCtx.lineTo(8, 9);
        mmCtx.lineTo(0, 4);
        mmCtx.lineTo(-8, 9);
        mmCtx.closePath();
        mmCtx.fill();
        mmCtx.restore();

        // Map labels
        mmCtx.fillStyle = '#9ed0ff';
        mmCtx.font = 'bold 10px monospace';
        mmCtx.textAlign = 'left';
        mmCtx.fillText('MAP', 6, 16);
        mmCtx.fillStyle = '#80b7ea';
        mmCtx.font = '9px monospace';
        mmCtx.fillText('N', centerX - 3, 10);
    }

    return { updateHUD };
}
