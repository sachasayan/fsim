import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applyTreeBillboardShaderPatch,
    applyDetailedBuildingShaderPatch,
    applyDistanceAtmosphereShaderPatch,
    applyTerrainDetailShaderPatch,
    applyTreeDepthShaderPatch,
    applyWaterStaticPatternShaderPatch,
    createBuildingPopInUniformBindings,
    createDistanceAtmosphereUniformBindings,
    createTreeDepthUniformBindings
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

test('distance atmosphere helper returns live uniform references', () => {
    const atmosphereUniforms = {
        uAtmosCameraPos: { value: 'camera' },
        uAtmosColor: { value: 'color' },
        uAtmosNear: { value: 1 },
        uAtmosFar: { value: 2 }
    };

    const atmosphereBindings = createDistanceAtmosphereUniformBindings(atmosphereUniforms);

    assert.equal(atmosphereBindings.uAtmosCameraPos, atmosphereUniforms.uAtmosCameraPos);
    assert.equal(atmosphereBindings.uAtmosFar, atmosphereUniforms.uAtmosFar);
});

test('building pop-in and tree depth helpers expose expected uniform bindings', () => {
    const cameraPosUniform = { value: 'camera' };
    const depthCameraUniform = { value: 'depth-camera' };

    const popInBindings = createBuildingPopInUniformBindings(cameraPosUniform, 100, 200);
    const depthBindings = createTreeDepthUniformBindings(depthCameraUniform, 300, 500);

    assert.equal(popInBindings.uBldgCameraPos, cameraPosUniform);
    assert.equal(popInBindings.uBldgFadeNear.value, 100);
    assert.equal(popInBindings.uBldgFadeFar.value, 200);
    assert.equal(depthBindings.uMainCameraPos, depthCameraUniform);
    assert.equal(depthBindings.uTreeShadowFadeNear.value, 300);
    assert.equal(depthBindings.uTreeShadowFadeFar.value, 500);
});

test('applyTreeBillboardShaderPatch injects leafy shading and supports static crossed cards', () => {
    const cameraFacingShader = makeShader();
    const fullFacingShader = makeShader();
    const crossedShader = makeShader();

    applyTreeBillboardShaderPatch(cameraFacingShader);
    applyTreeBillboardShaderPatch(fullFacingShader, { cameraFacing: true, lockYAxis: false });
    applyTreeBillboardShaderPatch(crossedShader, { cameraFacing: false });

    assert.match(cameraFacingShader.vertexShader, /vec3 cameraDir = cameraPosition -/);
    assert.match(cameraFacingShader.vertexShader, /cameraDir\.y = 0\.0;/);
    assert.match(cameraFacingShader.fragmentShader, /float treeVerticalShade = mix\(0\.82, 1\.08, smoothstep\(0\.06, 0\.88, vTreeUv\.y\)\);/);
    assert.doesNotMatch(fullFacingShader.vertexShader, /cameraDir\.y = 0\.0;/);
    assert.doesNotMatch(crossedShader.vertexShader, /vec3 cameraDir = cameraPosition -/);
    assert.match(crossedShader.fragmentShader, /roughnessFactor = mix\(roughnessFactor \* 0\.82, min\(1\.0, roughnessFactor \* 1\.08\), treeCanopyRoughness\);/);
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

    applyTreeDepthShaderPatch(shader, { mainCameraPosUniform, shadowFadeNear: 1400, shadowFadeFar: 2100 });

    assert.equal(shader.defines.DEPTH_PACKING, 3201);
    assert.equal(shader.uniforms.uMainCameraPos, mainCameraPosUniform);
    assert.equal(shader.uniforms.uTreeShadowFadeNear.value, 1400);
    assert.equal(shader.uniforms.uTreeShadowFadeFar.value, 2100);
    assert.match(shader.vertexShader, /float shadowScale = 1\.0 - smoothstep\(uTreeShadowFadeNear, uTreeShadowFadeFar, distToCamera\);/);
});

