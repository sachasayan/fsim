export const AIRPORT_CONFIG = {
    RUNWAY: {
        x: 0,
        z: 0,
        width: 100,
        length: 4000
    },
    // Principal coordinates
    TOWER: {
        x: -190,
        z: -300
    },
    APRON: {
        x: -190,
        z: -450,
        width: 180,
        depth: 600
    },
    TAXIWAY: {
        width: 20
    },
    HANGARS: [
        { x: -190, z: -480, angle: Math.PI / 2 },
        { x: -190, z: -560, angle: Math.PI / 2 },
        { x: -190, z: -640, angle: Math.PI / 2 }
    ],

    // LOD Thresholds
    LOD: {
        HIGH: 5000,
        MID: 12000,
        LOW: 25000,
        CULL: 30000
    }
};

// Common materials or material properties could go here too if needed
