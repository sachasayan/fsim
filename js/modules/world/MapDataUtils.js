export const DISTRICT_TYPES = ['financial_core', 'commercial', 'residential', 'industrial', 'suburban'];

export function getDistrictType(district) {
    return district?.district_type || district?.type || 'residential';
}

export function normalizeDistrict(rawDistrict, cityId = null) {
    const district = rawDistrict;
    district.district_type = getDistrictType(district);
    delete district.type;
    if (cityId && !district.city_id) district.city_id = cityId;
    if (!Array.isArray(district.points)) {
        district.points = null;
        return district;
    }
    const hasCenter = Array.isArray(district.center) && district.center.length === 2;
    let looksRelative = false;
    if (hasCenter && district.points.length > 0) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        let sumX = 0, sumZ = 0;
        for (const [x, z] of district.points) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
            sumX += x;
            sumZ += z;
        }
        const centroidX = sumX / district.points.length;
        const centroidZ = sumZ / district.points.length;
        const maxSpan = Math.max(maxX - minX, maxZ - minZ, 1);
        const centroidOffset = Math.hypot(centroidX - district.center[0], centroidZ - district.center[1]);
        looksRelative =
            district.points.some(([x, z]) => Math.abs(x - district.center[0]) > 5000 || Math.abs(z - district.center[1]) > 5000) ||
            centroidOffset > Math.max(1500, maxSpan * 2.5, (district.radius || 0) * 3);
    }
    if (looksRelative) {
        district.points = district.points.map(([x, z]) => [district.center[0] + x, district.center[1] + z]);
    }
    return district;
}

export function getDistrictsForCity(data, cityId) {
    return (data.districts || []).filter(district => district.city_id === cityId);
}

export function normalizeTerrainEdit(rawEdit) {
    const edit = rawEdit;
    edit.kind = edit.kind || 'raise';
    edit.radius = Number.isFinite(edit.radius) ? edit.radius : 300;
    edit.delta = Number.isFinite(edit.delta) ? edit.delta : 40;
    if (Array.isArray(edit.points) && edit.points.length > 0) {
        let sumX = 0;
        let sumZ = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        edit.points = edit.points
            .filter(point => Array.isArray(point) && point.length >= 2)
            .map(([x, z]) => [Math.round(x), Math.round(z)]);
        for (const [x, z] of edit.points) {
            sumX += x;
            sumZ += z;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
        if (edit.points.length > 0) {
            edit.x = Math.round(sumX / edit.points.length);
            edit.z = Math.round(sumZ / edit.points.length);
        }
    } else {
        edit.points = null;
        edit.x = Number.isFinite(edit.x) ? edit.x : 0;
        edit.z = Number.isFinite(edit.z) ? edit.z : 0;
    }
    if (edit.kind === 'flatten') {
        edit.opacity = Number.isFinite(edit.opacity) ? edit.opacity : 0.65;
        edit.target_height = Number.isFinite(edit.target_height) ? edit.target_height : 0;
    }
    return edit;
}

export function normalizeMapData(data) {
    if (!data.cities) data.cities = [];
    if (!data.districts) data.districts = [];
    if (!data.terrainEdits) data.terrainEdits = [];

    const flattenedDistricts = [...data.districts];
    data.cities.forEach(city => {
        delete city.radius;
        if (!Array.isArray(city.districts)) city.districts = [];
        for (const district of city.districts) {
            flattenedDistricts.push({ ...district, city_id: district.city_id || city.id });
        }
        city.districts = [];
    });

    data.districts = flattenedDistricts.map(district => normalizeDistrict(district));
    data.terrainEdits = data.terrainEdits.map(edit => normalizeTerrainEdit(edit));
    return data;
}

function getDistrictVertices(district) {
    if (district.points?.length >= 3) return district.points;
    if (!Array.isArray(district.center) || !Number.isFinite(district.radius)) return [];
    const [cx, cz] = district.center;
    const r = district.radius;
    return [
        [cx - r, cz - r],
        [cx + r, cz - r],
        [cx + r, cz + r],
        [cx - r, cz + r]
    ];
}

function getDistrictBounds(district) {
    const vertices = getDistrictVertices(district);
    if (vertices.length === 0) {
        const [cx, cz] = Array.isArray(district.center) ? district.center : [0, 0];
        const r = Number.isFinite(district.radius) ? district.radius : 0;
        return { minX: cx - r, maxX: cx + r, minZ: cz - r, maxZ: cz + r };
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of vertices) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    return { minX, maxX, minZ, maxZ };
}

function getDistrictCenter(district, bounds) {
    if (Array.isArray(district.center) && district.center.length === 2) return district.center;
    return [(bounds.minX + bounds.maxX) * 0.5, (bounds.minZ + bounds.maxZ) * 0.5];
}

function collectNormalizedDistricts(data) {
    const districts = [];
    const hasTopLevelDistricts = Array.isArray(data.districts) && data.districts.length > 0;

    for (const district of data.districts || []) {
        districts.push(normalizeDistrict({ ...district }));
    }

    if (!hasTopLevelDistricts) {
        for (const city of data.cities || []) {
            for (const district of city.districts || []) {
                districts.push(normalizeDistrict({ ...district }, city.id));
            }
        }
    }

    return districts
        .filter(district => Array.isArray(district.center) && district.center.length === 2)
        .map((district, index) => {
            const bounds = getDistrictBounds(district);
            return {
                district,
                bounds,
                center: getDistrictCenter(district, bounds),
                index
            };
        });
}

function chooseRoadProfile(district, explicitCityConfigs, recordIndex) {
    const explicit = district.city_id ? explicitCityConfigs.get(district.city_id) : null;
    if (explicit?.road) return { ...explicit.road };

    const districtType = getDistrictType(district);
    const defaultsByType = {
        financial_core: { blockScale: 105, arterialSpacing: 380, density: 0.88 },
        commercial: { blockScale: 120, arterialSpacing: 430, density: 0.78 },
        residential: { blockScale: 150, arterialSpacing: 560, density: 0.6 },
        industrial: { blockScale: 160, arterialSpacing: 620, density: 0.52 },
        suburban: { blockScale: 180, arterialSpacing: 700, density: 0.42 }
    };
    const defaults = defaultsByType[districtType] || defaultsByType.residential;
    return {
        seed: 1000 + recordIndex,
        blockScale: defaults.blockScale,
        arterialSpacing: defaults.arterialSpacing,
        density: defaults.density
    };
}

export function buildDistrictRecords(data) {
    const districtEntries = collectNormalizedDistricts(data);
    if (districtEntries.length === 0) return [];

    const explicitCityConfigs = new Map((data.cities || []).map(city => [city.id, city]));
    const baseIdCounts = new Map();

    return districtEntries.map(({ district, center, bounds, index }) => {
        const preferredBaseId = district.id || district.city_id || `district_${index + 1}`;
        const occurrence = (baseIdCounts.get(preferredBaseId) || 0) + 1;
        baseIdCounts.set(preferredBaseId, occurrence);
        const id = occurrence === 1 ? preferredBaseId : `${preferredBaseId}_${occurrence}`;

        return {
            id,
            center,
            bounds,
            road: chooseRoadProfile(district, explicitCityConfigs, index),
            districts: [{ ...district }]
        };
    });
}

export function buildCityRecords(data) {
    return buildDistrictRecords(data);
}
