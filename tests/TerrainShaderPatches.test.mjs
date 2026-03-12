import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applyDetailedBuildingShaderPatch,
    applyDistanceAtmosphereShaderPatch,
    applyTerrainDetailShaderPatch,
    applyTreeDepthShaderPatch
} from '../js/modules/world/terrain/TerrainShaderPatches.js';

function makeShader(overrides = {}) {
    return {
        uniforms: {},
        defines: {},
        vertexShader: `#include <common>
#include <beginnormal_vertex>
#include <begin_vertex>
#include <worldpos_vertex>
#include <project_vertex>`,
        fragmentShader: `#include <common>
vec4 diffuseColor = vec4( diffuse, opacity );
#include <color_fragment>
#include <roughnessmap_fragment>
#include <normal_fragment_maps>`,
        ...overrides
    };
}

test('applyDistanceAtmosphereShaderPatch injects atmosphere uniforms and blend code', () => {
    const shader = makeShader();
    const atmosphereUniforms = {
        uAtmosCameraPos: { value: 'camera' },
        uAtmosColor: { value: 'color' },
        uAtmosNear: { value: 1 },
        uAtmosFar: { value: 2 }
    };

    applyDistanceAtmosphereShaderPatch(shader, { atmosphereUniforms, strength: 0.74, desat: 0.08 });

    assert.equal(shader.uniforms.uAtmosCameraPos, atmosphereUniforms.uAtmosCameraPos);
    assert.match(shader.vertexShader, /varying vec3 vAtmosWorldPos;/);
    assert.match(shader.fragmentShader, /float atmosMix = smoothstep\(uAtmosNear, uAtmosFar, atmosDist\) \* 0\.7400;/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb = mix\(diffuseColor\.rgb, uAtmosColor, atmosMix\);/);
});

test('applyDetailedBuildingShaderPatch injects building varyings and style fragments', () => {
    const shader = makeShader();
    const cameraPosUniform = { value: { x: 0, y: 0, z: 0 } };

    applyDetailedBuildingShaderPatch(shader, { style: 'commercial', cameraPosUniform });

    assert.equal(shader.uniforms.uBldgCameraPos, cameraPosUniform);
    assert.match(shader.vertexShader, /varying vec3 vBldgObjPos;/);
    assert.match(shader.vertexShader, /uniform vec3 uBldgCameraPos;/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb \*= 0\.15;/);
    assert.match(shader.fragmentShader, /roughnessFactor = 0\.1;/);
});

test('applyTreeDepthShaderPatch configures DEPTH_PACKING and shadow culling logic', () => {
    const shader = makeShader();
    const mainCameraPosUniform = { value: { x: 0, y: 0, z: 0 } };

    applyTreeDepthShaderPatch(shader, { mainCameraPosUniform });

    assert.equal(shader.defines.DEPTH_PACKING, 3201);
    assert.equal(shader.uniforms.uMainCameraPos, mainCameraPosUniform);
    assert.match(shader.vertexShader, /float shadowScale = 1\.0 - smoothstep\(600\.0, 800\.0, distToCamera\);/);
});

test('applyTerrainDetailShaderPatch injects terrain uniforms and far-lod define', () => {
    const shader = makeShader();
    const terrainDetailUniforms = {
        uTerrainDetailTex: { value: 'detail' },
        uRoadMarkingTex: { value: 'road' },
        uRoadMarkingCenter: { value: 'center' },
        uRoadMarkingWorldSize: { value: 1 },
        uRoadMarkingOpacity: { value: 1 },
        uRoadMarkingFadeStart: { value: 1 },
        uRoadMarkingFadeEnd: { value: 1 },
        uRoadMarkingBodyStart: { value: 1 },
        uRoadMarkingBodyEnd: { value: 1 },
        uRoadMarkingCoreStart: { value: 1 },
        uRoadMarkingCoreEnd: { value: 1 },
        uTerrainDetailScale: { value: 1 },
        uTerrainDetailStrength: { value: 1 },
        uTerrainSlopeStart: { value: 1 },
        uTerrainSlopeEnd: { value: 1 },
        uTerrainRockHeightStart: { value: 1 },
        uTerrainRockHeightEnd: { value: 1 },
        uTerrainAtmosStrength: { value: 1 },
        uTerrainFoliageNearStart: { value: 1 },
        uTerrainFoliageNearEnd: { value: 1 },
        uTerrainFoliageStrength: { value: 1 },
        uTerrainSandColor: { value: 'sand' },
        uTerrainGrassColor: { value: 'grass' },
        uTerrainRockColor: { value: 'rock' },
        uTerrainSnowColor: { value: 'snow' },
        uTerrainAsphaltColor: { value: 'asphalt' }
    };
    const atmosphereUniforms = {
        uAtmosCameraPos: { value: 'camera' },
        uAtmosColor: { value: 'color' },
        uAtmosNear: { value: 1 },
        uAtmosFar: { value: 2 }
    };
    const timeUniform = { value: 42 };

    applyTerrainDetailShaderPatch(shader, {
        terrainDetailUniforms,
        atmosphereUniforms,
        timeUniform,
        isFarLOD: true
    });

    assert.equal(shader.uniforms.uTime, timeUniform);
    assert.equal(shader.uniforms.uRoadMarkingTex, terrainDetailUniforms.uRoadMarkingTex);
    assert.match(shader.vertexShader, /attribute vec4 surfaceWeights;/);
    assert.match(shader.fragmentShader, /vec3 roadMarkingSrgbToLinear\(vec3 value\)/);
    assert.match(shader.fragmentShader, /float cityAlpha = 0\.0;/);
    assert.match(shader.fragmentShader, /#define IS_FAR_LOD/);
});
