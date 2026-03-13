import * as THREE from 'three';
import { fetchDistrictIndex } from '../world/terrain/CityChunkLoader.js';
import { MapTileManager } from './MapTileManager.js';

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
        gforce: document.getElementById('hud-gforce'),
        tokenCounter: document.getElementById('token-counter'),
        tokenCount: document.getElementById('token-count'),
        tokenBurst: document.querySelector('#token-counter .token-counter-burst')
    };

    const minimapCanvas = document.getElementById('minimap');
    if (!minimapCanvas) {
        return {
            updateHUD: () => { },
            showTokenPickup: () => { },
            resetTransientHud: () => { }
        };
    }

    const mmCtx = minimapCanvas.getContext('2d');
    const mapW = minimapCanvas.width;
    const mapH = minimapCanvas.height;
    const centerX = mapW * 0.5;
    const centerY = mapH * 0.5;
    const pixelsPerWorld = 0.0225;
    const samplePx = 8;
    const mapState = {
        districts: []
    };
    const tokenState = {
        count: 0,
        visibleUntil: 0,
        pulseUntil: 0,
        flashUntil: 0
    };

    const tileManager = new MapTileManager({
        sampleTerrainHeight: getTerrainHeight,
        tileSize: 128,
        pixelRatio: 0.5,
        useHillshading: false
    });

    fetchDistrictIndex().then(data => {
        mapState.districts = data;
    });

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

    function showTokenPickup(countOrOptions) {
        const count = typeof countOrOptions === 'object' && countOrOptions !== null
            ? countOrOptions.count
            : countOrOptions;
        tokenState.count = count;
        tokenState.visibleUntil = performance.now() + 3600;
        tokenState.pulseUntil = performance.now() + 550;
        tokenState.flashUntil = performance.now() + 260;
        if (UI.tokenCount) {
            UI.tokenCount.innerText = String(count).padStart(2, '0');
        }
    }

    function resetTransientHud() {
        tokenState.count = 0;
        tokenState.visibleUntil = 0;
        tokenState.pulseUntil = 0;
        tokenState.flashUntil = 0;
        if (UI.tokenCounter) {
            UI.tokenCounter.classList.remove('is-visible', 'is-pulsing', 'is-flashing');
        }
        if (UI.tokenCount) {
            UI.tokenCount.innerText = '00';
        }
    }

    function updateHUD() {
        const now = performance.now();

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

        if (UI.tokenCounter) {
            UI.tokenCounter.classList.toggle('is-visible', now < tokenState.visibleUntil);
            UI.tokenCounter.classList.toggle('is-pulsing', now < tokenState.pulseUntil);
            UI.tokenCounter.classList.toggle('is-flashing', now < tokenState.flashUntil);
        }


        // Draw North-up full-color world map using Tile System
        tileManager.draw(mmCtx, PHYSICS.position.x, PHYSICS.position.z, pixelsPerWorld, mapW, mapH);

        // Runway overlay (drawn every frame on top of tiles since camera center moves)
        const rwCenterX = centerX + (0 - PHYSICS.position.x) * pixelsPerWorld;
        const rwCenterY = centerY + (0 - PHYSICS.position.z) * pixelsPerWorld;
        const rwW = 100 * pixelsPerWorld;
        const rwL = 4000 * pixelsPerWorld;
        mmCtx.fillStyle = 'rgba(30, 30, 30, 0.95)';
        mmCtx.fillRect(rwCenterX - rwW * 0.5, rwCenterY - rwL * 0.5, rwW, rwL);
        mmCtx.fillStyle = 'rgba(245, 245, 245, 0.95)';
        mmCtx.fillRect(rwCenterX - 1.5, rwCenterY - rwL * 0.48, 3, rwL * 0.96);
        // Taxiway dot
        const twX = centerX + (-190 - PHYSICS.position.x) * pixelsPerWorld;
        const twY = centerY + (-300 - PHYSICS.position.z) * pixelsPerWorld;
        mmCtx.fillStyle = '#ffd26f';
        mmCtx.beginPath();
        mmCtx.arc(twX, twY, 3.5, 0, Math.PI * 2);
        mmCtx.fill();

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

        // Nearest District Pointer
        if (mapState.districts.length > 0) {
            let nearestDistrict = null;
            let minDist = Infinity;
            for (const district of mapState.districts) {
                const d = Math.hypot(PHYSICS.position.x - district.cx, PHYSICS.position.z - district.cz);
                if (d < minDist) {
                    minDist = d;
                    nearestDistrict = district;
                }
            }

            if (nearestDistrict) {
                const dx = (nearestDistrict.cx - PHYSICS.position.x) * pixelsPerWorld;
                const dz = (nearestDistrict.cz - PHYSICS.position.z) * pixelsPerWorld;
                const distOnMap = Math.hypot(dx, dz);
                const angle = Math.atan2(dz, dx);

                // If the district is far enough away to warrant a pointer
                if (distOnMap > 20) {
                    const margin = 12;
                    const pointerR = Math.min(distOnMap, mapW * 0.5 - margin);
                    const px = centerX + Math.cos(angle) * pointerR;
                    const py = centerY + Math.sin(angle) * pointerR;

                    mmCtx.save();
                    mmCtx.translate(px, py);
                    mmCtx.rotate(angle + Math.PI / 2);
                    mmCtx.fillStyle = distOnMap < mapW * 0.5 ? '#66ffcc' : '#ffcc66';
                    mmCtx.beginPath();
                    mmCtx.moveTo(0, -6);
                    mmCtx.lineTo(4, 4);
                    mmCtx.lineTo(-4, 4);
                    mmCtx.closePath();
                    mmCtx.fill();

                    mmCtx.font = '8px monospace';
                    mmCtx.textAlign = 'center';
                    mmCtx.fillText(`${Math.round(minDist / 1000)}km`, 0, 14);
                    mmCtx.restore();
                }
            }
        }
    }

    return { updateHUD, showTokenPickup, resetTransientHud };
}
