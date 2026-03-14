import test from 'node:test';
import assert from 'node:assert/strict';

import { DISTRICT_TYPES, WINDMILL_FARM_DEFAULTS, normalizeMapData } from '../js/modules/world/MapDataUtils.js';

test('normalizeMapData injects default terrain generator config', () => {
    const data = {};

    normalizeMapData(data);

    assert.equal(data.terrainGenerator.version, 2);
    assert.equal(data.terrainGenerator.preset, 'balanced');
    assert.equal(data.terrainGenerator.preview.overlay, 'height');
    assert.equal(data.terrainGenerator.landforms.canyonDepth, 0.44);
});

test('normalizeMapData clamps terrain generator values', () => {
    const data = {
        terrainGenerator: {
            seed: -20,
            macro: { ridgeAmplitude: 99999 },
            landforms: { canyonWidth: 99 },
            hydrology: { riverCount: -3 },
            preview: { opacity: 4 }
        }
    };

    normalizeMapData(data);

    assert.equal(data.terrainGenerator.seed, 1);
    assert.equal(data.terrainGenerator.macro.ridgeAmplitude, 1600);
    assert.equal(data.terrainGenerator.landforms.canyonWidth, 1);
    assert.equal(data.terrainGenerator.hydrology.riverCount, 0);
    assert.equal(data.terrainGenerator.preview.opacity, 1);
});

test('normalizeMapData normalizes authored road polylines', () => {
    const data = {
        roads: [
            {
                kind: 'taxiway',
                center: [1000, 2000],
                width: 24,
                points: [[-200, 0], [0, 0], [200, 0]]
            }
        ]
    };

    normalizeMapData(data);

    assert.equal(data.roads.length, 1);
    assert.equal(data.roads[0].kind, 'taxiway');
    assert.equal(data.roads[0].surface, 'asphalt');
    assert.equal(data.roads[0].width, 24);
    assert.ok(Math.abs(data.roads[0].feather - 8.4) < 1e-9);
    assert.deepEqual(data.roads[0].center, [1000, 2000]);
    assert.deepEqual(data.roads[0].points, [[800, 2000], [1000, 2000], [1200, 2000]]);
});

test('normalizeMapData accepts windmill farm districts and applies defaults', () => {
    const data = {
        districts: [
            {
                district_type: 'windmill_farm',
                center: [1000, 2000],
                radius: 800,
                points: [[400, 1400], [1600, 1400], [1600, 2600], [400, 2600]]
            }
        ]
    };

    normalizeMapData(data);

    assert.ok(DISTRICT_TYPES.includes('windmill_farm'));
    assert.equal(data.districts[0].district_type, 'windmill_farm');
    assert.equal(data.districts[0].turbine_density, WINDMILL_FARM_DEFAULTS.turbine_density);
    assert.equal(data.districts[0].rotor_radius, WINDMILL_FARM_DEFAULTS.rotor_radius);
    assert.equal(data.districts[0].setback, WINDMILL_FARM_DEFAULTS.setback);
});

test('normalizeMapData clamps invalid windmill farm props', () => {
    const data = {
        districts: [
            {
                district_type: 'windmill_farm',
                center: [1000, 2000],
                radius: 800,
                points: [[400, 1400], [1600, 1400], [1600, 2600], [400, 2600]],
                turbine_density: 4,
                rotor_radius: 2,
                setback: 999
            }
        ]
    };

    normalizeMapData(data);

    assert.equal(data.districts[0].turbine_density, 1);
    assert.equal(data.districts[0].rotor_radius, 8);
    assert.equal(data.districts[0].setback, 240);
});
