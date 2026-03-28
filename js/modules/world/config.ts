type AirportPoint = {
    x: number;
    z: number;
};

type AirportRect = AirportPoint & {
    width: number;
    length?: number;
    depth?: number;
};

type HangarConfig = AirportPoint & {
    yawDeg: number;
};

export const AIRPORT_CONFIG: {
    RUNWAY: Required<Pick<AirportRect, 'x' | 'z' | 'width' | 'length'>>;
    TOWER: AirportPoint;
    APRON: Required<Pick<AirportRect, 'x' | 'z' | 'width' | 'depth'>>;
    RADAR: AirportPoint;
    TAXIWAY: { width: number };
    HANGARS: HangarConfig[];
} = {
    RUNWAY: {
        x: 0,
        z: 0,
        width: 100,
        length: 4000
    },
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
    RADAR: {
        x: -250,
        z: -450
    },
    TAXIWAY: {
        width: 20
    },
    HANGARS: [
        { x: -190, z: -480, yawDeg: 90 },
        { x: -190, z: -560, yawDeg: 90 },
        { x: -190, z: -640, yawDeg: 90 }
    ]
};
