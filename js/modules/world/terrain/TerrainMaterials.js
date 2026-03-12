import * as THREE from 'three';
import {
    appendMaterialProgramCacheKey,
    chainMaterialShaderPatch
} from '../shaders/ShaderPatchUtils.js';
import {
    applyBuildingPopInShaderPatch,
    applyDetailedBuildingShaderPatch,
    applyDistanceAtmosphereShaderPatch,
    applyTerrainDetailShaderPatch,
    applyTreeBillboardShaderPatch,
    applyTreeDepthShaderPatch,
    applyWaterDualScrollShaderPatch
} from './TerrainShaderPatches.js';

export function applyDistanceAtmosphereToMaterial(material, programKey, atmosphereUniforms, strength = 0.5, desat = 0.0) {
    material.onBeforeCompile = (shader) => {
        applyDistanceAtmosphereShaderPatch(shader, { atmosphereUniforms, strength, desat });
    };
    material.customProgramCacheKey = () => `atmos-${programKey}`;
}

export function applyWaterDualScrollToMaterial(material, timeUniform) {
    chainMaterialShaderPatch(material, (shader) => {
        applyWaterDualScrollShaderPatch(shader, { timeUniform });
    });
    appendMaterialProgramCacheKey(material, '-dualscroll');
}

// Injects distance-based pop-in scale into a building material's vertex shader.
// Buildings scale from 0 -> 1 over the range [fadeNear, fadeFar] (in world-space units).
export function setupBuildingPopIn(material, cameraPosUniform, fadeNear = 6800, fadeFar = 7800) {
    chainMaterialShaderPatch(material, (shader) => {
        applyBuildingPopInShaderPatch(shader, { cameraPosUniform, fadeNear, fadeFar });
    });
    appendMaterialProgramCacheKey(material, `-bldg-popin-${fadeNear}-${fadeFar}`);
}

export function makeTreeBillboardMaterial(texture, tint) {
    const mat = new THREE.MeshStandardMaterial({
        map: texture,
        color: tint,
        transparent: true,
        alphaTest: 0.12,
        side: THREE.FrontSide, // FrontSide only for billboard
        roughness: 1.0,
        metalness: 0.0
    });

    mat.onBeforeCompile = (shader) => {
        applyTreeBillboardShaderPatch(shader);
    };

    mat.customProgramCacheKey = () => 'treeBillboard';
    return mat;
}

export function makeTreeDepthMaterial(texture, mainCameraPosUniform) {
    const mat = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        alphaMap: texture,
        alphaTest: 0.12,
        side: THREE.DoubleSide
    });

    mat.onBeforeCompile = (shader) => {
        applyTreeDepthShaderPatch(shader, { mainCameraPosUniform });
    };

    mat.customProgramCacheKey = () => 'treeDepthBillboard_v3';
    return mat;
}

export function createDetailedBuildingMat(style, cameraPosUniform = null) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });
    mat.onBeforeCompile = (shader) => {
        applyDetailedBuildingShaderPatch(shader, { style, cameraPosUniform });
    };
    mat.customProgramCacheKey = () => `detailed-building-mat-v3-${style}${cameraPosUniform ? '-popin' : ''}`;
    return mat;
}

export function setupTerrainMaterial(material, terrainDetailUniforms, atmosphereUniforms, timeUniform, isFarLOD = false) {
    material.onBeforeCompile = (shader) => {
        applyTerrainDetailShaderPatch(shader, {
            terrainDetailUniforms,
            atmosphereUniforms,
            timeUniform,
            isFarLOD
        });
    };
    const fragId = isFarLOD ? 'far' : 'near';
    material.customProgramCacheKey = () => `terrain-detail-v8-${fragId}`;
}
