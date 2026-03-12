import * as THREE from 'three';
import {
    configureMaterialShaderPipeline,
    createShaderPatch,
    setMaterialShaderBaseKey,
    upsertMaterialShaderPatch
} from '../shaders/MaterialShaderPipeline.js';
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
    setMaterialShaderBaseKey(material, programKey);
    upsertMaterialShaderPatch(material, createShaderPatch({
        id: 'distance-atmosphere',
        cacheKey: `distance-atmosphere-${programKey}`,
        metadata: { programKey, strength, desat },
        apply(shader) {
            applyDistanceAtmosphereShaderPatch(shader, { atmosphereUniforms, strength, desat });
        }
    }));
}

export function applyWaterDualScrollToMaterial(material, timeUniform) {
    upsertMaterialShaderPatch(material, createShaderPatch({
        id: 'water-dual-scroll',
        cacheKey: 'water-dual-scroll',
        apply(shader) {
            applyWaterDualScrollShaderPatch(shader, { timeUniform });
        }
    }));
}

// Injects distance-based pop-in scale into a building material's vertex shader.
// Buildings scale from 0 -> 1 over the range [fadeNear, fadeFar] (in world-space units).
export function setupBuildingPopIn(material, cameraPosUniform, fadeNear = 6800, fadeFar = 7800) {
    upsertMaterialShaderPatch(material, createShaderPatch({
        id: 'building-pop-in',
        cacheKey: `building-pop-in-${fadeNear}-${fadeFar}`,
        metadata: { fadeNear, fadeFar },
        apply(shader) {
            applyBuildingPopInShaderPatch(shader, { cameraPosUniform, fadeNear, fadeFar });
        }
    }));
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

    configureMaterialShaderPipeline(mat, {
        baseCacheKey: 'treeBillboard',
        patches: [
            createShaderPatch({
                id: 'tree-billboard-align',
                apply(shader) {
                    applyTreeBillboardShaderPatch(shader);
                }
            })
        ]
    });
    return mat;
}

export function makeTreeDepthMaterial(texture, mainCameraPosUniform) {
    const mat = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        alphaMap: texture,
        alphaTest: 0.12,
        side: THREE.DoubleSide
    });

    configureMaterialShaderPipeline(mat, {
        baseCacheKey: 'treeDepthBillboard_v3',
        patches: [
            createShaderPatch({
                id: 'tree-depth-billboard',
                apply(shader) {
                    applyTreeDepthShaderPatch(shader, { mainCameraPosUniform });
                }
            })
        ]
    });
    return mat;
}

export function createDetailedBuildingMat(style, cameraPosUniform = null) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });
    configureMaterialShaderPipeline(mat, {
        baseCacheKey: `detailed-building-mat-v3-${style}${cameraPosUniform ? '-popin' : ''}`,
        patches: [
            createShaderPatch({
                id: 'detailed-building-style',
                cacheKey: `detailed-building-style-${style}`,
                metadata: { style, cameraPopIn: Boolean(cameraPosUniform) },
                apply(shader) {
                    applyDetailedBuildingShaderPatch(shader, { style, cameraPosUniform });
                }
            })
        ]
    });
    return mat;
}

export function setupTerrainMaterial(material, terrainDetailUniforms, atmosphereUniforms, timeUniform, isFarLOD = false) {
    const fragId = isFarLOD ? 'far' : 'near';
    configureMaterialShaderPipeline(material, {
        baseCacheKey: `terrain-detail-v8-${fragId}`,
        patches: [
            createShaderPatch({
                id: 'terrain-detail',
                cacheKey: `terrain-detail-${fragId}`,
                metadata: { isFarLOD },
                apply(shader) {
                    applyTerrainDetailShaderPatch(shader, {
                        terrainDetailUniforms,
                        atmosphereUniforms,
                        timeUniform,
                        isFarLOD
                    });
                }
            })
        ]
    });
}
