import * as THREE from 'three';

export function createAirportSystems({ alsStrobes, strobeColorOn, strobeColorOff }) {
    let prevAlsTargetIndex = -1;
    const tmpHdgEuler = new THREE.Euler();

    function getHeadingDiff(headingDeg, targetDeg) {
        let d = headingDeg - targetDeg;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return Math.abs(d);
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
                const s = alsStrobes[prevAlsTargetIndex];
                s.mesh.setColorAt(s.index, strobeColorOff);
                s.mesh.instanceColor.needsUpdate = true;
            }
            if (targetIdx >= 0 && targetIdx < alsStrobes.length) {
                const s = alsStrobes[targetIdx];
                s.mesh.setColorAt(s.index, strobeColorOn);
                s.mesh.instanceColor.needsUpdate = true;
            }
            prevAlsTargetIndex = targetIdx;
        }
    }

    return {
        updateALS
    };
}
