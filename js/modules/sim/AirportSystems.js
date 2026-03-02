import * as THREE from 'three';

export function createAirportSystems({ PAPI, alsStrobes, strobeMatOn, strobeMatOff }) {
    let prevAlsTargetIndex = -1;
    let prevPapiKey = '';
    const tmpHdgEuler = new THREE.Euler();

    function getHeadingDiff(headingDeg, targetDeg) {
        let d = headingDeg - targetDeg;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return Math.abs(d);
    }

    function setPapiColors(lights, whiteCount) {
        for (let i = 0; i < lights.length; i++) {
            lights[i].material = (i >= (4 - whiteCount)) ? PAPI.matWhite : PAPI.matRed;
        }
    }

    function updateALS(now) {
        let rabbitCycle = (now / 500) % 1.0; // Loops every 0.5s
        let targetDist = 900 - (rabbitCycle * 600); // Sequence runs from 900m down to 300m
        let targetIdx = -1;
        for (let i = 0; i < alsStrobes.length; i++) {
            if (Math.abs(alsStrobes[i].dist - targetDist) < 40) {
                targetIdx = i;
                break;
            }
        }
        if (targetIdx !== prevAlsTargetIndex) {
            if (prevAlsTargetIndex >= 0 && prevAlsTargetIndex < alsStrobes.length) {
                alsStrobes[prevAlsTargetIndex].mesh.material = strobeMatOff;
            }
            if (targetIdx >= 0 && targetIdx < alsStrobes.length) {
                alsStrobes[targetIdx].mesh.material = strobeMatOn;
            }
            prevAlsTargetIndex = targetIdx;
        }
    }

    function updatePAPI(PHYSICS, frameCount) {
        if (frameCount % 6 !== 0) return;

        const hdgEuler = tmpHdgEuler.setFromQuaternion(PHYSICS.quaternion, 'YXZ');
        let headingDeg = -hdgEuler.y * (180 / Math.PI);
        if (headingDeg < 0) headingDeg += 360;

        const allPapiLights = PAPI.lights || [];
        const papi36 = PAPI.lights36 || [];
        const papi18 = PAPI.lights18 || [];

        const dist36 = PHYSICS.position.z - 1000;
        const dist18 = -1000 - PHYSICS.position.z;
        const canUse36 = dist36 > 0 && dist36 < 15000 && getHeadingDiff(headingDeg, 0) <= 90;
        const canUse18 = dist18 > 0 && dist18 < 15000 && getHeadingDiff(headingDeg, 180) <= 90;

        let activeSet = null;
        let activeDist = 0;
        let papiCenterX = 0;
        if (canUse36 && (!canUse18 || dist36 <= dist18)) {
            activeSet = papi36;
            activeDist = dist36;
            papiCenterX = -63;
        } else if (canUse18) {
            activeSet = papi18;
            activeDist = dist18;
            papiCenterX = 63;
        }

        if (activeSet && activeSet.length === 4) {
            const distX = PHYSICS.position.x - papiCenterX;
            const dist2D = Math.sqrt(distX * distX + activeDist * activeDist);
            const angleDeg = Math.atan2(PHYSICS.position.y - 1.5, dist2D) * (180 / Math.PI);

            let whiteCount = 0;
            if (angleDeg > 3.5) whiteCount = 4;
            else if (angleDeg > 3.0) whiteCount = 3;
            else if (angleDeg > 2.5) whiteCount = 2;
            else if (angleDeg > 2.0) whiteCount = 1;

            const activeKey = `${activeSet === papi36 ? '36' : '18'}:${whiteCount}`;
            if (activeKey !== prevPapiKey) {
                for (let i = 0; i < allPapiLights.length; i++) allPapiLights[i].material = PAPI.matOff;
                setPapiColors(activeSet, whiteCount);
                prevPapiKey = activeKey;
            }
        } else if (prevPapiKey !== '') {
            for (let i = 0; i < allPapiLights.length; i++) allPapiLights[i].material = PAPI.matOff;
            prevPapiKey = '';
        }
    }

    return {
        updateALS,
        updatePAPI
    };
}
