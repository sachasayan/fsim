export const DISTRICT_TYPES = ['financial_core', 'commercial', 'residential', 'industrial', 'suburban', 'windmill_farm'];
export const ROAD_KINDS = ['road', 'taxiway', 'service'];
export const ROAD_SURFACES = ['asphalt', 'gravel', 'dirt'];
export const WINDMILL_FARM_DEFAULTS = Object.freeze({
    turbine_density: 0.5,
    rotor_radius: 22,
    setback: 90
});

function clampNumber(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

export function getDistrictType(district) {
    return district?.district_type || district?.type || 'residential';
}

export function normalizeWindmillFarmProps(district) {
    district.turbine_density = clampNumber(district.turbine_density, 0.05, 1.0, WINDMILL_FARM_DEFAULTS.turbine_density);
    district.rotor_radius = clampNumber(district.rotor_radius, 8, 80, WINDMILL_FARM_DEFAULTS.rotor_radius);
    district.setback = clampNumber(district.setback, 20, 240, WINDMILL_FARM_DEFAULTS.setback);
    return district;
}

export function normalizeDistrict(rawDistrict, cityId = null) {
    const district = rawDistrict;
    district.district_type = getDistrictType(district);
    delete district.type;
    if (!DISTRICT_TYPES.includes(district.district_type)) {
        district.district_type = 'residential';
    }
    if (cityId && !district.city_id) district.city_id = cityId;
    if (!Array.isArray(district.points) && Array.isArray(district.footprint)) {
        district.points = district.footprint;
    }
    if (!Array.isArray(district.points)) district.points = null;
    delete district.footprint;
    if (!Array.isArray(district.points)) return district;
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
    if (district.district_type === 'windmill_farm') {
        normalizeWindmillFarmProps(district);
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

export function normalizeRoad(rawRoad) {
    const road = rawRoad;
    road.kind = ROAD_KINDS.includes(road.kind) ? road.kind : 'road';
    road.surface = ROAD_SURFACES.includes(road.surface) ? road.surface : 'asphalt';
    road.width = Number.isFinite(road.width) ? road.width : 18;
    road.feather = Number.isFinite(road.feather) ? road.feather : Math.max(0, road.width * 0.35);
    road.center = Array.isArray(road.center) && road.center.length >= 2
        ? [Math.round(road.center[0]), Math.round(road.center[1])]
        : null;

    if (!Array.isArray(road.points)) {
        road.points = null;
        return road;
    }

    road.points = road.points
        .filter(point => Array.isArray(point) && point.length >= 2)
        .map(([x, z]) => [Math.round(x), Math.round(z)]);

    if (road.points.length < 2) {
        road.points = null;
        return road;
    }

    let sumX = 0, sumZ = 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of road.points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        sumX += x;
        sumZ += z;
    }

    if (road.center) {
        const centroidX = sumX / road.points.length;
        const centroidZ = sumZ / road.points.length;
        const maxSpan = Math.max(maxX - minX, maxZ - minZ, road.width, 1);
        const centroidOffset = Math.hypot(centroidX - road.center[0], centroidZ - road.center[1]);
        const looksRelative =
            road.points.some(([x, z]) => Math.abs(x - road.center[0]) > 5000 || Math.abs(z - road.center[1]) > 5000) ||
            centroidOffset > Math.max(1500, maxSpan * 2.5);

        if (looksRelative) {
            road.points = road.points.map(([x, z]) => [road.center[0] + x, road.center[1] + z]);
        }
    }

    const finalSum = road.points.reduce((acc, [x, z]) => {
        acc.x += x;
        acc.z += z;
        return acc;
    }, { x: 0, z: 0 });
    road.center = [
        Math.round(finalSum.x / road.points.length),
        Math.round(finalSum.z / road.points.length)
    ];

    return road;
}

export function normalizeMapData(data) {
    if (!data.cities) data.cities = [];
    if (!data.districts) data.districts = [];
    if (!data.roads) data.roads = [];
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
    data.roads = data.roads
        .map(road => normalizeRoad(road))
        .filter(road => Array.isArray(road.points) && road.points.length >= 2);
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
    const boundsCenter = [(bounds.minX + bounds.maxX) * 0.5, (bounds.minZ + bounds.maxZ) * 0.5];
    return boundsCenter;
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
        .filter(district => Array.isArray(district.points) && district.points.length >= 3)
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

function hashDistrictGeometry(district, index) {
    const type = getDistrictType(district);
    const geom = JSON.stringify((district.points || []).map(([x, z]) => [Math.round(x), Math.round(z)]));
    let h = 2166136261;
    const input = `${type}|${geom}|${index}`;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}

export function buildDistrictRecords(data) {
    const districtEntries = collectNormalizedDistricts(data);
    if (districtEntries.length === 0) return [];

    return districtEntries.map(({ district, center, bounds, index }) => {
        const id = `district_${hashDistrictGeometry(district, index)}`;

        return {
            id,
            center,
            bounds,
            districts: [{ ...district }]
        };
    });
}

export function buildCityRecords(data) {
    return buildDistrictRecords(data);
}
