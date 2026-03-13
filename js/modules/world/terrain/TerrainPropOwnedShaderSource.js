import * as THREE from 'three';

import {
    applyBuildingPopInShaderPatch,
    applyDetailedBuildingShaderPatch,
    applyTreeBillboardShaderPatch,
    applyTreeDepthShaderPatch,
    createBuildingPopInUniformBindings,
    createTreeDepthUniformBindings
} from './TerrainShaderPatches.js';

const SOURCE_CACHE = new Map();

function buildTreeBillboardOwnedShaderSource({ cameraFacing = true, lockYAxis = true } = {}) {
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };

    applyTreeBillboardShaderPatch(shader, { cameraFacing, lockYAxis });

    return {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        defines: shader.defines || {}
    };
}

function buildTreeDepthOwnedShaderSource({ cameraFacing = true, lockYAxis = true, shadowFadeNear = 1200, shadowFadeFar = 1800 } = {}) {
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: THREE.ShaderLib.depth.vertexShader,
        fragmentShader: THREE.ShaderLib.depth.fragmentShader
    };

    applyTreeDepthShaderPatch(shader, {
        mainCameraPosUniform: { value: null },
        cameraFacing,
        lockYAxis,
        shadowFadeNear,
        shadowFadeFar
    });

    return {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        defines: shader.defines || {}
    };
}

function buildBuildingPopInOwnedShaderSource({ fadeNear = 6800, fadeFar = 7800 } = {}) {
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };

    applyBuildingPopInShaderPatch(shader, {
        cameraPosUniform: { value: null },
        fadeNear,
        fadeFar
    });

    return {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        defines: shader.defines || {}
    };
}

function buildDetailedBuildingOwnedShaderSource({ style, cameraPopIn = false, fadeNear = 6800, fadeFar = 7800 } = {}) {
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };

    applyDetailedBuildingShaderPatch(shader, {
        style,
        cameraPosUniform: cameraPopIn ? { value: null } : null,
        fadeNear,
        fadeFar
    });

    return {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        defines: shader.defines || {}
    };
}

export function getTreeBillboardOwnedShaderSource({ cameraFacing = true, lockYAxis = true } = {}) {
    const cacheKey = `tree-billboard:${cameraFacing ? 'camera-facing' : 'static'}:${lockYAxis ? 'y-locked' : 'full-facing'}`;
    if (!SOURCE_CACHE.has(cacheKey)) {
        SOURCE_CACHE.set(cacheKey, buildTreeBillboardOwnedShaderSource({ cameraFacing, lockYAxis }));
    }
    return SOURCE_CACHE.get(cacheKey);
}

export function getTreeDepthOwnedShaderSource({ cameraFacing = true, lockYAxis = true, shadowFadeNear = 1200, shadowFadeFar = 1800 } = {}) {
    const cacheKey = `tree-depth:${cameraFacing ? 'camera-facing' : 'static'}:${lockYAxis ? 'y-locked' : 'full-facing'}:${shadowFadeNear}:${shadowFadeFar}`;
    if (!SOURCE_CACHE.has(cacheKey)) {
        SOURCE_CACHE.set(cacheKey, buildTreeDepthOwnedShaderSource({ cameraFacing, lockYAxis, shadowFadeNear, shadowFadeFar }));
    }
    return SOURCE_CACHE.get(cacheKey);
}

export function getBuildingPopInOwnedShaderSource({ fadeNear = 6800, fadeFar = 7800 } = {}) {
    const cacheKey = `building-pop-in:${fadeNear}:${fadeFar}`;
    if (!SOURCE_CACHE.has(cacheKey)) {
        SOURCE_CACHE.set(cacheKey, buildBuildingPopInOwnedShaderSource({ fadeNear, fadeFar }));
    }
    return SOURCE_CACHE.get(cacheKey);
}

export function getDetailedBuildingOwnedShaderSource({ style, cameraPopIn = false, fadeNear = 6800, fadeFar = 7800 } = {}) {
    const cacheKey = `detailed-building:${style}:${cameraPopIn ? 'popin' : 'static'}:${fadeNear}:${fadeFar}`;
    if (!SOURCE_CACHE.has(cacheKey)) {
        SOURCE_CACHE.set(cacheKey, buildDetailedBuildingOwnedShaderSource({ style, cameraPopIn, fadeNear, fadeFar }));
    }
    return SOURCE_CACHE.get(cacheKey);
}

export function getTreeDepthUniformBindings(mainCameraPosUniform, shadowFadeNear = 1200, shadowFadeFar = 1800) {
    return createTreeDepthUniformBindings(mainCameraPosUniform, shadowFadeNear, shadowFadeFar);
}

export function getBuildingPopInUniformBindings(cameraPosUniform, fadeNear = 6800, fadeFar = 7800) {
    return createBuildingPopInUniformBindings(cameraPosUniform, fadeNear, fadeFar);
}
