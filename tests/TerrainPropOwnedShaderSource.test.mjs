import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getBuildingPopInOwnedShaderSource,
    getBuildingPopInUniformBindings,
    getDetailedBuildingOwnedShaderSource,
    getTreeBillboardOwnedShaderSource,
    getTreeDepthOwnedShaderSource,
    getTreeDepthUniformBindings
} from '../js/modules/world/terrain/TerrainPropOwnedShaderSource.js';

test('terrain prop owned shader sources are cached and expose expected variants', () => {
    const treeBillboardA = getTreeBillboardOwnedShaderSource();
    const treeBillboardB = getTreeBillboardOwnedShaderSource();
    const treeDepthA = getTreeDepthOwnedShaderSource();
    const treeDepthB = getTreeDepthOwnedShaderSource();
    const buildingPopIn = getBuildingPopInOwnedShaderSource({ fadeNear: 100, fadeFar: 200 });
    const detailedBuilding = getDetailedBuildingOwnedShaderSource({
        style: 'commercial',
        cameraPopIn: true,
        fadeNear: 100,
        fadeFar: 200
    });

    assert.equal(treeBillboardA, treeBillboardB);
    assert.equal(treeDepthA, treeDepthB);
    assert.match(treeBillboardA.vertexShader, /vec3 cameraDir = cameraPosition -/);
    assert.match(treeDepthA.vertexShader, /float shadowScale = 1\.0 - smoothstep\(600\.0, 800\.0, distToCamera\);/);
    assert.equal(treeDepthA.defines.DEPTH_PACKING, 3201);
    assert.match(buildingPopIn.vertexShader, /float bldgPopInScale = 1\.0 - smoothstep\(uBldgFadeNear, uBldgFadeFar, bldgDist\);/);
    assert.match(detailedBuilding.fragmentShader, /diffuseColor\.rgb \*= 0\.15;/);
    assert.match(detailedBuilding.vertexShader, /uniform vec3 uBldgCameraPos;/);
});

test('terrain prop uniform helpers return live references', () => {
    const cameraPosUniform = { value: 'camera' };
    const depthCameraUniform = { value: 'depth-camera' };

    const popInBindings = getBuildingPopInUniformBindings(cameraPosUniform, 100, 200);
    const treeDepthBindings = getTreeDepthUniformBindings(depthCameraUniform);

    assert.equal(popInBindings.uBldgCameraPos, cameraPosUniform);
    assert.equal(popInBindings.uBldgFadeNear.value, 100);
    assert.equal(popInBindings.uBldgFadeFar.value, 200);
    assert.equal(treeDepthBindings.uMainCameraPos, depthCameraUniform);
});
