import * as THREE from 'three';

export function applyDistanceAtmosphereToMaterial(material, programKey, atmosphereUniforms, strength = 0.5, desat = 0.0) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uAtmosCameraPos = atmosphereUniforms.uAtmosCameraPos;
        shader.uniforms.uAtmosColor = atmosphereUniforms.uAtmosColor;
        shader.uniforms.uAtmosNear = atmosphereUniforms.uAtmosNear;
        shader.uniforms.uAtmosFar = atmosphereUniforms.uAtmosFar;

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>\nvarying vec3 vAtmosWorldPos;`
            )
            .replace(
                '#include <worldpos_vertex>',
                `#include <worldpos_vertex>\nvAtmosWorldPos = worldPosition.xyz;`
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>\nvarying vec3 vAtmosWorldPos;\nuniform vec3 uAtmosCameraPos;\nuniform vec3 uAtmosColor;\nuniform float uAtmosNear;\nuniform float uAtmosFar;`
            )
            .replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `vec4 diffuseColor = vec4( diffuse, opacity );
float atmosDist = distance(vAtmosWorldPos, uAtmosCameraPos);
float atmosMix = smoothstep(uAtmosNear, uAtmosFar, atmosDist) * ${strength.toFixed(4)};
float atmosLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(atmosLuma), ${desat.toFixed(4)} * atmosMix);
diffuseColor.rgb = mix(diffuseColor.rgb, uAtmosColor, atmosMix);`
            );
    };
    material.customProgramCacheKey = () => `atmos-${programKey}`;
}

export function makeTreeBillboardMaterial(texture, tint) {
    return new THREE.MeshStandardMaterial({
        map: texture,
        color: tint,
        transparent: true,
        alphaTest: 0.12,
        side: THREE.DoubleSide,
        roughness: 1.0,
        metalness: 0.0
    });
}

export function createDetailedBuildingMat(style) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });
    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = `
        varying vec3 vBldgObjPos;
        varying vec3 vBldgScale;
        varying vec3 vBldgNormal;
      ` + shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\n        vBldgObjPos = position;\n        vBldgNormal = normal;\n        vBldgScale = vec3(\n            length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2])),\n            length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2])),\n            length(vec3(instanceMatrix[2][0], instanceMatrix[2][1], instanceMatrix[2][2]))\n        );`
        );

        let colorFragment = '';
        let roughFragment = '';

        if (style === 'commercial') {
            colorFragment = `
        vec3 absBldgNorm = abs(vBldgNormal);
        if (absBldgNorm.y < 0.9) {
            vec2 wallUv;
            if (absBldgNorm.x > 0.5) wallUv = vec2(vBldgObjPos.z * vBldgScale.z, vBldgObjPos.y * vBldgScale.y);
            else wallUv = vec2(vBldgObjPos.x * vBldgScale.x, vBldgObjPos.y * vBldgScale.y);
            
            float winX = fract(wallUv.x * 0.4);
            float winY = fract(wallUv.y * 0.33);
            
            if (winX > 0.15 && winY > 0.25) {
                diffuseColor.rgb *= 0.15;
                diffuseColor.rgb += vec3(0.02, 0.05, 0.1); 
            } else {
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.15); 
            }
        }`;
            roughFragment = `
        if (abs(vBldgNormal.y) < 0.9) {
            vec2 wallUv;
            if (abs(vBldgNormal.x) > 0.5) wallUv = vec2(vBldgObjPos.z * vBldgScale.z, vBldgObjPos.y * vBldgScale.y);
            else wallUv = vec2(vBldgObjPos.x * vBldgScale.x, vBldgObjPos.y * vBldgScale.y);
            float winX = fract(wallUv.x * 0.4);
            float winY = fract(wallUv.y * 0.33);
            if (winX > 0.15 && winY > 0.25) {
                roughnessFactor = 0.1;
            }
        }`;
        } else if (style === 'residential') {
            colorFragment = `
        vec3 absBldgNorm = abs(vBldgNormal);
        if (absBldgNorm.y < 0.9) {
            vec2 wallUv;
            if (absBldgNorm.x > 0.5) wallUv = vec2(vBldgObjPos.z * vBldgScale.z, vBldgObjPos.y * vBldgScale.y);
            else wallUv = vec2(vBldgObjPos.x * vBldgScale.x, vBldgObjPos.y * vBldgScale.y);
            
            float winX = fract(wallUv.x * 0.25);
            float winY = fract(wallUv.y * 0.25);
            
            if (winX > 0.4 && winX < 0.8 && winY > 0.4 && winY < 0.8) {
                diffuseColor.rgb *= 0.05;
                diffuseColor.rgb += vec3(0.01, 0.02, 0.03); 
            }
        }`;
            roughFragment = `
        if (abs(vBldgNormal.y) < 0.9) {
            vec2 wallUv;
            if (abs(vBldgNormal.x) > 0.5) wallUv = vec2(vBldgObjPos.z * vBldgScale.z, vBldgObjPos.y * vBldgScale.y);
            else wallUv = vec2(vBldgObjPos.x * vBldgScale.x, vBldgObjPos.y * vBldgScale.y);
            float winX = fract(wallUv.x * 0.25);
            float winY = fract(wallUv.y * 0.25);
            if (winX > 0.4 && winX < 0.8 && winY > 0.4 && winY < 0.8) {
                roughnessFactor = 0.15;
            }
        }`;
        } else if (style === 'industrial') {
            colorFragment = `
        vec3 absBldgNorm = abs(vBldgNormal);
        if (absBldgNorm.y < 0.9) {
            vec2 wallUv;
            if (absBldgNorm.x > 0.5) wallUv = vec2(vBldgObjPos.z * vBldgScale.z, vBldgObjPos.y * vBldgScale.y);
            else wallUv = vec2(vBldgObjPos.x * vBldgScale.x, vBldgObjPos.y * vBldgScale.y);
            
            float ribY = fract(wallUv.y * 2.0);
            diffuseColor.rgb *= mix(0.85, 1.0, ribY);
            
            if (wallUv.y > 0.8 && fract(wallUv.x * 0.1) > 0.2 && fract(wallUv.x * 0.1) < 0.8) {
                diffuseColor.rgb *= 0.2;
                diffuseColor.rgb += vec3(0.02, 0.03, 0.04);
            }
        }`;
            roughFragment = `
        if (abs(vBldgNormal.y) < 0.9) {
            vec2 wallUv;
            if (abs(vBldgNormal.x) > 0.5) wallUv = vec2(vBldgObjPos.z * vBldgScale.z, vBldgObjPos.y * vBldgScale.y);
            else wallUv = vec2(vBldgObjPos.x * vBldgScale.x, vBldgObjPos.y * vBldgScale.y);
            if (wallUv.y > 0.8 && fract(wallUv.x * 0.1) > 0.2 && fract(wallUv.x * 0.1) < 0.8) {
                roughnessFactor = 0.2;
            }
        }`;
        }

        shader.fragmentShader = `
        varying vec3 vBldgObjPos;
        varying vec3 vBldgScale;
        varying vec3 vBldgNormal;
      ` + shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#include <color_fragment>\n${colorFragment}`
        ).replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>\n${roughFragment}`
        );
    };
    mat.customProgramCacheKey = () => `detailed-building-mat-v2-${style}`;
    return mat;
}

export function setupTerrainMaterial(material, terrainDetailUniforms, atmosphereUniforms) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTerrainGrassDetailTex = terrainDetailUniforms.uTerrainGrassDetailTex;
        shader.uniforms.uTerrainRockDetailTex = terrainDetailUniforms.uTerrainRockDetailTex;
        shader.uniforms.uTerrainDetailScale = terrainDetailUniforms.uTerrainDetailScale;
        shader.uniforms.uTerrainDetailStrength = terrainDetailUniforms.uTerrainDetailStrength;
        shader.uniforms.uTerrainSlopeStart = terrainDetailUniforms.uTerrainSlopeStart;
        shader.uniforms.uTerrainSlopeEnd = terrainDetailUniforms.uTerrainSlopeEnd;
        shader.uniforms.uTerrainRockHeightStart = terrainDetailUniforms.uTerrainRockHeightStart;
        shader.uniforms.uTerrainRockHeightEnd = terrainDetailUniforms.uTerrainRockHeightEnd;
        shader.uniforms.uAtmosCameraPos = atmosphereUniforms.uAtmosCameraPos;
        shader.uniforms.uAtmosColor = atmosphereUniforms.uAtmosColor;
        shader.uniforms.uAtmosNear = atmosphereUniforms.uAtmosNear;
        shader.uniforms.uAtmosFar = atmosphereUniforms.uAtmosFar;
        shader.uniforms.uTerrainAtmosStrength = terrainDetailUniforms.uTerrainAtmosStrength;
        shader.uniforms.uTerrainFoliageNearStart = terrainDetailUniforms.uTerrainFoliageNearStart;
        shader.uniforms.uTerrainFoliageNearEnd = terrainDetailUniforms.uTerrainFoliageNearEnd;
        shader.uniforms.uTerrainFoliageStrength = terrainDetailUniforms.uTerrainFoliageStrength;

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>\nvarying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNormal;`
            )
            .replace(
                '#include <worldpos_vertex>',
                `#include <worldpos_vertex>\nvTerrainWorldPos = worldPosition.xyz;\nvTerrainWorldNormal = normalize(mat3(modelMatrix) * normal);`
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>\n` +
                `varying vec3 vTerrainWorldPos;
varying vec3 vTerrainWorldNormal;
uniform sampler2D uTerrainGrassDetailTex;
uniform sampler2D uTerrainRockDetailTex;
uniform float uTerrainDetailScale;
uniform float uTerrainDetailStrength;
uniform float uTerrainSlopeStart;
uniform float uTerrainSlopeEnd;
uniform float uTerrainRockHeightStart;
uniform float uTerrainRockHeightEnd;
uniform vec3 uAtmosCameraPos;
uniform vec3 uAtmosColor;
uniform float uAtmosNear;
uniform float uAtmosFar;
uniform float uTerrainAtmosStrength;
uniform float uTerrainFoliageNearStart;
uniform float uTerrainFoliageNearEnd;
uniform float uTerrainFoliageStrength;`
            )
            .replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `vec4 diffuseColor = vec4( diffuse, opacity );
    vec2 terrainUvA = vTerrainWorldPos.xz * uTerrainDetailScale;
    vec2 terrainUvB = vTerrainWorldPos.xz * (uTerrainDetailScale * 0.28);
    float grassDetail = mix(texture2D(uTerrainGrassDetailTex, terrainUvA).g, texture2D(uTerrainGrassDetailTex, terrainUvB).g, 0.32);
    float rockDetail = mix(texture2D(uTerrainRockDetailTex, terrainUvA).r, texture2D(uTerrainRockDetailTex, terrainUvB).r, 0.4);
    float slope = 1.0 - clamp(abs(dot(normalize(vTerrainWorldNormal), vec3(0.0, 1.0, 0.0))), 0.0, 1.0);
    float slopeMask = smoothstep(uTerrainSlopeStart, uTerrainSlopeEnd, slope);
    float heightMask = smoothstep(uTerrainRockHeightStart, uTerrainRockHeightEnd, vTerrainWorldPos.y);
    float rockMask = max(slopeMask, heightMask);
    float detailLuma = mix(grassDetail, rockDetail, rockMask);
    float detailBoost = mix(0.76, 1.22, detailLuma);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * detailBoost, uTerrainDetailStrength);
    float terrainDist = distance(vTerrainWorldPos, uAtmosCameraPos);
    float nearMid = 1.0 - smoothstep(140.0, 1700.0, terrainDist);
    float macroA = sin(vTerrainWorldPos.x * 0.0022 + vTerrainWorldPos.z * 0.0016);
    float macroB = sin(vTerrainWorldPos.x * 0.0014 - vTerrainWorldPos.z * 0.0020);
    float macro = 0.5 + 0.5 * (macroA * 0.6 + macroB * 0.4);
    float macroShade = mix(0.88, 1.12, macro);
    diffuseColor.rgb *= mix(1.0, macroShade, nearMid * (1.0 - rockMask * 0.35));
    float foliageFade = 1.0 - smoothstep(uTerrainFoliageNearStart, uTerrainFoliageNearEnd, terrainDist);
    float foliageEligible = (1.0 - rockMask) * foliageFade;
    float tuft = smoothstep(0.48, 0.86, grassDetail);
    float foliage = foliageEligible * tuft * uTerrainFoliageStrength;
    float micro = sin(vTerrainWorldPos.x * 0.42 + vTerrainWorldPos.z * 0.35);
    float blade = smoothstep(0.2, 0.95, abs(micro));
    diffuseColor.rgb *= mix(1.0, 0.92 + 0.1 * blade, foliage * 0.55);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb + vec3(0.01, 0.026, 0.008), foliage * 0.45);
    float terrainAtmos = smoothstep(uAtmosNear, uAtmosFar, terrainDist) * uTerrainAtmosStrength;
    diffuseColor.rgb = mix(diffuseColor.rgb, uAtmosColor, terrainAtmos);`
            );
    };
    material.customProgramCacheKey = () => 'terrain-detail-v3';
}
