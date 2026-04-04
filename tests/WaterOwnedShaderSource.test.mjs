import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
    getWaterShaderDescriptor,
    getWaterOwnedShaderSource,
    getWaterOwnedUniformBindings
} from '../js/modules/world/terrain/WaterOwnedShaderSource.js';
import { describeOwnedShaderDescriptor } from '../js/modules/world/shaders/ShaderDescriptor.js';
import {
    applyWaterSurfaceColorShaderPatch,
    applyWaterStaticPatternShaderPatch
} from '../js/modules/world/terrain/TerrainShaderPatches.js';

function normalizeShaderSource(source) {
    return source
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\s+/g, '')
        .trim();
}

test('water owned shader sources are cached and expose expected near/far behavior', () => {
    const nearSourceA = getWaterOwnedShaderSource({ isFarLOD: false, strength: 0.74, desat: 0.08, shadowContrast: 0.35, normalStrength: 1.5, patternEnabled: true });
    const nearSourceB = getWaterOwnedShaderSource({ isFarLOD: false, strength: 0.74, desat: 0.08, shadowContrast: 0.35, normalStrength: 1.5, patternEnabled: true });
    const farSource = getWaterOwnedShaderSource({ isFarLOD: true, strength: 0.74, desat: 0.08, shadowContrast: 0.35 });

    assert.equal(nearSourceA, nearSourceB);
    assert.match(nearSourceA.vertexShader, /varying vec3 vWaterWorldPos;/);
    assert.match(nearSourceA.fragmentShader, /float waterProceduralHeight\(vec2 worldXZ\)/);
    assert.match(nearSourceA.fragmentShader, /float waterPatternStrength = 1\.5000;/);
    assert.match(nearSourceA.fragmentShader, /uniform sampler2D uWaterDepthTex;/);
    assert.match(nearSourceA.fragmentShader, /vec2 waterDepthUv = mix\(uWaterDepthUvMin, uWaterDepthUvMax, waterUv\);/);
    assert.match(nearSourceA.fragmentShader, /float waterDepth = texture2D\(uWaterDepthTex, waterDepthUv\)\.r \* uWaterDepthScale;/);
    assert.match(nearSourceA.fragmentShader, /float atmosMix = smoothstep\(uAtmosNear, uAtmosFar, atmosDist\) \* 0\.7400;/);
    assert.match(nearSourceA.fragmentShader, /float waterShadowFade = resolveSurfaceShadowFade\(vWaterWorldPos\.xz\);/);
    assert.match(nearSourceA.fragmentShader, /float waterShadowVisibility = mix\(1\.0, getShadowMask\(\), 0\.3500 \* waterShadowFade\);/);
    assert.doesNotMatch(nearSourceA.fragmentShader, /vNormalMapUv/);
    assert.doesNotMatch(nearSourceA.fragmentShader, /uniform float uTime;/);
    assert.match(farSource.fragmentShader, /float atmosMix = smoothstep\(uAtmosNear, uAtmosFar, atmosDist\) \* 0\.7400;/);
    assert.doesNotMatch(farSource.fragmentShader, /getShadowMask/);
    assert.doesNotMatch(farSource.fragmentShader, /waterProceduralHeight/);
});

