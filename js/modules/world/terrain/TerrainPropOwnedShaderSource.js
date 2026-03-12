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

function buildTreeBillboardOwnedShaderSource() {
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };

    applyTreeBillboardShaderPatch(shader);

    return {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        defines: shader.defines || {}
    };
}

function buildTreeDepthOwnedShaderSource() {
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: THREE.ShaderLib.depth.vertexShader,
        fragmentShader: THREE.ShaderLib.depth.fragmentShader
    };

    applyTreeDepthShaderPatch(shader, {
        mainCameraPosUniform: { value: null }
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

export function getTreeBillboardOwnedShaderSource() {
    if (!SOURCE_CACHE.has('tree-billboard')) {
        SOURCE_CACHE.set('tree-billboard', buildTreeBillboardOwnedShaderSource());
    }
    return SOURCE_CACHE.get('tree-billboard');
}

export function getTreeDepthOwnedShaderSource() {
    if (!SOURCE_CACHE.has('tree-depth')) {
        SOURCE_CACHE.set('tree-depth', buildTreeDepthOwnedShaderSource());
    }
    return SOURCE_CACHE.get('tree-depth');
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

export function getTreeDepthUniformBindings(mainCameraPosUniform) {
    return createTreeDepthUniformBindings(mainCameraPosUniform);
}

export function getBuildingPopInUniformBindings(cameraPosUniform, fadeNear = 6800, fadeFar = 7800) {
    return createBuildingPopInUniformBindings(cameraPosUniform, fadeNear, fadeFar);
}
