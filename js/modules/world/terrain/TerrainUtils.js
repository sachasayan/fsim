export function hash2(x, z, seed = 0) {
    const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
    return n - Math.floor(n);
}

export function pickWeighted(value01, weights) {
    let sum = 0;
    for (const w of Object.values(weights)) sum += w;
    if (sum <= 0) return Object.keys(weights)[0];
    let t = value01 * sum;
    for (const [key, weight] of Object.entries(weights)) {
        t -= weight;
        if (t <= 0) return key;
    }
    return Object.keys(weights)[Object.keys(weights).length - 1];
}

export function cityHubInfluence(vx, vz) {
    const cellSize = 14000;
    const gx = Math.floor(vx / cellSize);
    const gz = Math.floor(vz / cellSize);
    let influence = 0;

    for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
            const cx = gx + ox;
            const cz = gz + oz;
            const hubChance = hash2(cx, cz, 1);
            if (hubChance < 0.35) continue;

            const centerX = (cx + 0.15 + hash2(cx, cz, 2) * 0.7) * cellSize;
            const centerZ = (cz + 0.15 + hash2(cx, cz, 3) * 0.7) * cellSize;
            const radius = 2600 + hash2(cx, cz, 4) * 5200;
            const intensity = 0.45 + hash2(cx, cz, 5) * 0.55;

            const d = Math.hypot(vx - centerX, vz - centerZ);
            const local = Math.max(0, 1 - d / radius) * intensity;
            influence = Math.max(influence, local);
        }
    }

    return influence;
}

export function getDistrictProfile(vx, vz, urbanScore, height) {
    const dx = Math.floor(vx / 3200);
    const dz = Math.floor(vz / 3200);
    const districtNoise = hash2(dx, dz, 40);
    const nearWater = height < 35;

    if (urbanScore > 0.78) {
        return {
            kind: 'financial_core',
            roadScale: 0.72,
            lotDensity: 0.22,
            classWeights: { supertall: 0.22, highrise: 0.44, office: 0.27, apartment: 0.07 }
        };
    }
    if (nearWater && urbanScore > 0.5) {
        return {
            kind: 'waterfront_mixed',
            roadScale: 0.9,
            lotDensity: 0.16,
            classWeights: { highrise: 0.2, office: 0.23, apartment: 0.33, townhouse: 0.2, industrial: 0.04 }
        };
    }
    if (districtNoise > 0.72 && urbanScore > 0.42) {
        return {
            kind: 'industrial_belt',
            roadScale: 1.12,
            lotDensity: 0.14,
            classWeights: { industrial: 0.54, office: 0.22, apartment: 0.1, townhouse: 0.14 }
        };
    }
    if (urbanScore > 0.52) {
        return {
            kind: 'mixed_use',
            roadScale: 0.96,
            lotDensity: 0.15,
            classWeights: { highrise: 0.18, office: 0.3, apartment: 0.34, townhouse: 0.14, industrial: 0.04 }
        };
    }
    return {
        kind: 'residential_ring',
        roadScale: 1.15,
        lotDensity: 0.12,
        classWeights: { apartment: 0.26, townhouse: 0.56, industrial: 0.18 }
    };
}

export function getForestProfile(vx, vz, height, forestNoise, urbanScore, Noise) {
    const moisture = (Noise.fractal(vx + 9000, vz - 7000, 3, 0.5, 0.0018) + 1) * 0.5;
    const heat = (Noise.fractal(vx - 12000, vz + 6000, 3, 0.5, 0.0012) + 1) * 0.5 - Math.max(0, height - 220) / 520;

    if (urbanScore > 0.35) {
        return {
            kind: 'parkland',
            density: 0.06,
            typeWeights: { broadleaf: 0.55, poplar: 0.35, conifer: 0.1 }
        };
    }
    if (height > 280 || heat < 0.28) {
        return {
            kind: 'alpine',
            density: 0.08 + forestNoise * 0.08,
            typeWeights: { conifer: 0.72, dry: 0.2, poplar: 0.08 }
        };
    }
    if (moisture > 0.66) {
        return {
            kind: 'dense_mixed',
            density: 0.16 + forestNoise * 0.1,
            typeWeights: { conifer: 0.46, broadleaf: 0.34, poplar: 0.2 }
        };
    }
    if (moisture < 0.35) {
        return {
            kind: 'dry_scrub',
            density: 0.05 + forestNoise * 0.05,
            typeWeights: { dry: 0.52, poplar: 0.18, broadleaf: 0.16, conifer: 0.14 }
        };
    }
    return {
        kind: 'temperate_mixed',
        density: 0.1 + forestNoise * 0.07,
        typeWeights: { broadleaf: 0.42, conifer: 0.35, poplar: 0.2, dry: 0.03 }
    };
}

export function getTerrainHeight(x, z, Noise, octaves = 6) {
    let distFromRunwayZ = Math.abs(z);
    let distFromRunwayX = Math.abs(x);

    // Base noise averages around 0, multiply and add 100 so land is naturally elevated above water
    let noiseVal = Noise.fractal(x, z, octaves, 0.5, 0.0003) * 600 + 100;

    // Flatten for runway (centered at origin, extending along Z)
    if (distFromRunwayX < 150 && distFromRunwayZ < 2500) {
        return 0; // Lock runway exactly to Y=0
    } else if (distFromRunwayX < 600 && distFromRunwayZ < 3500) {
        // Smooth radial transition — Math.max avoids the additive corner crease
        let blendX = Math.max(0, (distFromRunwayX - 150) / 450);
        let blendZ = Math.max(0, (distFromRunwayZ - 2500) / 1000);
        let runwayMask = Math.min(1.0, Math.max(blendX, blendZ));
        return noiseVal * runwayMask;
    }

    return noiseVal;
}

export function getLodForRingDistance(ringDistance, currentLod = null) {
    // Hysteresis band to avoid rapid LOD toggling near ring boundaries.
    if (currentLod === 0) {
        if (ringDistance <= 1) return 0;
        if (ringDistance <= 3) return 1;
        if (ringDistance <= 6) return 2;
        return 3;
    }
    if (currentLod === 1) {
        if (ringDistance <= 1) return 0;
        if (ringDistance <= 4) return 1;
        if (ringDistance <= 7) return 2;
        return 3;
    }
    if (currentLod === 2) {
        if (ringDistance <= 2) return 1;
        if (ringDistance <= 7) return 2;
        return 3;
    }
    if (currentLod === 3) {
        if (ringDistance <= 6) return 2;
        return 3;
    }

    if (ringDistance <= 1) return 0;
    if (ringDistance <= 3) return 1;
    if (ringDistance <= 6) return 2;
    return 3;
}
