import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applyTreeBillboardShaderPatch,
    applyDetailedBuildingShaderPatch,
    applyDistanceAtmosphereShaderPatch,
    applyTerrainDetailShaderPatch,
    applyTreeDepthShaderPatch,
    createBuildingPopInUniformBindings,
    createDistanceAtmosphereUniformBindings,
    createTreeDepthUniformBindings,
    createWaterDualScrollUniformBindings
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

test('distance atmosphere and water dual-scroll helpers return live uniform references', () => {
    const atmosphereUniforms = {
        uAtmosCameraPos: { value: 'camera' },
        uAtmosColor: { value: 'color' },
        uAtmosNear: { value: 1 },
        uAtmosFar: { value: 2 }
    };
    const timeUniform = { value: 42 };

    const atmosphereBindings = createDistanceAtmosphereUniformBindings(atmosphereUniforms);
    const waterBindings = createWaterDualScrollUniformBindings(timeUniform);

    assert.equal(atmosphereBindings.uAtmosCameraPos, atmosphereUniforms.uAtmosCameraPos);
    assert.equal(atmosphereBindings.uAtmosFar, atmosphereUniforms.uAtmosFar);
    assert.equal(waterBindings.uTime, timeUniform);
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
    assert.match(shader.fragmentShader, /vec3 resolveRoadMarkingColor\(vec4 sampleColor\)/);
    assert.match(shader.fragmentShader, /return clamp\(linearColor \/ sampleColor\.a, 0\.0, 1\.0\);/);
    assert.match(shader.fragmentShader, /baseTerrainColor \*= naturalTerrainVertexTint;/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb = mix\(baseTerrainColor, asphaltBaseColor, asphaltSurface\);/);
    assert.match(shader.fragmentShader, /float asphaltMacro = mix\(detailA\.g, detailB\.g, 0\.55\);/);
    assert.match(shader.fragmentShader, /float asphaltMicro = mix\(detailA\.a, detailB\.a, 0\.5\);/);
    assert.match(shader.fragmentShader, /float asphaltTone = clamp\(\(asphaltMacro - 0\.5\) \* 1\.6 \+ \(asphaltMicro - 0\.5\) \* 0\.7 \+ 0\.5, 0\.0, 1\.0\);/);
    assert.match(shader.fragmentShader, /float asphaltPatchMask = smoothstep\(0\.58, 0\.82, detailB\.r \+ asphaltMacro \* 0\.25\);/);
    assert.match(shader.fragmentShader, /float asphaltCrackMask = smoothstep\(0\.62, 0\.9, 1\.0 - detailA\.a\) \* smoothstep\(0\.34, 0\.76, asphaltMacro\);/);
    assert.match(shader.fragmentShader, /vec3 asphaltDarkColor = asphaltBaseColor \* vec3\(0\.58, 0\.6, 0\.64\);/);
    assert.match(shader.fragmentShader, /vec3 asphaltLightColor = asphaltBaseColor \* vec3\(1\.28, 1\.24, 1\.16\);/);
    assert.match(shader.fragmentShader, /vec3 roadSurfaceColor = mix\(diffuseColor\.rgb, asphaltDetailColor, asphaltSurface\);/);
    assert.match(shader.fragmentShader, /markingComposite = mix\(roadSurfaceColor, roadMarkingColor, markingCoverage\);/);
    assert.doesNotMatch(shader.fragmentShader, /#include <color_fragment>/);
    assert.match(shader.fragmentShader, /float cityAlpha = 0\.0;/);
    assert.match(shader.fragmentShader, /#define IS_FAR_LOD/);
});
