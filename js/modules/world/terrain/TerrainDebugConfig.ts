// @ts-check

import * as THREE from 'three';
import { setupTerrainMaterial, setupWaterMaterial } from './TerrainMaterials.js';

type Bounds = {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
};

type TerrainDebugConfigOptions = {
    terrainDebugSettings: Record<string, any>;
    CHUNK_SIZE: number;
    terrainMaterial: THREE.MeshStandardMaterial;
    terrainFarMaterial: THREE.MeshStandardMaterial;
    terrainDetailUniforms: Record<string, any>;
    atmosphereUniforms: Record<string, any>;
    waterTimeUniform: { value: number };
    waterMaterial: THREE.MeshStandardMaterial;
    waterFarMaterial: THREE.Material;
    waterSurfaceUniforms: Record<string, any>;
    baseWaterNormalScale: THREE.Vector2;
    grassTexture: THREE.Texture;
    grassBumpTexture: THREE.Texture;
    getGrassNormalTexture: () => THREE.Texture | null;
    grassSettings: {
        scale: number;
        strength: number;
        nearStart: number;
        nearEnd: number;
        enabled: boolean;
        debugMaskEnabled: boolean;
        bumpEnabled: boolean;
        bumpScale: number;
        normalEnabled: boolean;
        normalScale: number;
    };
    distanceToLeafBoundsSq: (leaf: Bounds | { bounds?: Bounds | null } | null | undefined, x: number, z: number) => number;
    atmosphereCameraPos: THREE.Vector3;
    getActiveLeaves: () => Iterable<any>;
    getTerrainChunks: () => Iterable<any>;
    syncSurfaceShadowReception: () => void;
    invalidateActiveLeafSurfaces: () => void;
    rebuildHydrologyMeshes: () => void;
    invalidateChunkProps: () => void;
    updateTerrain: () => unknown;
};

