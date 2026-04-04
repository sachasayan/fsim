// @ts-check

import * as THREE from 'three';
import {
    configureMaterialShaderPipeline,
    createOwnedShaderSourcePatch,
    createShaderPatch,
    setMaterialShaderBaseKey,
    upsertMaterialShaderPatch
} from '../shaders/MaterialShaderPipeline.js';
import { applyOwnedShaderDescriptor } from '../shaders/ShaderDescriptor.js';
import {
    applyDistanceAtmosphereShaderPatch,
} from './TerrainShaderPatches.js';
import {
    getTerrainShaderDescriptor
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
    getWaterShaderDescriptor
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

export function makeTreeBillboardMaterial(texture, tint, { cameraFacing = true, lockYAxis = true } = {}) {
    const mat = new THREE.MeshStandardMaterial({
        map: texture,
        color: tint,
        transparent: true,
        alphaTest: 0.12,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.0
    });

    configureMaterialShaderPipeline(mat, {
        baseCacheKey: `tree-billboard-owned-v2-${cameraFacing ? 'camera-facing' : 'static'}-${lockYAxis ? 'y-locked' : 'full-facing'}`,
        patches: [
            createOwnedShaderSourcePatch({
                id: 'tree-billboard-owned-source',
                cacheKey: `tree-billboard-owned-source-v2-${cameraFacing ? 'camera-facing' : 'static'}-${lockYAxis ? 'y-locked' : 'full-facing'}`,
                metadata: {
                    shaderFamily: 'standard',
                    cameraFacing,
                    lockYAxis
                },
                source: getTreeBillboardOwnedShaderSource({ cameraFacing, lockYAxis })
            })
        ]
    });
    return mat;
}

export function makeTreeDepthMaterial(texture, mainCameraPosUniform, {
    cameraFacing = true,
    lockYAxis = true,
    shadowFadeNear = 1200,
    shadowFadeFar = 1800
} = {}) {
    const mat = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        alphaMap: texture,
        alphaTest: 0.12,
        side: THREE.DoubleSide
    });

    configureMaterialShaderPipeline(mat, {
        baseCacheKey: `tree-depth-owned-v2-${cameraFacing ? 'camera-facing' : 'static'}-${lockYAxis ? 'y-locked' : 'full-facing'}-${shadowFadeNear}-${shadowFadeFar}`,
        patches: [
            createOwnedShaderSourcePatch({
                id: 'tree-depth-owned-source',
                cacheKey: `tree-depth-owned-source-v2-${cameraFacing ? 'camera-facing' : 'static'}-${lockYAxis ? 'y-locked' : 'full-facing'}-${shadowFadeNear}-${shadowFadeFar}`,
                metadata: {
                    shaderFamily: 'depth',
                    cameraFacing,
                    lockYAxis,
                    shadowFadeNear,
                    shadowFadeFar
                },
                source: getTreeDepthOwnedShaderSource({ cameraFacing, lockYAxis, shadowFadeNear, shadowFadeFar }),
                uniformBindings() {
                    return getTreeDepthUniformBindings(mainCameraPosUniform, shadowFadeNear, shadowFadeFar);
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

export function setupTerrainMaterial(
    material,
    terrainDetailUniforms,
    atmosphereUniforms,
    timeUniform,
    isFarLOD = false,
    { shadowContrast = 0.0 } = {}
) {
    applyOwnedShaderDescriptor(
        material,
        getTerrainShaderDescriptor({ isFarLOD, shadowContrast }),
        {
            terrainDetailUniforms,
            atmosphereUniforms,
            timeUniform
        }
    );
}

export function setupWaterMaterial(
    material,
    atmosphereUniforms,
    isFarLOD = false,
    waterSurfaceUniforms = null,
    {
        strength = 0.74,
        desat = 0.08,
        shadowContrast = 0.0,
        normalStrength = 1.5,
        patternEnabled = true
    } = {}
) {
    applyOwnedShaderDescriptor(
        material,
        getWaterShaderDescriptor({
            isFarLOD,
            strength,
            desat,
            shadowContrast,
            normalStrength,
            patternEnabled
        }),
        {
            atmosphereUniforms,
            waterSurfaceUniforms
        }
    );
}
