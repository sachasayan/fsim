import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildScenarioQuery,
    getPerfScenario,
    listPerfScenarios,
    listPerfSweeps,
    mergeScenarioVariant
} from '../scripts/perf-scenarios.mjs';

test('perf scenarios expose the expected named suite', () => {
    const scenarioIds = listPerfScenarios().map((scenario) => scenario.id);
    assert.deepEqual(scenarioIds, [
        'startup_steady_state',
        'terrain_streaming_low_alt',
        'terrain_streaming_high_alt',
        'gpu_heavy_visuals',
        'cpu_isolation',
        'content_stress_city'
    ]);
});

test('scenario query builder preserves base settings and env overrides', () => {
    const scenario = getPerfScenario('cpu_isolation');
    const query = buildScenarioQuery(scenario, 'renderDist=2&fog=1');
    assert.equal(query.get('shadows'), '0');
    assert.equal(query.get('clouds'), '0');
    assert.equal(query.get('renderDist'), '2');
    assert.equal(query.get('fog'), '1');
});

test('sweep variants merge runtime overrides without losing scenario metadata', () => {
    const scenario = getPerfScenario('content_stress_city');
    const terrainOnlySweep = listPerfSweeps().find((entry) => entry.id === 'terrain_only');
    const merged = mergeScenarioVariant(scenario, terrainOnlySweep);

    assert.equal(merged.id, 'content_stress_city:terrain_only');
    assert.equal(merged.runtime.hidePlane, true);
    assert.equal(merged.runtime.terrain.showTrees, false);
    assert.equal(merged.runtime.terrain.showBuildings, false);
    assert.equal(merged.camera.distance, scenario.camera.distance);
});