test('water owned uniform bindings expose live references for near and far water', () => {
    const atmosphereUniforms = {
        uAtmosCameraPos: { value: 'camera' },
        uAtmosColor: { value: 'color' },
        uAtmosNear: { value: 1 },
        uAtmosFar: { value: 2 },
        uSurfaceShadowDistance: { value: 20000 },
        uSurfaceShadowFadeStart: { value: 12000 },
        uShadowCoverageCenter: { value: 'shadow-center' },
        uShadowCoverageExtent: { value: 2200 },
        uShadowCoverageFadeStart: { value: 1760 }
    };
    const waterSurfaceUniforms = {
        uWaterDepthTex: { value: 'depth' },
        uWaterDepthUvMin: { value: 'depth-uv-min' },
        uWaterDepthUvMax: { value: 'depth-uv-max' },
        uWaterBoundsMin: { value: 'min' },
        uWaterBoundsSize: { value: 'size' },
        uWaterDepthScale: { value: 1 },
        uWaterFoamDepth: { value: 2 },
        uWaterShallowStart: { value: 3 },
        uWaterShallowEnd: { value: 4 },
        uWaterDeepEnd: { value: 5 },
        uWaterFoamColor: { value: 'foam' },
        uWaterShallowColor: { value: 'shallow' },
        uWaterDeepColor: { value: 'deep' }
    };

    const nearBindings = getWaterOwnedUniformBindings({
        atmosphereUniforms,
        waterSurfaceUniforms,
        isFarLOD: false
    });
    const farBindings = getWaterOwnedUniformBindings({
        atmosphereUniforms,
        waterSurfaceUniforms,
        isFarLOD: true
    });

    assert.equal(nearBindings.uAtmosColor, atmosphereUniforms.uAtmosColor);
    assert.equal(nearBindings.uSurfaceShadowFadeStart, atmosphereUniforms.uSurfaceShadowFadeStart);
    assert.equal(nearBindings.uShadowCoverageCenter, atmosphereUniforms.uShadowCoverageCenter);
    assert.equal(nearBindings.uWaterDepthTex, waterSurfaceUniforms.uWaterDepthTex);
    assert.equal(nearBindings.uWaterDepthUvMin, waterSurfaceUniforms.uWaterDepthUvMin);
    assert.equal(nearBindings.uWaterDepthUvMax, waterSurfaceUniforms.uWaterDepthUvMax);
    assert.equal(farBindings.uAtmosNear, atmosphereUniforms.uAtmosNear);
    assert.equal(farBindings.uWaterDeepColor, waterSurfaceUniforms.uWaterDeepColor);
    assert.equal(Object.prototype.hasOwnProperty.call(nearBindings, 'uTime'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(farBindings, 'uTime'), false);
});

test('getWaterShaderDescriptor returns cached descriptors with variant metadata', () => {
    const nearDescriptorA = getWaterShaderDescriptor({ isFarLOD: false, strength: 0.74, desat: 0.08, shadowContrast: 0.35, normalStrength: 1.5, patternEnabled: true });
    const nearDescriptorB = getWaterShaderDescriptor({ isFarLOD: false, strength: 0.74, desat: 0.08, shadowContrast: 0.35, normalStrength: 1.5, patternEnabled: true });
    const farDescriptor = getWaterShaderDescriptor({ isFarLOD: true, strength: 0.74, desat: 0.08, shadowContrast: 0.35 });

    assert.equal(nearDescriptorA, nearDescriptorB);
    assert.deepEqual(describeOwnedShaderDescriptor(nearDescriptorA), {
        id: 'water-owned-near-0.7400-0.0800-0.3500-1.5000-pattern',
        baseCacheKey: 'water-owned-standard-v1-near',
        patchId: 'water-owned-source',
        patchCacheKey: 'water-owned-source-near-0.7400-0.0800-0.3500-1.5000-pattern',
        metadata: {
            system: 'terrain',
            shaderFamily: 'standard',
            shaderVariant: 'near',
            isFarLOD: false,
            atmosphereStrength: 0.74,
            atmosphereDesat: 0.08,
            shadowContrast: 0.35,
            normalStrength: 1.5,
            staticPattern: true
        }
    });
    assert.deepEqual(describeOwnedShaderDescriptor(farDescriptor), {
        id: 'water-owned-far-0.7400-0.0800-0.3500-1.5000-pattern',
        baseCacheKey: 'water-owned-basic-v1-far',
        patchId: 'water-owned-source',
        patchCacheKey: 'water-owned-source-far-0.7400-0.0800-0.3500-1.5000-pattern',
        metadata: {
            system: 'terrain',
            shaderFamily: 'basic',
            shaderVariant: 'far',
            isFarLOD: true,
            atmosphereStrength: 0.74,
            atmosphereDesat: 0.08,
            shadowContrast: 0.35,
            normalStrength: 1.5,
            staticPattern: false
        }
    });
});

test('water owned shader templates match the legacy water patch output', () => {
    const atmosphereUniforms = Object.fromEntries([
        'uAtmosCameraPos',
        'uAtmosColor',
        'uAtmosNear',
        'uAtmosFar',
        'uSurfaceShadowDistance',
        'uSurfaceShadowFadeStart',
        'uShadowCoverageCenter',
        'uShadowCoverageExtent',
        'uShadowCoverageFadeStart'
    ].map((key) => [key, { value: null }]));

    function buildLegacyWaterSource(isFarLOD) {
        const waterSurfaceUniforms = Object.fromEntries([
            'uWaterDepthTex',
            'uWaterDepthUvMin',
            'uWaterDepthUvMax',
            'uWaterBoundsMin',
            'uWaterBoundsSize',
            'uWaterDepthScale',
            'uWaterFoamDepth',
            'uWaterShallowStart',
            'uWaterShallowEnd',
            'uWaterDeepEnd',
            'uWaterFoamColor',
            'uWaterShallowColor',
            'uWaterDeepColor'
        ].map((key) => [key, { value: null }]));
        const shader = {
            uniforms: {},
            defines: {},
            vertexShader: isFarLOD ? THREE.ShaderLib.basic.vertexShader : THREE.ShaderLib.standard.vertexShader,
            fragmentShader: isFarLOD ? THREE.ShaderLib.basic.fragmentShader : THREE.ShaderLib.standard.fragmentShader
        };
        applyWaterSurfaceColorShaderPatch(shader, {
            atmosphereUniforms,
            waterSurfaceUniforms,
            strength: 0.74,
            desat: 0.08,
            shadowContrast: 0.35
        });
        if (!isFarLOD) {
            applyWaterStaticPatternShaderPatch(shader, {
                normalStrength: 1.5,
                patternEnabled: true
            });
        }
        return shader;
    }

    const legacyNear = buildLegacyWaterSource(false);
    const legacyFar = buildLegacyWaterSource(true);
    const ownedNear = getWaterOwnedShaderSource({ isFarLOD: false, strength: 0.74, desat: 0.08, shadowContrast: 0.35, normalStrength: 1.5, patternEnabled: true });
    const ownedFar = getWaterOwnedShaderSource({ isFarLOD: true, strength: 0.74, desat: 0.08, shadowContrast: 0.35 });

    assert.equal(normalizeShaderSource(ownedNear.vertexShader), normalizeShaderSource(legacyNear.vertexShader));
    assert.equal(normalizeShaderSource(ownedNear.fragmentShader), normalizeShaderSource(legacyNear.fragmentShader));
    assert.equal(normalizeShaderSource(ownedFar.vertexShader), normalizeShaderSource(legacyFar.vertexShader));
    assert.equal(normalizeShaderSource(ownedFar.fragmentShader), normalizeShaderSource(legacyFar.fragmentShader));
});
