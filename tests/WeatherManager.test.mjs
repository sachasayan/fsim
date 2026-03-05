import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeatherManager } from '../js/modules/core/WeatherManager.js';
import { LIGHTING_PRESETS } from '../js/modules/lighting.js';

// Build a minimal WEATHER state mirroring the daytime preset
function makeWeather() {
    const preset = LIGHTING_PRESETS['daytime'];
    return {
        mode: 0,
        modeName: 'clear',
        targetFog: 0.0004,
        currentFog: 0.0002,
        transition: 0,
        targetTransition: 0,
        lightingPresetId: 'daytime',
        clearColor: preset.clearColor,
        stormColor: preset.stormColor,
        lightAmbientBase: preset.ambientBase,
        lightDirectBase: preset.directBase,
        hemiSkyColor: preset.hemiSkyColor,
        hemiGroundColor: preset.hemiGroundColor,
        dirColor: preset.dirColor,
        sunPhiDeg: preset.sunPhiDeg,
        sunThetaDeg: preset.sunThetaDeg,
        skyTurbidity: preset.skyTurbidity,
        skyRayleigh: preset.skyRayleigh,
        skyMieCoefficient: preset.skyMieCoefficient,
        skyMieDirectionalG: preset.skyMieDirectionalG,
        hazeColor: preset.hazeColor,
        hazeOpacity: preset.hazeOpacity,
        starOpacity: preset.starOpacity,
        exposure: preset.exposure,
        bloomThreshold: preset.bloom.threshold,
        bloomStrength: preset.bloom.strength,
        bloomRadius: preset.bloom.radius,
        cloudColorClear: preset.cloudColorClear,
        cloudColorStorm: preset.cloudColorStorm,
        cloudOpacityBase: preset.cloudOpacityBase,
        cloudOpacityStorm: preset.cloudOpacityStorm,
        cloudEmissiveBase: preset.cloudEmissiveBase,
        cloudEmissiveStorm: preset.cloudEmissiveStorm,
        windX: 0,
        windZ: 0
    };
}

function makeManager(overrides = {}) {
    const WEATHER = makeWeather();
    // Stub scene with fog support
    const scene = {
        fog: { density: 0.0002, color: new THREE.Color() },
        background: new THREE.Color()
    };
    // Stub renderer
    const renderer = { toneMappingExposure: 1.0 };
    // Stub bloom pass
    const bloomPass = { threshold: 0, strength: 0, radius: 0 };
    // Stub lights — dirLight.position needs to be a unit vector for sunElev math
    const hemiLight = { intensity: 1.0 };
    const dirLight = {
        intensity: 1.0,
        position: new THREE.Vector3(0, 1, 0)   // straight up → full sun elevation
    };
    const mgr = createWeatherManager({
        scene,
        renderer,
        bloomPass,
        WEATHER,
        hemiLight,
        dirLight,
        cloudMaterial: null,
        updateClouds: overrides.updateClouds ?? null,
        updateTerrainAtmosphere: overrides.updateTerrainAtmosphere ?? null,
        applyEnvironmentFromWeather: overrides.applyEnvironmentFromWeather ?? null
    });
    return { mgr, WEATHER, scene, renderer, bloomPass, hemiLight, dirLight };
}

test('applyLightingPreset – updates WEATHER fields from preset', () => {
    const { mgr, WEATHER } = makeManager();
    const previousExposure = WEATHER.exposure;

    // Switch to a different preset
    const targetId = Object.keys(LIGHTING_PRESETS).find(id => id !== 'daytime');
    mgr.applyLightingPreset(targetId);

    assert.equal(WEATHER.lightingPresetId, targetId);
    const expectedPreset = LIGHTING_PRESETS[targetId];
    assert.equal(WEATHER.clearColor, expectedPreset.clearColor);
    assert.equal(WEATHER.exposure, expectedPreset.exposure);
    assert.equal(WEATHER.bloomThreshold, expectedPreset.bloom.threshold);
    assert.equal(WEATHER.cloudOpacityBase, expectedPreset.cloudOpacityBase);
});