export function createTerrainDebugConfigRuntime({
    terrainDebugSettings,
    CHUNK_SIZE,
    terrainMaterial,
    terrainFarMaterial,
    terrainDetailUniforms,
    atmosphereUniforms,
    waterTimeUniform,
    waterMaterial,
    waterFarMaterial,
    waterSurfaceUniforms,
    baseWaterNormalScale,
    grassTexture,
    grassBumpTexture,
    getGrassNormalTexture,
    grassSettings,
    distanceToLeafBoundsSq,
    atmosphereCameraPos,
    getActiveLeaves,
    getTerrainChunks,
    syncSurfaceShadowReception,
    invalidateActiveLeafSurfaces,
    rebuildHydrologyMeshes,
    invalidateChunkProps,
    updateTerrain
}: TerrainDebugConfigOptions) {
    function normalizeTerrainDebugSettings() {
        terrainDebugSettings.selectionInterestRadius = Math.max(CHUNK_SIZE * 0.25, terrainDebugSettings.selectionInterestRadius);
        terrainDebugSettings.selectionBlockingRadius = Math.max(CHUNK_SIZE * 0.125, terrainDebugSettings.selectionBlockingRadius);
        terrainDebugSettings.selectionMinCellSize = Math.max(32, terrainDebugSettings.selectionMinCellSize);
        terrainDebugSettings.selectionSplitDistanceFactor = Math.max(0.05, terrainDebugSettings.selectionSplitDistanceFactor);
        terrainDebugSettings.selectionLookaheadSeconds = Math.max(0, terrainDebugSettings.selectionLookaheadSeconds);
        terrainDebugSettings.selectionLookaheadMaxDistance = Math.max(0, terrainDebugSettings.selectionLookaheadMaxDistance);
        terrainDebugSettings.selectionLookaheadRadiusPadding = Math.max(0, terrainDebugSettings.selectionLookaheadRadiusPadding);
        terrainDebugSettings.selectionMaxDepth = Math.max(0, Math.min(12, Math.round(terrainDebugSettings.selectionMaxDepth)));
        terrainDebugSettings.bootstrapRadius = Math.max(CHUNK_SIZE * 0.25, terrainDebugSettings.bootstrapRadius);

        const thresholds = [
            Math.max(32, terrainDebugSettings.resolution64MaxNodeSize),
            Math.max(32, terrainDebugSettings.resolution32MaxNodeSize),
            Math.max(32, terrainDebugSettings.resolution16MaxNodeSize),
            Math.max(32, terrainDebugSettings.resolution8MaxNodeSize),
            Math.max(32, terrainDebugSettings.resolution4MaxNodeSize)
        ].sort((a, b) => a - b);
        [
            terrainDebugSettings.resolution64MaxNodeSize,
            terrainDebugSettings.resolution32MaxNodeSize,
            terrainDebugSettings.resolution16MaxNodeSize,
            terrainDebugSettings.resolution8MaxNodeSize,
            terrainDebugSettings.resolution4MaxNodeSize
        ] = thresholds;
        if (!['auto', 'force-on', 'force-off'].includes(terrainDebugSettings.waterShadowMode)) {
            terrainDebugSettings.waterShadowMode = 'auto';
        }
        terrainDebugSettings.surfaceShadowDistance = Math.max(0, terrainDebugSettings.surfaceShadowDistance);
        const shadowFadeRatio = 0.8;
        atmosphereUniforms.uSurfaceShadowDistance.value = terrainDebugSettings.surfaceShadowDistance;
        atmosphereUniforms.uSurfaceShadowFadeStart.value = terrainDebugSettings.surfaceShadowDistance * shadowFadeRatio;
        terrainDebugSettings.terrainShadowContrast = Math.max(0, Math.min(1, terrainDebugSettings.terrainShadowContrast));
        terrainDebugSettings.waterRoughness = Math.max(0, Math.min(1, terrainDebugSettings.waterRoughness));
        terrainDebugSettings.waterMetalness = Math.max(0, Math.min(1, terrainDebugSettings.waterMetalness));
        terrainDebugSettings.waterNormalStrength = Math.max(0, Math.min(4, terrainDebugSettings.waterNormalStrength));
        terrainDebugSettings.waterAtmosphereStrength = Math.max(0, Math.min(2, terrainDebugSettings.waterAtmosphereStrength));
        terrainDebugSettings.waterAtmosphereDesaturation = Math.max(0, Math.min(1, terrainDebugSettings.waterAtmosphereDesaturation));
        terrainDebugSettings.waterShadowContrast = Math.max(0, Math.min(1, terrainDebugSettings.waterShadowContrast));
    }

    function applyTerrainWireframeSetting() {
        terrainMaterial.wireframe = terrainDebugSettings.showTerrainWireframe;
        terrainFarMaterial.wireframe = terrainDebugSettings.showTerrainWireframe;
        terrainMaterial.needsUpdate = true;
        terrainFarMaterial.needsUpdate = true;
    }

    function applyTerrainMaterialDebugSettings() {
        setupTerrainMaterial(
            terrainMaterial,
            terrainDetailUniforms,
            atmosphereUniforms,
            waterTimeUniform,
            false,
            { shadowContrast: terrainDebugSettings.terrainShadowContrast }
        );
        setupTerrainMaterial(
            terrainFarMaterial,
            terrainDetailUniforms,
            atmosphereUniforms,
            waterTimeUniform,
            true,
            { shadowContrast: terrainDebugSettings.terrainShadowContrast }
        );
        terrainMaterial.needsUpdate = true;
        terrainFarMaterial.needsUpdate = true;
    }

    function shouldSurfaceReceiveShadow(bounds: Bounds | null = null) {
        if (!bounds) return false;
        const threshold = terrainDebugSettings.surfaceShadowDistance;
        if (!Number.isFinite(threshold) || threshold <= 0) return false;
        const focusX = atmosphereCameraPos.x;
        const focusZ = atmosphereCameraPos.z;
        return distanceToLeafBoundsSq(bounds, focusX, focusZ) <= threshold * threshold;
    }

    function shouldSurfaceCastShadow(bounds: Bounds | null = null) {
        return shouldSurfaceReceiveShadow(bounds);
    }

    function shouldWaterReceiveShadow(bounds: Bounds | null = null) {
        if (terrainDebugSettings.waterShadowMode === 'force-on') return true;
        if (terrainDebugSettings.waterShadowMode === 'force-off') return false;
        return shouldSurfaceReceiveShadow(bounds);
    }

    function configureWaterMaterialDebug(material: any, {
        isFarLOD = false,
        waterUniforms = waterSurfaceUniforms
    } = {}) {
        if (!material) return;
        const shaderConfigKey = [
            isFarLOD ? 'far' : 'near',
            terrainDebugSettings.waterRoughness.toFixed(4),
            terrainDebugSettings.waterMetalness.toFixed(4),
            terrainDebugSettings.waterNormalStrength.toFixed(4),
            terrainDebugSettings.showWaterWireframe ? 'wire' : 'solid',
            terrainDebugSettings.waterAtmosphereStrength.toFixed(4),
            terrainDebugSettings.waterAtmosphereDesaturation.toFixed(4),
            terrainDebugSettings.waterShadowContrast.toFixed(4),
            terrainDebugSettings.waterNormalAnimation ? 'pattern' : 'flat'
        ].join(':');
        material.roughness = terrainDebugSettings.waterRoughness;
        material.metalness = terrainDebugSettings.waterMetalness;
        material.normalMap = null;
        if (material.normalScale) {
            material.normalScale.set(
                baseWaterNormalScale.x * terrainDebugSettings.waterNormalStrength,
                baseWaterNormalScale.y * terrainDebugSettings.waterNormalStrength
            );
        } else {
            material.normalScale = new THREE.Vector2(
                baseWaterNormalScale.x * terrainDebugSettings.waterNormalStrength,
                baseWaterNormalScale.y * terrainDebugSettings.waterNormalStrength
            );
        }
        material.wireframe = terrainDebugSettings.showWaterWireframe;
        material.userData = material.userData || {};
        material.userData.isFarWaterLod = isFarLOD;
        material.userData.waterSurfaceUniforms = waterUniforms;
        if (material.userData.waterShaderConfigKey !== shaderConfigKey) {
            setupWaterMaterial(
                material,
                atmosphereUniforms,
                isFarLOD,
                waterUniforms,
                {
                    strength: terrainDebugSettings.waterAtmosphereStrength,
                    desat: terrainDebugSettings.waterAtmosphereDesaturation,
                    shadowContrast: terrainDebugSettings.waterShadowContrast,
                    normalStrength: terrainDebugSettings.waterNormalStrength,
                    patternEnabled: terrainDebugSettings.waterNormalAnimation
                }
            );
            material.userData.waterShaderConfigKey = shaderConfigKey;
            material.needsUpdate = true;
        }
    }

    function applyWaterDebugSettings() {
        configureWaterMaterialDebug(waterMaterial, {
            isFarLOD: false,
            waterUniforms: waterSurfaceUniforms
        });
        configureWaterMaterialDebug(waterFarMaterial, {
            isFarLOD: true,
            waterUniforms: waterSurfaceUniforms
        });

        for (const leafState of getActiveLeaves()) {
            if (!leafState?.waterMesh) continue;
            leafState.waterMesh.receiveShadow = shouldWaterReceiveShadow(leafState.bounds);
            configureWaterMaterialDebug(leafState.waterMesh.material, {
                isFarLOD: false,
                waterUniforms: leafState.waterMesh.material?.userData?.waterSurfaceUniforms || waterSurfaceUniforms
            });
        }

        for (const state of getTerrainChunks()) {
            const waterMesh = state?.group?.userData?.chunkBaseWaterMesh || null;
            if (!waterMesh) continue;
            waterMesh.receiveShadow = shouldWaterReceiveShadow(state.bounds || null);
            configureWaterMaterialDebug(waterMesh.material, {
                isFarLOD: state.lod !== 0,
                waterUniforms: waterMesh.material?.userData?.waterSurfaceUniforms || waterSurfaceUniforms
            });
        }
    }

    function applyTerrainGrassMapSettings() {
        const uvRepeat = grassSettings.scale * 512;
        grassBumpTexture.repeat.set(uvRepeat, uvRepeat);
        getGrassNormalTexture()?.repeat.set(uvRepeat, uvRepeat);

        terrainMaterial.bumpMap = grassSettings.bumpEnabled ? grassBumpTexture : null;
        terrainMaterial.bumpScale = grassSettings.bumpScale;
        terrainMaterial.normalMap = grassSettings.normalEnabled ? getGrassNormalTexture() : null;
        terrainMaterial.normalScale.set(grassSettings.normalScale, grassSettings.normalScale);

        terrainFarMaterial.bumpMap = null;
        terrainFarMaterial.normalMap = null;

        terrainMaterial.needsUpdate = true;
        terrainFarMaterial.needsUpdate = true;
    }

    function applyTerrainGrassShaderSettings() {
        grassTexture.repeat.set(grassSettings.scale * 512, grassSettings.scale * 512);
        terrainDetailUniforms.uTerrainGrassTexScale.value = grassSettings.scale;
        terrainDetailUniforms.uTerrainGrassTexStrength.value = grassSettings.strength;
        terrainDetailUniforms.uTerrainGrassTexNearStart.value = grassSettings.nearStart;
        terrainDetailUniforms.uTerrainGrassTexNearEnd.value = grassSettings.nearEnd;
        terrainDetailUniforms.uTerrainGrassShowTexture.value = grassSettings.enabled ? 1.0 : 0.0;
        terrainDetailUniforms.uTerrainGrassDebugMask.value = grassSettings.debugMaskEnabled ? 1.0 : 0.0;
    }

    function applyTerrainDebugSettings({ rebuildSurfaces = false, refreshSelection = false, rebuildProps = false, rebuildHydrology = false } = {}) {
        normalizeTerrainDebugSettings();
        applyTerrainWireframeSetting();
        applyTerrainMaterialDebugSettings();
        applyWaterDebugSettings();
        syncSurfaceShadowReception();
        applyTerrainGrassShaderSettings();
        applyTerrainGrassMapSettings();
        if (rebuildSurfaces) {
            invalidateActiveLeafSurfaces();
        }
        if (rebuildHydrology) {
            rebuildHydrologyMeshes();
        }
        if (rebuildProps) {
            invalidateChunkProps();
        }
        if (refreshSelection) {
            updateTerrain();
        }
    }

    return {
        normalizeTerrainDebugSettings,
        applyTerrainWireframeSetting,
        applyTerrainMaterialDebugSettings,
        shouldSurfaceReceiveShadow,
        shouldSurfaceCastShadow,
        shouldWaterReceiveShadow,
        configureWaterMaterialDebug,
        applyWaterDebugSettings,
        applyTerrainGrassMapSettings,
        applyTerrainGrassShaderSettings,
        applyTerrainDebugSettings
    };
}
