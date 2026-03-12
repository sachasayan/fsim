import * as THREE from 'three';
import {
    configureMaterialShaderPipeline,
    createOwnedShaderSourcePatch,
    createShaderPatch,
    setMaterialShaderBaseKey,
    upsertMaterialShaderPatch
} from '../shaders/MaterialShaderPipeline.js';
import {
    applyDistanceAtmosphereShaderPatch,
    applyWaterDualScrollShaderPatch
} from './TerrainShaderPatches.js';
import {
    getTerrainOwnedShaderSource,
    getTerrainOwnedUniformBindings
} from './TerrainOwnedShaderSource.js';
import {
    getBuildingPopInOwnedShaderSource,
    getBuildingPopInUniformBindings,
    getDetailedBuildingOwnedShaderSource,
    getTreeBillboardOwnedShaderSource,
    getTreeDepthOwnedShaderSource,
    getTreeDepthUniformBindings
} from './TerrainPropOwnedShaderSource.js';
import {
    getWaterOwnedShaderSource,
    getWaterOwnedUniformBindings
} from './WaterOwnedShaderSource.js';

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
    setMaterialShaderBaseKey(material, `building-pop-in-standard-v1-${fadeNear}-${fadeFar}`);
    upsertMaterialShaderPatch(material, createOwnedShaderSourcePatch({
        id: 'building-pop-in-owned-source',
        cacheKey: `building-pop-in-owned-source-${fadeNear}-${fadeFar}`,
        metadata: {
            shaderFamily: 'standard',
            fadeNear,
            fadeFar
        },
        source: getBuildingPopInOwnedShaderSource({ fadeNear, fadeFar }),
        uniformBindings() {
            return getBuildingPopInUniformBindings(cameraPosUniform, fadeNear, fadeFar);
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
        baseCacheKey: 'tree-billboard-owned-v1',
        patches: [
            createOwnedShaderSourcePatch({
                id: 'tree-billboard-owned-source',
                cacheKey: 'tree-billboard-owned-source-v1',
                metadata: {
                    shaderFamily: 'standard'
                },
                source: getTreeBillboardOwnedShaderSource()
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
        baseCacheKey: 'tree-depth-owned-v1',
        patches: [
            createOwnedShaderSourcePatch({
                id: 'tree-depth-owned-source',
                cacheKey: 'tree-depth-owned-source-v1',
                metadata: {
                    shaderFamily: 'depth'
                },
                source: getTreeDepthOwnedShaderSource(),
                uniformBindings() {
                    return getTreeDepthUniformBindings(mainCameraPosUniform);
                }
            })
        ]
    });
    return mat;
}

export function createDetailedBuildingMat(style, cameraPosUniform = null) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });
    configureMaterialShaderPipeline(mat, {
        baseCacheKey: `detailed-building-owned-v1-${style}${cameraPosUniform ? '-popin' : ''}`,
        patches: [
            createOwnedShaderSourcePatch({
                id: 'detailed-building-owned-source',
                cacheKey: `detailed-building-owned-source-${style}${cameraPosUniform ? '-popin' : ''}`,
                metadata: {
                    style,
                    cameraPopIn: Boolean(cameraPosUniform),
                    shaderFamily: 'standard'
                },
                source: getDetailedBuildingOwnedShaderSource({
                    style,
                    cameraPopIn: Boolean(cameraPosUniform)
                }),
                uniformBindings() {
                    if (!cameraPosUniform) return {};
                    return getBuildingPopInUniformBindings(cameraPosUniform);
                }
            })
        ]
    });
    return mat;
}

export function setupTerrainMaterial(material, terrainDetailUniforms, atmosphereUniforms, timeUniform, isFarLOD = false) {
    const fragId = isFarLOD ? 'far' : 'near';
    configureMaterialShaderPipeline(material, {
        baseCacheKey: `terrain-owned-standard-v1-${fragId}`,
        patches: [
            createOwnedShaderSourcePatch({
                id: 'terrain-owned-source',
                cacheKey: `terrain-owned-source-${fragId}`,
                metadata: {
                    isFarLOD,
                    shaderFamily: 'standard'
                },
                source: getTerrainOwnedShaderSource({ isFarLOD }),
                uniformBindings() {
                    return getTerrainOwnedUniformBindings({
                        terrainDetailUniforms,
                        atmosphereUniforms,
                        timeUniform
                    });
                }
            })
        ]
    });
}

export function setupWaterMaterial(
    material,
    atmosphereUniforms,
    timeUniform = null,
    isFarLOD = false,
    { strength = 0.74, desat = 0.08 } = {}
) {
    if (!isFarLOD && !timeUniform) {
        throw new Error('setupWaterMaterial requires a timeUniform for near water materials');
    }

    const fragId = isFarLOD ? 'far' : 'near';
    const shaderFamily = isFarLOD ? 'basic' : 'standard';
    configureMaterialShaderPipeline(material, {
        baseCacheKey: `water-owned-${shaderFamily}-v1-${fragId}`,
        patches: [
            createOwnedShaderSourcePatch({
                id: 'water-owned-source',
                cacheKey: `water-owned-source-${fragId}-${strength.toFixed(4)}-${desat.toFixed(4)}`,
                metadata: {
                    isFarLOD,
                    shaderFamily,
                    atmosphereStrength: strength,
                    atmosphereDesat: desat,
                    dualScroll: !isFarLOD
                },
                source: getWaterOwnedShaderSource({ isFarLOD, strength, desat }),
                uniformBindings() {
                    return getWaterOwnedUniformBindings({
                        atmosphereUniforms,
                        timeUniform,
                        isFarLOD
                    });
                }
            })
        ]
    });
}
