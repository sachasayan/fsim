import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applyAirportRunwayFlattening,
    airportContainsWorldPoint,
    buildAirportDescriptor,
    getAirportRunwayThresholds,
    normalizeAirport,
    transformAirportPoint
} from '../js/modules/world/AirportLayout.js';
import { normalizeMapData } from '../js/modules/world/MapDataUtils.js';

test('buildAirportDescriptor rotates runway thresholds with airport yaw', () => {
    const descriptor = buildAirportDescriptor({
        template: 'default',
        x: 1000,
        z: 2000,
        yaw: 90
    });

    assert.deepEqual(
        descriptor.runway.thresholds.map(({ x, z }) => [Math.round(x), Math.round(z)]),
        [[-1000, 2000], [3000, 2000]]
    );
});

test('airportContainsWorldPoint respects airport rotation', () => {
    const airport = { template: 'default', x: 1000, z: 2000, yaw: 90 };
    const alongRunway = transformAirportPoint(airport, 0, 1500);
    const offFootprint = transformAirportPoint(airport, 900, 0);

    assert.equal(airportContainsWorldPoint(airport, alongRunway.x, alongRunway.z), true);
    assert.equal(airportContainsWorldPoint(airport, offFootprint.x, offFootprint.z, 0), false);
});

test('getAirportRunwayThresholds includes legacy and authored airports', () => {
    const thresholds = getAirportRunwayThresholds({
        airports: [{ template: 'default', x: 4000, z: -2000, yaw: 0 }]
    });

    assert.equal(thresholds.length, 4);
    assert.deepEqual(
        thresholds.map(({ x, z }) => [Math.round(x), Math.round(z)]),
        [[0, -2000], [0, 2000], [4000, -4000], [4000, 0]]
    );
});

test('normalizeAirport clamps yaw and defaults template', () => {
    const airport = normalizeAirport({
        x: 123.8,
        z: -456.2,
        yaw: 999,
        template: 'unexpected'
    });

    assert.deepEqual(airport, {
        x: 124,
        z: -456,
        yaw: 180,
        template: 'default'
    });
});

test('normalizeMapData initializes and normalizes airports', () => {
    const worldData = {
        districts: [],
        roads: [],
        terrainEdits: [],
        airports: [
            { x: 10.4, z: 20.6, yaw: -200 }
        ]
    };

    normalizeMapData(worldData);

    assert.deepEqual(worldData.airports, [
        { x: 10, z: 21, yaw: -180, template: 'default' }
    ]);
});

test('buildAirportDescriptor transforms apron, tower, radar, and hangars from template', () => {
    const descriptor = buildAirportDescriptor({
        template: 'default',
        x: 1000,
        z: 2000,
        yaw: 90
    });

    assert.deepEqual(
        [Math.round(descriptor.tower.x), Math.round(descriptor.tower.z)],
        [700, 2190]
    );
    assert.deepEqual(
        [Math.round(descriptor.apron.x), Math.round(descriptor.apron.z)],
        [550, 2190]
    );
    assert.deepEqual(
        [Math.round(descriptor.radar.x), Math.round(descriptor.radar.z)],
        [550, 2250]
    );
    assert.deepEqual(
        descriptor.hangars.map(({ x, z, yaw }) => [Math.round(x), Math.round(z), Math.round(yaw)]),
        [
            [520, 2190, 180],
            [440, 2190, 180],
            [360, 2190, 180]
        ]
    );
});

test('applyAirportRunwayFlattening flattens around rotated authored airports', () => {
    const flattened = applyAirportRunwayFlattening(220, 4000, 8000, {
        airports: [{ template: 'default', x: 6000, z: 8000, yaw: 90 }]
    });
    const untouched = applyAirportRunwayFlattening(220, 4000, 9500, {
        airports: [{ template: 'default', x: 6000, z: 8000, yaw: 90 }]
    });

    assert.equal(flattened, 0);
    assert.equal(untouched, 220);
});