test('applyTerrainDetailShaderPatch injects terrain uniforms and far-lod define', () => {
    const shader = makeShader();
    const terrainDetailUniforms = {
        uTerrainDetailTex: { value: 'detail' },
        uTerrainGrassTex: { value: 'grass-tex' },
        uTerrainDetailScale: { value: 1 },
        uTerrainDetailStrength: { value: 1 },
        uTerrainSlopeStart: { value: 1 },
        uTerrainSlopeEnd: { value: 1 },
        uTerrainRockHeightStart: { value: 1 },
        uTerrainRockHeightEnd: { value: 1 },
        uTerrainAtmosStrength: { value: 1 },
        uTerrainGrassTexScale: { value: 1 },
        uTerrainGrassTexStrength: { value: 1 },
        uTerrainGrassTexNearStart: { value: 1 },
        uTerrainGrassTexNearEnd: { value: 1 },
        uTerrainGrassShowTexture: { value: 1 },
        uTerrainGrassDebugMask: { value: 0 },
        uTerrainSandColor: { value: 'sand' },
        uTerrainGrassColor: { value: 'grass' },
        uTerrainRockColor: { value: 'rock' },
        uTerrainSnowColor: { value: 'snow' }
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
        isFarLOD: true,
        shadowContrast: 0.3
    });

    assert.equal(shader.uniforms.uTime, timeUniform);
    assert.match(shader.vertexShader, /attribute vec4 surfaceWeights;/);
    assert.match(shader.fragmentShader, /baseTerrainColor \*= naturalTerrainVertexTint;/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb = baseTerrainColor;/);
    assert.match(shader.fragmentShader, /float farDetailScale = 1\.0;/);
    assert.match(shader.fragmentShader, /farDetailScale = 0\.0;/);
    assert.match(shader.fragmentShader, /uniform sampler2D uTerrainGrassTex;/);
    assert.match(shader.fragmentShader, /uTerrainGrassTexScale/);
    assert.match(shader.fragmentShader, /uTerrainGrassTexStrength/);
    assert.match(shader.fragmentShader, /uTerrainGrassShowTexture/);
    assert.match(shader.fragmentShader, /uTerrainGrassDebugMask/);
    assert.match(shader.fragmentShader, /float grassTextureFade = \(1\.0 - smoothstep\(uTerrainGrassTexNearStart, uTerrainGrassTexNearEnd, vTerrainDist\)\)/);
    assert.match(shader.fragmentShader, /vec2 grassUvA = vTerrainWorldPos\.xz \* uTerrainGrassTexScale;/);
    assert.match(shader.fragmentShader, /mat2 grassRotation = mat2\(0\.819152, -0\.573576, 0\.573576, 0\.819152\);/);
    assert.match(shader.fragmentShader, /vec2 grassUvB = grassRotation \* \(grassUvA \* 0\.83\);/);
    assert.match(shader.fragmentShader, /vec3 grassTexColor = mix\(grassTexA, grassTexB, 0\.45\);/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb = mix\(diffuseColor\.rgb, grassTexColor, clamp\(grassTextureFade, 0\.0, 1\.0\)\);/);
    assert.match(shader.fragmentShader, /if \(uTerrainGrassDebugMask > 0\.5\)/);
    assert.doesNotMatch(shader.fragmentShader, /#include <color_fragment>/);
    assert.match(shader.fragmentShader, /float cityAlpha = 0\.0;/);
    assert.match(shader.fragmentShader, /#define IS_FAR_LOD/);
});

test('applyWaterStaticPatternShaderPatch injects a static procedural water normal', () => {
    const shader = makeShader({
        fragmentShader: `#include <common>
varying vec3 vWaterWorldPos;
vec4 diffuseColor = vec4( diffuse, opacity );
#include <normal_fragment_maps>`
    });

    applyWaterStaticPatternShaderPatch(shader, { normalStrength: 1.5, patternEnabled: true });

    assert.match(shader.fragmentShader, /float waterValueNoise\(vec2 p\)/);
    assert.match(shader.fragmentShader, /float waterPatternStrength = 1\.5000;/);
    assert.match(shader.fragmentShader, /float hL = waterProceduralHeight\(vWaterWorldPos\.xz - vec2\(waterNormalStep, 0\.0\)\);/);
});
