import test from 'node:test';
import assert from 'node:assert/strict';

import { setupTerrainMaterial } from '../js/modules/world/terrain/TerrainMaterials.js';

test('setupTerrainMaterial sets onBeforeCompile and customProgramCacheKey', () => {
    const material = {};
    const terrainDetailUniforms = {
        uTerrainDetailTex: { value: 'tex' },
        uTerrainDetailScale: { value: 1.0 },
        uTerrainDetailStrength: { value: 0.5 },
        uTerrainSlopeStart: { value: 0.2 },
        uTerrainSlopeEnd: { value: 0.8 },
        uTerrainRockHeightStart: { value: 10.0 },
        uTerrainRockHeightEnd: { value: 50.0 },
        uTerrainAtmosStrength: { value: 0.8 },
        uTerrainFoliageNearStart: { value: 5.0 },
        uTerrainFoliageNearEnd: { value: 20.0 },
        uTerrainFoliageStrength: { value: 1.0 }
    };
    const atmosphereUniforms = {
        uAtmosCameraPos: { value: [0, 0, 0] },
        uAtmosColor: { value: [0.5, 0.6, 0.7] },
        uAtmosNear: { value: 100 },
        uAtmosFar: { value: 1000 }
    };

    setupTerrainMaterial(material, terrainDetailUniforms, atmosphereUniforms, false);

    assert.ok(typeof material.onBeforeCompile === 'function');
    assert.ok(typeof material.customProgramCacheKey === 'function');
    assert.equal(material.customProgramCacheKey(), 'terrain-detail-v4-near');

    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <worldpos_vertex>',
        fragmentShader: '#include <common>\nvec4 diffuseColor = vec4( diffuse, opacity );'
    };

    material.onBeforeCompile(shader);

    assert.equal(shader.uniforms.uTerrainDetailTex, terrainDetailUniforms.uTerrainDetailTex);
    assert.equal(shader.uniforms.uTerrainDetailScale, terrainDetailUniforms.uTerrainDetailScale);
    assert.equal(shader.uniforms.uTerrainDetailStrength, terrainDetailUniforms.uTerrainDetailStrength);
    assert.equal(shader.uniforms.uTerrainSlopeStart, terrainDetailUniforms.uTerrainSlopeStart);
    assert.equal(shader.uniforms.uTerrainSlopeEnd, terrainDetailUniforms.uTerrainSlopeEnd);
    assert.equal(shader.uniforms.uTerrainRockHeightStart, terrainDetailUniforms.uTerrainRockHeightStart);
    assert.equal(shader.uniforms.uTerrainRockHeightEnd, terrainDetailUniforms.uTerrainRockHeightEnd);
    assert.equal(shader.uniforms.uTerrainAtmosStrength, terrainDetailUniforms.uTerrainAtmosStrength);
    assert.equal(shader.uniforms.uTerrainFoliageNearStart, terrainDetailUniforms.uTerrainFoliageNearStart);
    assert.equal(shader.uniforms.uTerrainFoliageNearEnd, terrainDetailUniforms.uTerrainFoliageNearEnd);
    assert.equal(shader.uniforms.uTerrainFoliageStrength, terrainDetailUniforms.uTerrainFoliageStrength);

    assert.equal(shader.uniforms.uAtmosCameraPos, atmosphereUniforms.uAtmosCameraPos);
    assert.equal(shader.uniforms.uAtmosColor, atmosphereUniforms.uAtmosColor);
    assert.equal(shader.uniforms.uAtmosNear, atmosphereUniforms.uAtmosNear);
    assert.equal(shader.uniforms.uAtmosFar, atmosphereUniforms.uAtmosFar);

    assert.ok(shader.vertexShader.includes('varying vec3 vTerrainWorldPos;'));
    assert.ok(shader.vertexShader.includes('vTerrainDist = distance(worldPos.xyz, uAtmosCameraPos);'));

    assert.ok(shader.fragmentShader.includes('varying vec3 vTerrainWorldPos;'));
    assert.ok(shader.fragmentShader.includes('vec4 pNoise = texture2D(uTerrainDetailTex, baseUv * 0.12);'));
    assert.ok(!shader.fragmentShader.includes('#define IS_FAR_LOD'));
});

test('setupTerrainMaterial handles isFarLOD = true', () => {
    const material = {};
    const terrainDetailUniforms = {};
    const atmosphereUniforms = {};

    setupTerrainMaterial(material, terrainDetailUniforms, atmosphereUniforms, true);

    assert.equal(material.customProgramCacheKey(), 'terrain-detail-v4-far');

    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <worldpos_vertex>',
        fragmentShader: '#include <common>\nvec4 diffuseColor = vec4( diffuse, opacity );'
    };

    material.onBeforeCompile(shader);

    assert.ok(shader.fragmentShader.includes('#define IS_FAR_LOD'));
});