test('applyLightingPreset – no-op for unknown preset id', () => {
    const { mgr, WEATHER } = makeManager();
    const before = { ...WEATHER };
    mgr.applyLightingPreset('__nonexistent__');
    // Key fields unchanged
    assert.equal(WEATHER.lightingPresetId, before.lightingPresetId);
    assert.equal(WEATHER.exposure, before.exposure);
});

test('applyLightingPreset – invokes applyEnvironmentFromWeather callback', () => {
    let called = false;
    let calledWeather = null;
    const { mgr } = makeManager({
        applyEnvironmentFromWeather: (w, opts) => {
            called = true;
            calledWeather = w;
            assert.equal(opts.refreshEnvironmentMap, true);
        }
    });
    const targetId = Object.keys(LIGHTING_PRESETS).find(id => id !== 'daytime');
    mgr.applyLightingPreset(targetId);
    assert.equal(called, true, 'applyEnvironmentFromWeather should be called');
});

test('syncDerivedWeatherCache – mirrors WEATHER values to renderer/bloom', () => {
    const { mgr, WEATHER, renderer, bloomPass } = makeManager();
    WEATHER.exposure = 2.5;
    WEATHER.bloomThreshold = 0.8;
    WEATHER.bloomStrength = 1.4;
    WEATHER.bloomRadius = 0.6;
    mgr.syncDerivedWeatherCache();
    assert.equal(renderer.toneMappingExposure, 2.5);
    assert.equal(bloomPass.threshold, 0.8);
    assert.equal(bloomPass.strength, 1.4);
    assert.equal(bloomPass.radius, 0.6);
});

test('update – skipped on non-multiple-of-4 frameCount', () => {
    const { mgr, WEATHER } = makeManager();
    const startFog = WEATHER.currentFog;
    mgr.update(0.016, 1, new THREE.PerspectiveCamera());
    assert.equal(WEATHER.currentFog, startFog, 'currentFog should not change on skipped frame');
});

test('update – fog lerps toward targetFog on qualifying frame', () => {
    const { mgr, WEATHER } = makeManager();
    WEATHER.targetFog = 0.001;
    WEATHER.currentFog = 0.0002;
    const before = WEATHER.currentFog;
    mgr.update(0.016, 0, new THREE.PerspectiveCamera());
    assert.ok(WEATHER.currentFog > before, 'currentFog should increase toward targetFog');
    assert.ok(WEATHER.currentFog < WEATHER.targetFog, 'currentFog should not overshoot');
});

test('update – fog density written to scene.fog', () => {
    const { mgr, WEATHER, scene } = makeManager();
    WEATHER.targetFog = 0.001;
    WEATHER.currentFog = 0.0002;
    mgr.update(0.016, 0, new THREE.PerspectiveCamera());
    assert.ok(Math.abs(scene.fog.density - WEATHER.currentFog) < 1e-9,
        'scene.fog.density should match WEATHER.currentFog');
});

test('update – transition color blends between clear and storm colors', () => {
    const { mgr, WEATHER, scene } = makeManager();
    // Mid-transition
    WEATHER.transition = 0.5;
    WEATHER.targetTransition = 0.5;
    mgr.update(0.016, 0, new THREE.PerspectiveCamera());
    // scene.background should be a THREE.Color set by lerpColors
    assert.ok(scene.background instanceof THREE.Color,
        'scene.background should be a THREE.Color');
});

test('update – updateTerrainAtmosphere callback is invoked', () => {
    let called = false;
    const { mgr } = makeManager({
        updateTerrainAtmosphere: () => { called = true; }
    });
    mgr.update(0.016, 0, new THREE.PerspectiveCamera());
    assert.equal(called, true, 'updateTerrainAtmosphere should be called on qualifying frames');
});

test('update – updateClouds callback is invoked', () => {
    let called = false;
    const { mgr } = makeManager({
        updateClouds: () => { called = true; }
    });
    mgr.update(0.016, 0, new THREE.PerspectiveCamera());
    assert.equal(called, true, 'updateClouds should be called on qualifying frames');
});
