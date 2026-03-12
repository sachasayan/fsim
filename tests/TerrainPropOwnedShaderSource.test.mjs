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
    const treeCrossed = getTreeBillboardOwnedShaderSource({ cameraFacing: false });
    const treeStaticDepth = getTreeDepthOwnedShaderSource({ cameraFacing: false });
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
    assert.match(treeBillboardA.fragmentShader, /float treeVerticalShade = mix\(0\.82, 1\.08, smoothstep\(0\.06, 0\.88, vTreeUv\.y\)\);/);
    assert.doesNotMatch(treeCrossed.vertexShader, /vec3 cameraDir = cameraPosition -/);
    assert.match(treeDepthA.vertexShader, /float shadowScale = 1\.0 - smoothstep\(uTreeShadowFadeNear, uTreeShadowFadeFar, distToCamera\);/);
    assert.doesNotMatch(treeStaticDepth.vertexShader, /float shadowScale = 1\.0 - smoothstep/);
    assert.equal(treeDepthA.defines.DEPTH_PACKING, 3201);
    assert.match(buildingPopIn.vertexShader, /float bldgPopInScale = 1\.0 - smoothstep\(uBldgFadeNear, uBldgFadeFar, bldgDist\);/);
    assert.match(detailedBuilding.fragmentShader, /diffuseColor\.rgb \*= 0\.15;/);
    assert.match(detailedBuilding.vertexShader, /uniform vec3 uBldgCameraPos;/);
});

test('terrain prop uniform helpers return live references', () => {
    const cameraPosUniform = { value: 'camera' };
    const depthCameraUniform = { value: 'depth-camera' };

    const popInBindings = getBuildingPopInUniformBindings(cameraPosUniform, 100, 200);
    const treeDepthBindings = getTreeDepthUniformBindings(depthCameraUniform, 300, 500);

    assert.equal(popInBindings.uBldgCameraPos, cameraPosUniform);
    assert.equal(popInBindings.uBldgFadeNear.value, 100);
    assert.equal(popInBindings.uBldgFadeFar.value, 200);
    assert.equal(treeDepthBindings.uMainCameraPos, depthCameraUniform);
    assert.equal(treeDepthBindings.uTreeShadowFadeNear.value, 300);
    assert.equal(treeDepthBindings.uTreeShadowFadeFar.value, 500);
});
