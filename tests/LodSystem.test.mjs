import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createRuntimeLodSettings,
    normalizeLodSettings,
    resolveDistanceLod,
    resolveTerrainRingLod
} from '../js/modules/world/LodSystem.js';

test('resolveDistanceLod applies hysteresis around thresholds', () => {
    const thresholds = [12000, 25000, 30000];

    assert.equal(resolveDistanceLod(13000, 0, thresholds, 750), 1);
    assert.equal(resolveDistanceLod(12500, 1, thresholds, 750), 1);
    assert.equal(resolveDistanceLod(13000, null, thresholds, 750), 1);
    assert.equal(resolveDistanceLod(24300, 1, thresholds, 750), 1);
    assert.equal(resolveDistanceLod(26000, 1, thresholds, 750), 2);
});

test('resolveTerrainRingLod preserves the current ring hysteresis behavior', () => {
    const terrainSettings = {
        ringThresholds: [1, 3, 6],
        ringHysteresis: 1
    };

    assert.equal(resolveTerrainRingLod(1, 0, terrainSettings), 0);
    assert.equal(resolveTerrainRingLod(2, 0, terrainSettings), 1);
    assert.equal(resolveTerrainRingLod(4, 1, terrainSettings), 1);
    assert.equal(resolveTerrainRingLod(7, 2, terrainSettings), 2);
    assert.equal(resolveTerrainRingLod(6, 3, terrainSettings), 2);
});

test('normalizeLodSettings clamps and orders GUI-editable values', () => {
    const settings = createRuntimeLodSettings();
    settings.world.updateIntervalMs = 0;
    settings.airport.thresholds.mid = 24000;
    settings.airport.thresholds.low = 12000;
    settings.airport.thresholds.cull = 10000;
    settings.terrain.renderDistance = -2;
    settings.terrain.ringThresholds = [5, 2, 1];

    normalizeLodSettings(settings);

    assert.equal(settings.world.updateIntervalMs, 16);
    assert.deepEqual(settings.airport.thresholds, {
        mid: 24000,
        low: 24000,
        cull: 24000
    });
    assert.equal(settings.terrain.renderDistance, 0);
    assert.deepEqual(settings.terrain.ringThresholds, [5, 5, 5]);
});
