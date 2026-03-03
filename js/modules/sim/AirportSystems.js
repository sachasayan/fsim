import * as THREE from 'three';

export function createAirportSystems({ alsStrobes, strobeColorOn, strobeColorOff }) {
    function getHeadingDiff(headingDeg, targetDeg) {
        let d = headingDeg - targetDeg;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return Math.abs(d);
    }

    function updateALS(now) {
        const rabbitCycle = (now / 500) % 1.0; // Loops every 0.5s
        const targetDist = 900 - (rabbitCycle * 600); // Sequence runs from 900m down to 300m

        const meshesToUpdate = new Set();
        for (let i = 0; i < alsStrobes.length; i++) {
            const s = alsStrobes[i];
            const shouldBeOn = Math.abs(s.dist - targetDist) < 45;

            if (s.lastState !== shouldBeOn) {
                s.mesh.setColorAt(s.index, shouldBeOn ? strobeColorOn : strobeColorOff);
                meshesToUpdate.add(s.mesh);
                s.lastState = shouldBeOn;
            }
        }

        meshesToUpdate.forEach(mesh => {
            mesh.instanceColor.needsUpdate = true;
        });
    }

    return {
        updateALS
    };
}
