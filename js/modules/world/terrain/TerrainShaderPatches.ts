// @ts-check

import { ShaderLibrary } from './ShaderLibrary.js';
import {
    prependShaderDefine,
    replaceShaderInclude,
    replaceShaderSnippet
} from '../shaders/ShaderPatchUtils.js';

/**
 * @typedef TreeDepthShaderPatchOptions
 * @property {{ value: import('three').Vector3 | null }} mainCameraPosUniform
 * @property {{ value: import('three').Vector3 | null }} [lightDirUniform]
 * @property {boolean} [cameraFacing]
 * @property {boolean} [lockYAxis]
 * @property {number} [shadowFadeNear]
 * @property {number} [shadowFadeFar]
 */

/**
 * @typedef TreeOctahedralShaderPatchOptions
 * @property {{
 *   directions: import('three').Vector3[],
 *   gridCols: number,
 *   gridRows: number,
 *   atlasTexelSize?: [number, number],
 *   depthStrength?: number,
 *   normalSpace?: 'frame-local' | 'object',
 *   depthRange?: { near?: number, far?: number }
 * }} impostor
 * @property {{
 *   lightDirUniform: { value: import('three').Vector3 | null },
 *   lightColorUniform: { value: import('three').Color | null },
 *   lightIntensityUniform: { value: number },
 *   depthTexture?: import('three').Texture | null
 * }} [lighting]
 * @property {{
 *   modeUniform?: { value: number },
 *   freezeFrameIndexUniform?: { value: number },
 *   disableFrameBlendUniform?: { value: number },
 *   flipNormalXUniform?: { value: number },
 *   flipNormalYUniform?: { value: number },
 *   flipNormalZUniform?: { value: number },
 *   flipFrameDirUniform?: { value: number },
 *   flipLightDirUniform?: { value: number },
 *   flipBasisRightUniform?: { value: number },
 *   flipBasisUpUniform?: { value: number },
 *   disableDepthNormalUniform?: { value: number },
 *   disableAtlasNormalUniform?: { value: number }
 * }} [debug]
 */

/**
 * @typedef DetailedBuildingShaderPatchOptions
 * @property {string} style
 * @property {{ value: import('three').Vector3 | null } | null} [cameraPosUniform]
 * @property {number} [fadeNear]
 * @property {number} [fadeFar]
 */

const DIFFUSE_COLOR_SNIPPET = 'vec4 diffuseColor = vec4( diffuse, opacity );';

export function createDistanceAtmosphereUniformBindings(atmosphereUniforms) {
    return {
        uAtmosCameraPos: atmosphereUniforms.uAtmosCameraPos,
        uAtmosColor: atmosphereUniforms.uAtmosColor,
        uAtmosNear: atmosphereUniforms.uAtmosNear,
        uAtmosFar: atmosphereUniforms.uAtmosFar,
        uSurfaceShadowDistance: atmosphereUniforms.uSurfaceShadowDistance,
        uSurfaceShadowFadeStart: atmosphereUniforms.uSurfaceShadowFadeStart,
        uShadowCoverageCenter: atmosphereUniforms.uShadowCoverageCenter,
        uShadowCoverageExtent: atmosphereUniforms.uShadowCoverageExtent,
        uShadowCoverageFadeStart: atmosphereUniforms.uShadowCoverageFadeStart
    };
}

export function createTerrainDetailUniformBindings(terrainDetailUniforms, atmosphereUniforms, timeUniform) {
    return {
        uTime: timeUniform,
        uTerrainDetailTex: terrainDetailUniforms.uTerrainDetailTex,
        uTerrainGrassTex: terrainDetailUniforms.uTerrainGrassTex,
        uTerrainDetailScale: terrainDetailUniforms.uTerrainDetailScale,
        uTerrainDetailStrength: terrainDetailUniforms.uTerrainDetailStrength,
        uTerrainSlopeStart: terrainDetailUniforms.uTerrainSlopeStart,
        uTerrainSlopeEnd: terrainDetailUniforms.uTerrainSlopeEnd,
        uTerrainRockHeightStart: terrainDetailUniforms.uTerrainRockHeightStart,
        uTerrainRockHeightEnd: terrainDetailUniforms.uTerrainRockHeightEnd,
        uAtmosCameraPos: atmosphereUniforms.uAtmosCameraPos,
        uAtmosColor: atmosphereUniforms.uAtmosColor,
        uAtmosNear: atmosphereUniforms.uAtmosNear,
        uAtmosFar: atmosphereUniforms.uAtmosFar,
        uSurfaceShadowDistance: atmosphereUniforms.uSurfaceShadowDistance,
        uSurfaceShadowFadeStart: atmosphereUniforms.uSurfaceShadowFadeStart,
        uShadowCoverageCenter: atmosphereUniforms.uShadowCoverageCenter,
        uShadowCoverageExtent: atmosphereUniforms.uShadowCoverageExtent,
        uShadowCoverageFadeStart: atmosphereUniforms.uShadowCoverageFadeStart,
        uTerrainAtmosStrength: terrainDetailUniforms.uTerrainAtmosStrength,
        uTerrainGrassTexScale: terrainDetailUniforms.uTerrainGrassTexScale,
        uTerrainGrassTexStrength: terrainDetailUniforms.uTerrainGrassTexStrength,
        uTerrainGrassTexNearStart: terrainDetailUniforms.uTerrainGrassTexNearStart,
        uTerrainGrassTexNearEnd: terrainDetailUniforms.uTerrainGrassTexNearEnd,
        uTerrainGrassShowTexture: terrainDetailUniforms.uTerrainGrassShowTexture,
        uTerrainGrassDebugMask: terrainDetailUniforms.uTerrainGrassDebugMask,
        uTerrainSandColor: terrainDetailUniforms.uTerrainSandColor,
        uTerrainGrassColor: terrainDetailUniforms.uTerrainGrassColor,
        uTerrainRockColor: terrainDetailUniforms.uTerrainRockColor,
        uTerrainSnowColor: terrainDetailUniforms.uTerrainSnowColor
    };
}

export function createWaterSurfaceUniformBindings(atmosphereUniforms, waterSurfaceUniforms) {
    return {
        uAtmosCameraPos: atmosphereUniforms.uAtmosCameraPos,
        uAtmosColor: atmosphereUniforms.uAtmosColor,
        uAtmosNear: atmosphereUniforms.uAtmosNear,
        uAtmosFar: atmosphereUniforms.uAtmosFar,
        uSurfaceShadowDistance: atmosphereUniforms.uSurfaceShadowDistance,
        uSurfaceShadowFadeStart: atmosphereUniforms.uSurfaceShadowFadeStart,
        uShadowCoverageCenter: atmosphereUniforms.uShadowCoverageCenter,
        uShadowCoverageExtent: atmosphereUniforms.uShadowCoverageExtent,
        uShadowCoverageFadeStart: atmosphereUniforms.uShadowCoverageFadeStart,
        uWaterDepthTex: waterSurfaceUniforms.uWaterDepthTex,
        uWaterDepthUvMin: waterSurfaceUniforms.uWaterDepthUvMin,
        uWaterDepthUvMax: waterSurfaceUniforms.uWaterDepthUvMax,
        uWaterBoundsMin: waterSurfaceUniforms.uWaterBoundsMin,
        uWaterBoundsSize: waterSurfaceUniforms.uWaterBoundsSize,
        uWaterDepthScale: waterSurfaceUniforms.uWaterDepthScale,
        uWaterFoamDepth: waterSurfaceUniforms.uWaterFoamDepth,
        uWaterShallowStart: waterSurfaceUniforms.uWaterShallowStart,
        uWaterShallowEnd: waterSurfaceUniforms.uWaterShallowEnd,
        uWaterDeepEnd: waterSurfaceUniforms.uWaterDeepEnd,
        uWaterFoamColor: waterSurfaceUniforms.uWaterFoamColor,
        uWaterShallowColor: waterSurfaceUniforms.uWaterShallowColor,
        uWaterDeepColor: waterSurfaceUniforms.uWaterDeepColor
    };
}

export function createBuildingPopInUniformBindings(cameraPosUniform, fadeNear = 6800, fadeFar = 7800) {
    return {
        uBldgCameraPos: cameraPosUniform,
        uBldgFadeNear: { value: fadeNear },
        uBldgFadeFar: { value: fadeFar }
    };
}

export function createTreeDepthUniformBindings(mainCameraPosUniform, shadowFadeNear = 1200, shadowFadeFar = 1800) {
    return {
        uMainCameraPos: mainCameraPosUniform,
        uTreeShadowFadeNear: { value: shadowFadeNear },
        uTreeShadowFadeFar: { value: shadowFadeFar }
    };
}

export function createTreeOctahedralUniformBindings(impostor) {
    return {
        uTreeImpostorGrid: { value: [impostor.gridCols, impostor.gridRows] },
        uTreeImpostorFrameDirections: { value: impostor.directions },
        uTreeImpostorAtlasTexelSize: { value: impostor.atlasTexelSize || [1 / 1024, 1 / 1024] },
        uTreeImpostorDepthStrength: { value: Number.isFinite(impostor.depthStrength) ? impostor.depthStrength : 6.0 }
    };
}

export function createTreeImpostorLightingUniformBindings(lighting = {}) {
    return {
        uTreeLightDirWorld: lighting.lightDirUniform || { value: null },
        uTreeLightColor: lighting.lightColorUniform || { value: null },
        uTreeLightIntensity: lighting.lightIntensityUniform || { value: 1.0 },
        uTreeImpostorDepthTex: { value: lighting.depthTexture || null }
    };
}

export function createTreeImpostorDebugUniformBindings(debug = {}) {
    return {
        uTreeImpostorDebugMode: debug.modeUniform || { value: 0 },
        uTreeImpostorDebugFreezeFrameIndex: debug.freezeFrameIndexUniform || { value: -1 },
        uTreeImpostorDebugDisableFrameBlend: debug.disableFrameBlendUniform || { value: 0 },
        uTreeImpostorDebugFlipNormalX: debug.flipNormalXUniform || { value: 0 },
        uTreeImpostorDebugFlipNormalY: debug.flipNormalYUniform || { value: 0 },
        uTreeImpostorDebugFlipNormalZ: debug.flipNormalZUniform || { value: 0 },
        uTreeImpostorDebugFlipFrameDir: debug.flipFrameDirUniform || { value: 0 },
        uTreeImpostorDebugFlipLightDir: debug.flipLightDirUniform || { value: 0 },
        uTreeImpostorDebugFlipBasisRight: debug.flipBasisRightUniform || { value: 0 },
        uTreeImpostorDebugFlipBasisUp: debug.flipBasisUpUniform || { value: 0 },
        uTreeImpostorDebugDisableDepthNormal: debug.disableDepthNormalUniform || { value: 0 },
        uTreeImpostorDebugDisableAtlasNormal: debug.disableAtlasNormalUniform || { value: 0 }
    };
}

export function applyDistanceAtmosphereShaderPatch(shader, { atmosphereUniforms, strength = 0.5, desat = 0.0 }) {
    Object.assign(shader.uniforms, createDistanceAtmosphereUniformBindings(atmosphereUniforms));

    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        '#include <common>\nvarying vec3 vAtmosWorldPos;'
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'worldpos_vertex',
        `#include <worldpos_vertex>
    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
#ifdef USE_INSTANCING
worldPos = instanceMatrix * worldPos;
#endif
vAtmosWorldPos = worldPos.xyz; `
    );

    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        '#include <common>\nvarying vec3 vAtmosWorldPos; \nuniform vec3 uAtmosCameraPos; \nuniform vec3 uAtmosColor; \nuniform float uAtmosNear; \nuniform float uAtmosFar; '
    );
    shader.fragmentShader = replaceShaderSnippet(
        shader.fragmentShader,
        DIFFUSE_COLOR_SNIPPET,
        `vec4 diffuseColor = vec4(diffuse, opacity);
float atmosDist = distance(vAtmosWorldPos, uAtmosCameraPos);
float atmosMix = smoothstep(uAtmosNear, uAtmosFar, atmosDist) * ${strength.toFixed(4)};
float atmosLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(atmosLuma), ${desat.toFixed(4)} * atmosMix);
diffuseColor.rgb = mix(diffuseColor.rgb, uAtmosColor, atmosMix); `,
        'distance atmosphere diffuseColor assignment'
    );

    return shader;
}

export function applyWaterSurfaceColorShaderPatch(shader, {
    atmosphereUniforms,
    waterSurfaceUniforms,
    strength = 0.74,
    desat = 0.08,
    shadowContrast = 0.0
}) {
    const supportsLitWater = shader.fragmentShader.includes('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;');
    Object.assign(shader.uniforms, createWaterSurfaceUniformBindings(atmosphereUniforms, waterSurfaceUniforms));

    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        `#include <common>
varying vec3 vWaterWorldPos;
#ifdef USE_INSTANCING
attribute vec2 instanceWaterBoundsMin;
attribute vec2 instanceWaterBoundsSize;
attribute vec2 instanceWaterDepthUvMin;
attribute vec2 instanceWaterDepthUvMax;
varying vec2 vInstanceWaterBoundsMin;
varying vec2 vInstanceWaterBoundsSize;
varying vec2 vInstanceWaterDepthUvMin;
varying vec2 vInstanceWaterDepthUvMax;
#endif`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'worldpos_vertex',
        `#include <worldpos_vertex>
    vec4 waterWorldPos = modelMatrix * vec4(transformed, 1.0);
#ifdef USE_INSTANCING
waterWorldPos = instanceMatrix * waterWorldPos;
vInstanceWaterBoundsMin = instanceWaterBoundsMin;
vInstanceWaterBoundsSize = instanceWaterBoundsSize;
vInstanceWaterDepthUvMin = instanceWaterDepthUvMin;
vInstanceWaterDepthUvMax = instanceWaterDepthUvMax;
#endif
vWaterWorldPos = waterWorldPos.xyz; `
    );

    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        `#include <common>
varying vec3 vWaterWorldPos;
#ifdef USE_INSTANCING
varying vec2 vInstanceWaterBoundsMin;
varying vec2 vInstanceWaterBoundsSize;
varying vec2 vInstanceWaterDepthUvMin;
varying vec2 vInstanceWaterDepthUvMax;
#endif
uniform vec3 uAtmosCameraPos;
uniform vec3 uAtmosColor;
uniform float uAtmosNear;
uniform float uAtmosFar;
uniform float uSurfaceShadowDistance;
uniform float uSurfaceShadowFadeStart;
uniform vec3 uShadowCoverageCenter;
uniform float uShadowCoverageExtent;
uniform float uShadowCoverageFadeStart;
uniform sampler2D uWaterDepthTex;
uniform vec2 uWaterDepthUvMin;
uniform vec2 uWaterDepthUvMax;
uniform vec2 uWaterBoundsMin;
uniform vec2 uWaterBoundsSize;
uniform float uWaterDepthScale;
uniform float uWaterFoamDepth;
uniform float uWaterShallowStart;
uniform float uWaterShallowEnd;
uniform float uWaterDeepEnd;
uniform vec3 uWaterFoamColor;
uniform vec3 uWaterShallowColor;
uniform vec3 uWaterDeepColor;

vec3 resolveWaterColor(float depth) {
    if (depth < uWaterFoamDepth) return uWaterFoamColor;
    if (depth < uWaterShallowStart) {
        float t = smoothstep(uWaterFoamDepth, uWaterShallowStart, depth);
        return mix(uWaterFoamColor, uWaterShallowColor, t);
    }
    if (depth < uWaterShallowEnd) return uWaterShallowColor;
    float t = smoothstep(uWaterShallowEnd, uWaterDeepEnd, depth);
    return mix(uWaterShallowColor, uWaterDeepColor, t);
}

float resolveSurfaceShadowFade(vec2 worldXZ) {
    float receiverShadowDist = distance(worldXZ, uAtmosCameraPos.xz);
    float receiverFadeEnd = max(uSurfaceShadowDistance, uSurfaceShadowFadeStart + 0.0001);
    float receiverFade = 1.0 - smoothstep(uSurfaceShadowFadeStart, receiverFadeEnd, receiverShadowDist);
    vec2 shadowOffset = abs(worldXZ - uShadowCoverageCenter.xz);
    float shadowCoverageDist = max(shadowOffset.x, shadowOffset.y);
    float coverageFadeEnd = max(uShadowCoverageExtent, uShadowCoverageFadeStart + 0.0001);
    float coverageFade = 1.0 - smoothstep(uShadowCoverageFadeStart, coverageFadeEnd, shadowCoverageDist);
    return min(receiverFade, coverageFade);
}`
    );
    shader.fragmentShader = replaceShaderSnippet(
        shader.fragmentShader,
        DIFFUSE_COLOR_SNIPPET,
        `vec2 waterBoundsMin = uWaterBoundsMin;
vec2 waterBoundsSize = uWaterBoundsSize;
vec2 waterDepthUvMin = uWaterDepthUvMin;
vec2 waterDepthUvMax = uWaterDepthUvMax;
#ifdef USE_INSTANCING
waterBoundsMin = vInstanceWaterBoundsMin;
waterBoundsSize = vInstanceWaterBoundsSize;
waterDepthUvMin = vInstanceWaterDepthUvMin;
waterDepthUvMax = vInstanceWaterDepthUvMax;
#endif
vec2 waterUv = clamp((vWaterWorldPos.xz - waterBoundsMin) / max(waterBoundsSize, vec2(0.0001)), 0.0, 1.0);
vec2 waterDepthUv = mix(waterDepthUvMin, waterDepthUvMax, waterUv);
float waterDepth = texture2D(uWaterDepthTex, waterDepthUv).r * uWaterDepthScale;
vec3 waterBaseColor = resolveWaterColor(waterDepth);
vec4 diffuseColor = vec4(waterBaseColor, opacity);
float atmosDist = distance(vWaterWorldPos, uAtmosCameraPos);
float atmosMix = smoothstep(uAtmosNear, uAtmosFar, atmosDist) * ${strength.toFixed(4)};
float atmosLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(atmosLuma), ${desat.toFixed(4)} * atmosMix);
diffuseColor.rgb = mix(diffuseColor.rgb, uAtmosColor, atmosMix);`,
        'water world-space color assignment'
    );

    if (supportsLitWater) {
        shader.fragmentShader = replaceShaderInclude(
            shader.fragmentShader,
            'shadowmap_pars_fragment',
            `#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>`
        );
        shader.fragmentShader = replaceShaderSnippet(
            shader.fragmentShader,
            'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
            `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
float waterShadowFade = resolveSurfaceShadowFade(vWaterWorldPos.xz);
float waterShadowVisibility = mix(1.0, getShadowMask(), ${shadowContrast.toFixed(4)} * waterShadowFade);
outgoingLight *= waterShadowVisibility;`,
            'water shadow contrast adjustment'
        );
    }

    return shader;
}

export function applyWaterStaticPatternShaderPatch(shader, {
    normalStrength = 1.5,
    patternEnabled = true
} = {}) {
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        `#include <common>
float waterHash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float waterValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = waterHash12(i);
    float b = waterHash12(i + vec2(1.0, 0.0));
    float c = waterHash12(i + vec2(0.0, 1.0));
    float d = waterHash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float waterProceduralHeight(vec2 worldXZ) {
    vec2 uvA = worldXZ * 0.0230;
    vec2 uvB = worldXZ * 0.0570 + vec2(17.3, -9.1);
    vec2 uvC = worldXZ * 0.1150 + vec2(-4.7, 12.9);
    float broad = waterValueNoise(uvA);
    float mid = waterValueNoise(uvB);
    float fine = waterValueNoise(uvC);
    return broad * 0.55 + mid * 0.3 + fine * 0.15;
}`
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'normal_fragment_maps',
        `
{
    float waterPatternStrength = ${patternEnabled ? normalStrength.toFixed(4) : '0.0000'};
    if (waterPatternStrength > 0.0001) {
        float waterNormalStep = 0.6;
        float hL = waterProceduralHeight(vWaterWorldPos.xz - vec2(waterNormalStep, 0.0));
        float hR = waterProceduralHeight(vWaterWorldPos.xz + vec2(waterNormalStep, 0.0));
        float hD = waterProceduralHeight(vWaterWorldPos.xz - vec2(0.0, waterNormalStep));
        float hU = waterProceduralHeight(vWaterWorldPos.xz + vec2(0.0, waterNormalStep));
        vec3 baseNormal = normalize(vec3((hL - hR) * waterPatternStrength, (hD - hU) * waterPatternStrength, 1.0));

        // Compute TBN matrix from derivatives
    vec3 q0_ds = dFdx(- vViewPosition.xyz);
    vec3 q1_ds = dFdy(- vViewPosition.xyz);
    vec2 st0_ds = dFdx(vWaterWorldPos.xz);
    vec2 st1_ds = dFdy(vWaterWorldPos.xz);
    
    vec3 N_ds = normalize(normal);
    vec3 q1perp_ds = cross(q1_ds, N_ds);
    vec3 q0perp_ds = cross(N_ds, q0_ds);
    
    vec3 T_ds = q1perp_ds * st0_ds.x + q0perp_ds * st1_ds.x;
    vec3 B_ds = q1perp_ds * st0_ds.y + q0perp_ds * st1_ds.y;
    
    float det_ds = max(dot(T_ds, T_ds), dot(B_ds, B_ds));
    float scale_ds = (det_ds == 0.0) ? 0.0 : inversesqrt(det_ds);
    
    vec3 T_n_ds = T_ds * scale_ds;
    vec3 B_n_ds = B_ds * scale_ds;
    mat3 tbn_ds = mat3(T_n_ds, B_n_ds, N_ds);

        normal = normalize(tbn_ds * baseNormal);
    } else {
        #include <normal_fragment_maps>
    }
}`
    );

    return shader;
}

export function applyBuildingPopInShaderPatch(shader, { cameraPosUniform, fadeNear = 6800, fadeFar = 7800 }) {
    Object.assign(shader.uniforms, createBuildingPopInUniformBindings(cameraPosUniform, fadeNear, fadeFar));

    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        `#include <common>
    uniform vec3 uBldgCameraPos;
uniform float uBldgFadeNear;
uniform float uBldgFadeFar;`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'begin_vertex',
        `#include <begin_vertex>
    #ifdef USE_INSTANCING
    // World position of this instance's origin
    vec3 bldgInstancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float bldgDist = distance((modelMatrix * vec4(bldgInstancePos, 1.0)).xyz, uBldgCameraPos);
    // Scale: 1 at fadeNear, 0 at fadeFar -> smoothly grow in
    float bldgPopInScale = 1.0 - smoothstep(uBldgFadeNear, uBldgFadeFar, bldgDist);
transformed *= bldgPopInScale;
#endif`
    );

    return shader;
}

export function applyTreeBillboardShaderPatch(shader, { cameraFacing = true, lockYAxis = true } = {}) {
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        '#include <common>\nvarying vec2 vTreeUv;'
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'begin_vertex',
        '#include <begin_vertex>\nvTreeUv = uv;'
    );

    if (cameraFacing) {
        shader.vertexShader = replaceShaderInclude(
            shader.vertexShader,
            'beginnormal_vertex',
            `
#include <beginnormal_vertex>
    #ifdef USE_INSTANCING
    vec3 cameraDirN = cameraPosition - (modelMatrix * vec4(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2], 1.0)).xyz;
${lockYAxis ? 'cameraDirN.y = 0.0;' : ''}
cameraDirN = normalize(cameraDirN);
if (length(cameraDirN) > 0.0) {
        vec3 upRefN = abs(cameraDirN.y) > 0.98 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
        vec3 rightN = normalize(cross(upRefN, cameraDirN));
        vec3 upN = normalize(cross(cameraDirN, rightN));
        mat3 alignMatN = ${lockYAxis ? `mat3(
    rightN.x, 0.0, rightN.z,
    0.0, 1.0, 0.0,
    cameraDirN.x, 0.0, cameraDirN.z
)` : `mat3(
    rightN.x, rightN.y, rightN.z,
    upN.x, upN.y, upN.z,
    cameraDirN.x, cameraDirN.y, cameraDirN.z
)`};
    objectNormal = alignMatN * objectNormal;
}
#endif
    `
        );
        shader.vertexShader = replaceShaderInclude(
            shader.vertexShader,
            'project_vertex',
            `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
    vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    vec2 instanceScale = vec2(length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2])),
    length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2])));

    vec3 cameraDir = cameraPosition - (modelMatrix * vec4(instancePos, 1.0)).xyz;
${lockYAxis ? 'cameraDir.y = 0.0;' : ''}
cameraDir = normalize(cameraDir);

if (length(cameraDir) > 0.0) {
        vec3 upRef = abs(cameraDir.y) > 0.98 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
        vec3 right = normalize(cross(upRef, cameraDir));
        vec3 up = normalize(cross(cameraDir, right));
        mat3 alignMat = ${lockYAxis ? `mat3(
    right.x, 0.0, right.z,
    0.0, 1.0, 0.0,
    cameraDir.x, 0.0, cameraDir.z
)` : `mat3(
    right.x, right.y, right.z,
    up.x, up.y, up.z,
    cameraDir.x, cameraDir.y, cameraDir.z
)`};
    mvPosition.xyz = alignMat * (mvPosition.xyz * vec3(instanceScale.x, instanceScale.y, 1.0)) + instancePos;
} else {
    mvPosition = instanceMatrix * mvPosition;
}
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`
        );
    }

    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        '#include <common>\nvarying vec2 vTreeUv;'
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'color_fragment',
        `#include <color_fragment>
float treeVerticalShade = mix(0.82, 1.08, smoothstep(0.06, 0.88, vTreeUv.y));
float treeCenterShade = 1.0 - smoothstep(0.0, 0.46, distance(vTreeUv, vec2(0.5, 0.42))) * 0.18;
float treeCanopyMask = smoothstep(0.1, 0.58, vTreeUv.y);
float treeInteriorShade = mix(1.0, treeCenterShade, treeCanopyMask);
diffuseColor.rgb *= treeVerticalShade * treeInteriorShade;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 1.07, 0.98), treeCanopyMask * 0.22);`
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'roughnessmap_fragment',
        `#include <roughnessmap_fragment>
float treeCanopyRoughness = smoothstep(0.08, 0.52, vTreeUv.y);
roughnessFactor = mix(roughnessFactor * 0.82, min(1.0, roughnessFactor * 1.08), treeCanopyRoughness);`
    );

    return shader;
}

function buildOctahedralFrameSelectionShader(impostor) {
    const frameCount = Math.max(1, impostor?.directions?.length || 1);
    const gridCols = Math.max(1, impostor?.gridCols || 1);
    const gridRows = Math.max(1, impostor?.gridRows || 1);
    return `
uniform vec2 uTreeImpostorGrid;
uniform vec3 uTreeImpostorFrameDirections[${frameCount}];
uniform float uTreeImpostorDebugFreezeFrameIndex;
uniform float uTreeImpostorDebugDisableFrameBlend;
varying vec2 vTreeUv;
varying vec4 vTreeImpostorIndices;
varying vec4 vTreeImpostorWeights;
varying float vTreeImpostorBlend;
varying vec3 vTreeImpostorDirA;
varying vec3 vTreeImpostorDirB;
varying vec3 vTreeImpostorDirC;
varying vec3 vTreeImpostorDirD;

vec2 fsimEncodeTreeOctahedralDirection(vec3 direction) {
    vec3 view = normalize(direction);
    float denom = max(0.0001, abs(view.x) + abs(view.y) + abs(view.z));
    vec2 encoded = vec2(view.x, view.z) / denom;
    if (view.y < 0.0) {
        vec2 folded = vec2(
            (1.0 - abs(encoded.y)) * sign(encoded.x == 0.0 ? 1.0 : encoded.x),
            (1.0 - abs(encoded.x)) * sign(encoded.y == 0.0 ? 1.0 : encoded.y)
        );
        encoded = folded;
    }
    return encoded * 0.5 + 0.5;
}

void fsimSelectTreeImpostorFrames(vec3 localViewDir) {
    vec2 encoded = fsimEncodeTreeOctahedralDirection(localViewDir);
    vec2 sampleCoord = clamp(
        encoded * vec2(${gridCols}.0, ${gridRows}.0) - vec2(0.5),
        vec2(0.0),
        vec2(${Math.max(0, gridCols - 1)}.0, ${Math.max(0, gridRows - 1)}.0)
    );
    float x0f = floor(sampleCoord.x);
    float y0f = floor(sampleCoord.y);
    float x1f = min(${Math.max(0, gridCols - 1)}.0, x0f + 1.0);
    float y1f = min(${Math.max(0, gridRows - 1)}.0, y0f + 1.0);
    float tx = sampleCoord.x - x0f;
    float ty = sampleCoord.y - y0f;
    vec4 weights = vec4(
        (1.0 - tx) * (1.0 - ty),
        tx * (1.0 - ty),
        (1.0 - tx) * ty,
        tx * ty
    );
    vec4 indices = vec4(
        y0f * ${gridCols}.0 + x0f,
        y0f * ${gridCols}.0 + x1f,
        y1f * ${gridCols}.0 + x0f,
        y1f * ${gridCols}.0 + x1f
    );

    if (uTreeImpostorDebugFreezeFrameIndex >= 0.0) {
        float frozenIndex = clamp(floor(uTreeImpostorDebugFreezeFrameIndex + 0.5), 0.0, ${Math.max(0, frameCount - 1)}.0);
        indices = vec4(frozenIndex);
        weights = vec4(1.0, 0.0, 0.0, 0.0);
    }
    if (uTreeImpostorDebugDisableFrameBlend > 0.5 && uTreeImpostorDebugFreezeFrameIndex < 0.0) {
        float bestWeight = weights.x;
        float bestIndex = indices.x;
        if (weights.y > bestWeight) { bestWeight = weights.y; bestIndex = indices.y; }
        if (weights.z > bestWeight) { bestWeight = weights.z; bestIndex = indices.z; }
        if (weights.w > bestWeight) { bestWeight = weights.w; bestIndex = indices.w; }
        indices = vec4(bestIndex);
        weights = vec4(1.0, 0.0, 0.0, 0.0);
    }

    int primaryIndex = int(indices.x + 0.5);
    float primaryWeight = weights.x;
    if (weights.y > primaryWeight) { primaryWeight = weights.y; primaryIndex = int(indices.y + 0.5); }
    if (weights.z > primaryWeight) { primaryWeight = weights.z; primaryIndex = int(indices.z + 0.5); }
    if (weights.w > primaryWeight) { primaryWeight = weights.w; primaryIndex = int(indices.w + 0.5); }

    int secondaryIndex = primaryIndex;
    float secondaryWeight = 0.0;
    if (int(indices.x + 0.5) != primaryIndex && weights.x > secondaryWeight) { secondaryWeight = weights.x; secondaryIndex = int(indices.x + 0.5); }
    if (int(indices.y + 0.5) != primaryIndex && weights.y > secondaryWeight) { secondaryWeight = weights.y; secondaryIndex = int(indices.y + 0.5); }
    if (int(indices.z + 0.5) != primaryIndex && weights.z > secondaryWeight) { secondaryWeight = weights.z; secondaryIndex = int(indices.z + 0.5); }
    if (int(indices.w + 0.5) != primaryIndex && weights.w > secondaryWeight) { secondaryWeight = weights.w; secondaryIndex = int(indices.w + 0.5); }

    vTreeImpostorIndices = indices;
    vTreeImpostorWeights = weights;
    vTreeImpostorBlend = secondaryIndex == primaryIndex
        ? 0.0
        : clamp(secondaryWeight / max(0.0001, primaryWeight + secondaryWeight), 0.0, 1.0);
    vTreeImpostorDirA = normalize(uTreeImpostorFrameDirections[primaryIndex]);
    vTreeImpostorDirB = normalize(uTreeImpostorFrameDirections[secondaryIndex]);
    vTreeImpostorDirC = normalize(uTreeImpostorFrameDirections[int(indices.z + 0.5)]);
    vTreeImpostorDirD = normalize(uTreeImpostorFrameDirections[int(indices.w + 0.5)]);
}
`;
}

export function applyTreeOctahedralShaderPatch(shader, {
    impostor,
    lighting,
    debug
} = /** @type {TreeOctahedralShaderPatchOptions} */ ({
    impostor: { directions: [], gridCols: 1, gridRows: 1 },
    lighting: undefined,
    debug: undefined
})) {
    Object.assign(shader.uniforms, createTreeOctahedralUniformBindings(impostor));
    Object.assign(shader.uniforms, createTreeImpostorLightingUniformBindings(lighting));
    Object.assign(shader.uniforms, createTreeImpostorDebugUniformBindings(debug));

    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        `#include <common>
varying vec3 vTreeInstanceXAxis;
varying vec3 vTreeInstanceYAxis;
varying vec3 vTreeInstanceZAxis;
${buildOctahedralFrameSelectionShader(impostor)}`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'begin_vertex',
        `#include <begin_vertex>
vTreeUv = uv;`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'beginnormal_vertex',
        `#include <beginnormal_vertex>
#ifdef USE_INSTANCING
vec3 fsimTreeInstanceXAxis = normalize(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
vec3 fsimTreeInstanceYAxis = normalize(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
vec3 fsimTreeInstanceZAxis = normalize(vec3(instanceMatrix[2][0], instanceMatrix[2][1], instanceMatrix[2][2]));
vTreeInstanceXAxis = fsimTreeInstanceXAxis;
vTreeInstanceYAxis = fsimTreeInstanceYAxis;
vTreeInstanceZAxis = fsimTreeInstanceZAxis;
vec3 fsimTreeInstancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
vec3 fsimTreeCameraDirWorld = normalize(cameraPosition - (modelMatrix * vec4(fsimTreeInstancePos, 1.0)).xyz);
vec3 fsimTreeCameraDirLocal = normalize(vec3(
    dot(fsimTreeCameraDirWorld, fsimTreeInstanceXAxis),
    dot(fsimTreeCameraDirWorld, fsimTreeInstanceYAxis),
    dot(fsimTreeCameraDirWorld, fsimTreeInstanceZAxis)
));
fsimSelectTreeImpostorFrames(fsimTreeCameraDirLocal);
objectNormal = normalize(fsimTreeCameraDirWorld);
#endif`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'project_vertex',
        `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
    vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    vec2 instanceScale = vec2(length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2])),
    length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2])));
    vec3 cameraDir = normalize(cameraPosition - (modelMatrix * vec4(instancePos, 1.0)).xyz);
    vec3 upRef = abs(cameraDir.y) > 0.98 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(upRef, cameraDir));
    vec3 up = normalize(cross(cameraDir, right));
    mvPosition.xyz = mat3(
        right.x, right.y, right.z,
        up.x, up.y, up.z,
        cameraDir.x, cameraDir.y, cameraDir.z
    ) * (mvPosition.xyz * vec3(instanceScale.x, instanceScale.y, 1.0)) + instancePos;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`
    );

    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        `#include <common>
varying vec2 vTreeUv;
varying vec4 vTreeImpostorIndices;
varying vec4 vTreeImpostorWeights;
varying float vTreeImpostorBlend;
varying vec3 vTreeImpostorDirA;
varying vec3 vTreeImpostorDirB;
varying vec3 vTreeImpostorDirC;
varying vec3 vTreeImpostorDirD;
varying vec3 vTreeInstanceXAxis;
varying vec3 vTreeInstanceYAxis;
varying vec3 vTreeInstanceZAxis;
uniform vec2 uTreeImpostorGrid;
uniform sampler2D uTreeImpostorDepthTex;
uniform vec2 uTreeImpostorAtlasTexelSize;
uniform float uTreeImpostorDepthStrength;
uniform vec3 uTreeLightDirWorld;
uniform vec3 uTreeLightColor;
uniform float uTreeLightIntensity;
uniform float uTreeImpostorDebugMode;
uniform float uTreeImpostorDebugFlipNormalX;
uniform float uTreeImpostorDebugFlipNormalY;
uniform float uTreeImpostorDebugFlipNormalZ;
uniform float uTreeImpostorDebugFlipFrameDir;
uniform float uTreeImpostorDebugFlipLightDir;
uniform float uTreeImpostorDebugFlipBasisRight;
uniform float uTreeImpostorDebugFlipBasisUp;
uniform float uTreeImpostorDebugDisableDepthNormal;
uniform float uTreeImpostorDebugDisableAtlasNormal;

vec4 fsimTreeDebugSampledDiffuseColor = vec4(1.0);
vec3 fsimTreeDebugRawNormalColor = vec3(0.5, 0.5, 1.0);
float fsimTreeDebugDepth = 0.0;
vec3 fsimTreeDebugFrameDirA = vec3(0.0, 0.0, 1.0);
vec3 fsimTreeDebugFrameDirB = vec3(0.0, 0.0, 1.0);
float fsimTreeDebugBlend = 0.0;
vec3 fsimTreeDebugLocalNormal = vec3(0.0, 0.0, 1.0);
vec3 fsimTreeDebugWorldNormal = vec3(0.0, 0.0, 1.0);
vec3 fsimTreeDebugViewNormal = vec3(0.0, 0.0, 1.0);
vec3 fsimTreeDebugLightDirView = vec3(0.0, 0.0, 1.0);
float fsimTreeDebugNdotL = 0.0;
float fsimTreeDebugBacklight = 0.0;

vec2 fsimResolveImpostorUvByIndex(vec2 baseUv, float frameIndexFloat) {
    float cols = max(1.0, uTreeImpostorGrid.x);
    float rows = max(1.0, uTreeImpostorGrid.y);
    float col = mod(frameIndexFloat, cols);
    float row = floor(frameIndexFloat / cols);
    vec2 tileScale = vec2(1.0 / cols, 1.0 / rows);
    return vec2(col, row) * tileScale + (baseUv * tileScale);
}

mat3 fsimBuildImpostorLocalBasis(vec3 forwardLocal) {
    vec3 upRef = abs(forwardLocal.y) > 0.98 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(upRef, forwardLocal));
    vec3 up = normalize(cross(forwardLocal, right));
    if (uTreeImpostorDebugFlipBasisRight > 0.5) {
        right *= -1.0;
    }
    if (uTreeImpostorDebugFlipBasisUp > 0.5) {
        up *= -1.0;
    }
    return mat3(right, up, forwardLocal);
}

float fsimSampleImpostorDepth(float frameIndexFloat, vec2 baseUv) {
    return texture2D(uTreeImpostorDepthTex, fsimResolveImpostorUvByIndex(baseUv, frameIndexFloat)).r;
}

vec3 fsimDecodeDepthNormal(float frameIndexFloat, vec2 baseUv) {
    vec2 atlasUv = fsimResolveImpostorUvByIndex(baseUv, frameIndexFloat);
    float depthL = texture2D(uTreeImpostorDepthTex, atlasUv - vec2(uTreeImpostorAtlasTexelSize.x, 0.0)).r;
    float depthR = texture2D(uTreeImpostorDepthTex, atlasUv + vec2(uTreeImpostorAtlasTexelSize.x, 0.0)).r;
    float depthD = texture2D(uTreeImpostorDepthTex, atlasUv - vec2(0.0, uTreeImpostorAtlasTexelSize.y)).r;
    float depthU = texture2D(uTreeImpostorDepthTex, atlasUv + vec2(0.0, uTreeImpostorAtlasTexelSize.y)).r;
    return normalize(vec3((depthL - depthR) * uTreeImpostorDepthStrength, (depthD - depthU) * uTreeImpostorDepthStrength, 1.0));
}`
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'map_fragment',
        `#ifdef USE_MAP
    vec4 treeSampleA = texture2D(map, fsimResolveImpostorUvByIndex(vTreeUv, vTreeImpostorIndices.x));
    vec4 treeSampleB = texture2D(map, fsimResolveImpostorUvByIndex(vTreeUv, vTreeImpostorIndices.y));
    vec4 treeSampleC = texture2D(map, fsimResolveImpostorUvByIndex(vTreeUv, vTreeImpostorIndices.z));
    vec4 treeSampleD = texture2D(map, fsimResolveImpostorUvByIndex(vTreeUv, vTreeImpostorIndices.w));
    vec4 sampledDiffuseColor =
        treeSampleA * vTreeImpostorWeights.x +
        treeSampleB * vTreeImpostorWeights.y +
        treeSampleC * vTreeImpostorWeights.z +
        treeSampleD * vTreeImpostorWeights.w;
    fsimTreeDebugSampledDiffuseColor = sampledDiffuseColor;
    diffuseColor *= sampledDiffuseColor;
#endif`
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'normal_fragment_maps',
        `#ifdef USE_NORMALMAP
    vec3 treeNormalColorA = texture2D(normalMap, fsimResolveImpostorUvByIndex(vTreeUv, vTreeImpostorIndices.x)).xyz;
    vec3 treeNormalColorB = texture2D(normalMap, fsimResolveImpostorUvByIndex(vTreeUv, vTreeImpostorIndices.y)).xyz;
    vec3 treeNormalColorC = texture2D(normalMap, fsimResolveImpostorUvByIndex(vTreeUv, vTreeImpostorIndices.z)).xyz;
    vec3 treeNormalColorD = texture2D(normalMap, fsimResolveImpostorUvByIndex(vTreeUv, vTreeImpostorIndices.w)).xyz;
    fsimTreeDebugRawNormalColor =
        treeNormalColorA * vTreeImpostorWeights.x +
        treeNormalColorB * vTreeImpostorWeights.y +
        treeNormalColorC * vTreeImpostorWeights.z +
        treeNormalColorD * vTreeImpostorWeights.w;
    vec3 treeNormalA = treeNormalColorA * 2.0 - 1.0;
    vec3 treeNormalB = treeNormalColorB * 2.0 - 1.0;
    vec3 treeNormalC = treeNormalColorC * 2.0 - 1.0;
    vec3 treeNormalD = treeNormalColorD * 2.0 - 1.0;
    vec3 treeNormalFlip = vec3(
        uTreeImpostorDebugFlipNormalX > 0.5 ? -1.0 : 1.0,
        uTreeImpostorDebugFlipNormalY > 0.5 ? -1.0 : 1.0,
        uTreeImpostorDebugFlipNormalZ > 0.5 ? -1.0 : 1.0
    );
    treeNormalA *= treeNormalFlip;
    treeNormalB *= treeNormalFlip;
    treeNormalC *= treeNormalFlip;
    treeNormalD *= treeNormalFlip;
    vec3 depthNormalA = fsimDecodeDepthNormal(vTreeImpostorIndices.x, vTreeUv);
    vec3 depthNormalB = fsimDecodeDepthNormal(vTreeImpostorIndices.y, vTreeUv);
    vec3 depthNormalC = fsimDecodeDepthNormal(vTreeImpostorIndices.z, vTreeUv);
    vec3 depthNormalD = fsimDecodeDepthNormal(vTreeImpostorIndices.w, vTreeUv);
    vec3 frameNormalA = normalize(mix(treeNormalA, depthNormalA, 0.18));
    vec3 frameNormalB = normalize(mix(treeNormalB, depthNormalB, 0.18));
    vec3 frameNormalC = normalize(mix(treeNormalC, depthNormalC, 0.18));
    vec3 frameNormalD = normalize(mix(treeNormalD, depthNormalD, 0.18));
    if (uTreeImpostorDebugDisableDepthNormal > 0.5 && uTreeImpostorDebugDisableAtlasNormal <= 0.5) {
        frameNormalA = normalize(treeNormalA);
        frameNormalB = normalize(treeNormalB);
        frameNormalC = normalize(treeNormalC);
        frameNormalD = normalize(treeNormalD);
    } else if (uTreeImpostorDebugDisableAtlasNormal > 0.5 && uTreeImpostorDebugDisableDepthNormal <= 0.5) {
        frameNormalA = normalize(depthNormalA);
        frameNormalB = normalize(depthNormalB);
        frameNormalC = normalize(depthNormalC);
        frameNormalD = normalize(depthNormalD);
    }
    vec3 frameDirA = normalize(vTreeImpostorDirA) * (uTreeImpostorDebugFlipFrameDir > 0.5 ? -1.0 : 1.0);
    vec3 frameDirB = normalize(vTreeImpostorDirB) * (uTreeImpostorDebugFlipFrameDir > 0.5 ? -1.0 : 1.0);
    fsimTreeDebugFrameDirA = frameDirA;
    fsimTreeDebugFrameDirB = frameDirB;
    fsimTreeDebugBlend = vTreeImpostorBlend;
    fsimTreeDebugDepth =
        fsimSampleImpostorDepth(vTreeImpostorIndices.x, vTreeUv) * vTreeImpostorWeights.x +
        fsimSampleImpostorDepth(vTreeImpostorIndices.y, vTreeUv) * vTreeImpostorWeights.y +
        fsimSampleImpostorDepth(vTreeImpostorIndices.z, vTreeUv) * vTreeImpostorWeights.z +
        fsimSampleImpostorDepth(vTreeImpostorIndices.w, vTreeUv) * vTreeImpostorWeights.w;
    vec3 localNormalA = ${impostor?.normalSpace === 'object'
        ? 'normalize(frameNormalA)'
        : 'normalize(fsimBuildImpostorLocalBasis(frameDirA) * frameNormalA)'};
    vec3 localNormalB = ${impostor?.normalSpace === 'object'
        ? 'normalize(frameNormalB)'
        : 'normalize(fsimBuildImpostorLocalBasis(frameDirB) * frameNormalB)'};
    vec3 frameDirC = normalize(vTreeImpostorDirC) * (uTreeImpostorDebugFlipFrameDir > 0.5 ? -1.0 : 1.0);
    vec3 frameDirD = normalize(vTreeImpostorDirD) * (uTreeImpostorDebugFlipFrameDir > 0.5 ? -1.0 : 1.0);
    vec3 localNormalC = ${impostor?.normalSpace === 'object'
        ? 'normalize(frameNormalC)'
        : 'normalize(fsimBuildImpostorLocalBasis(frameDirC) * frameNormalC)'};
    vec3 localNormalD = ${impostor?.normalSpace === 'object'
        ? 'normalize(frameNormalD)'
        : 'normalize(fsimBuildImpostorLocalBasis(frameDirD) * frameNormalD)'};
    vec3 localNormal = normalize(
        localNormalA * vTreeImpostorWeights.x +
        localNormalB * vTreeImpostorWeights.y +
        localNormalC * vTreeImpostorWeights.z +
        localNormalD * vTreeImpostorWeights.w
    );
    fsimTreeDebugLocalNormal = localNormal;
    vec3 worldNormal = normalize(
        vTreeInstanceXAxis * localNormal.x +
        vTreeInstanceYAxis * localNormal.y +
        vTreeInstanceZAxis * localNormal.z
    );
    fsimTreeDebugWorldNormal = worldNormal;
    normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
    fsimTreeDebugViewNormal = normal;
#else
    #include <normal_fragment_maps>
#endif`
    );
    shader.fragmentShader = replaceShaderSnippet(
        shader.fragmentShader,
        'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
        `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
vec3 treeLightDirWorld = uTreeLightDirWorld * (uTreeImpostorDebugFlipLightDir > 0.5 ? -1.0 : 1.0);
vec3 treeLightDir = normalize(mat3(viewMatrix) * treeLightDirWorld);
fsimTreeDebugLightDirView = treeLightDir;
float treeLightFacing = max(dot(normal, treeLightDir), 0.0);
float treeBackLight = max(dot(normal, -treeLightDir), 0.0);
fsimTreeDebugNdotL = treeLightFacing;
fsimTreeDebugBacklight = treeBackLight;
float treeDepthA = fsimSampleImpostorDepth(vTreeImpostorIndices.x, vTreeUv);
float treeDepthB = fsimSampleImpostorDepth(vTreeImpostorIndices.y, vTreeUv);
float treeDepthC = fsimSampleImpostorDepth(vTreeImpostorIndices.z, vTreeUv);
float treeDepthD = fsimSampleImpostorDepth(vTreeImpostorIndices.w, vTreeUv);
float treeDepth =
    treeDepthA * vTreeImpostorWeights.x +
    treeDepthB * vTreeImpostorWeights.y +
    treeDepthC * vTreeImpostorWeights.z +
    treeDepthD * vTreeImpostorWeights.w;
float treeThickness = smoothstep(0.08, 0.92, treeDepth);
float treeSelfOcclusion = mix(1.0, 0.78, treeDepth);
float treeWrap = smoothstep(-0.35, 0.85, dot(normal, treeLightDir));
outgoingLight *= mix(treeSelfOcclusion, 1.0, treeWrap);
vec3 treeTransmissionColor = diffuseColor.rgb * mix(vec3(0.78, 1.0, 0.78), vec3(1.0, 0.95, 0.82), 0.28);
float treeTransmission = treeBackLight * treeThickness * (0.12 + 0.16 * uTreeLightIntensity);
outgoingLight += treeTransmissionColor * uTreeLightColor * treeTransmission;
outgoingLight = mix(outgoingLight, outgoingLight * 1.04, treeLightFacing * 0.08);
if (uTreeImpostorDebugMode > 0.5) {
    vec3 debugColor = outgoingLight;
    if (abs(uTreeImpostorDebugMode - 1.0) < 0.5) {
        debugColor = fsimTreeDebugSampledDiffuseColor.rgb;
    } else if (abs(uTreeImpostorDebugMode - 2.0) < 0.5) {
        debugColor = fsimTreeDebugRawNormalColor;
    } else if (abs(uTreeImpostorDebugMode - 3.0) < 0.5) {
        debugColor = vec3(fsimTreeDebugDepth);
    } else if (abs(uTreeImpostorDebugMode - 4.0) < 0.5) {
        debugColor = fsimTreeDebugFrameDirA * 0.5 + 0.5;
    } else if (abs(uTreeImpostorDebugMode - 5.0) < 0.5) {
        debugColor = fsimTreeDebugFrameDirB * 0.5 + 0.5;
    } else if (abs(uTreeImpostorDebugMode - 6.0) < 0.5) {
        debugColor = vec3(fsimTreeDebugBlend);
    } else if (abs(uTreeImpostorDebugMode - 7.0) < 0.5) {
        debugColor = fsimTreeDebugLocalNormal * 0.5 + 0.5;
    } else if (abs(uTreeImpostorDebugMode - 8.0) < 0.5) {
        debugColor = fsimTreeDebugWorldNormal * 0.5 + 0.5;
    } else if (abs(uTreeImpostorDebugMode - 9.0) < 0.5) {
        debugColor = fsimTreeDebugViewNormal * 0.5 + 0.5;
    } else if (abs(uTreeImpostorDebugMode - 10.0) < 0.5) {
        debugColor = fsimTreeDebugLightDirView * 0.5 + 0.5;
    } else if (abs(uTreeImpostorDebugMode - 11.0) < 0.5) {
        debugColor = vec3(fsimTreeDebugNdotL);
    } else if (abs(uTreeImpostorDebugMode - 12.0) < 0.5) {
        debugColor = vec3(fsimTreeDebugBacklight);
    }
    outgoingLight = debugColor;
}`,
        'tree impostor transmission and occlusion'
    );

    return shader;
}

export function applyTreeOctahedralDepthShaderPatch(shader, {
    mainCameraPosUniform,
    lightDirUniform,
    depthTexture,
    impostor,
    shadowFadeNear = 1200,
    shadowFadeFar = 1800
} = /** @type {TreeDepthShaderPatchOptions & TreeOctahedralShaderPatchOptions} */ ({
    mainCameraPosUniform: { value: null },
    lightDirUniform: { value: null },
    depthTexture: null,
    impostor: { directions: [], gridCols: 1, gridRows: 1 }
})) {
    shader.defines = shader.defines || {};
    shader.defines.DEPTH_PACKING = 3201;
    Object.assign(shader.uniforms, createTreeDepthUniformBindings(mainCameraPosUniform, shadowFadeNear, shadowFadeFar));
    Object.assign(shader.uniforms, createTreeOctahedralUniformBindings(impostor));
    Object.assign(shader.uniforms, createTreeImpostorDebugUniformBindings());
    shader.uniforms.uTreeLightDirWorld = lightDirUniform || { value: null };
    shader.uniforms.uTreeImpostorDepthTex = { value: depthTexture || null };

    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        `#include <common>
uniform vec3 uMainCameraPos;
uniform vec3 uTreeLightDirWorld;
uniform float uTreeShadowFadeNear;
uniform float uTreeShadowFadeFar;
${buildOctahedralFrameSelectionShader(impostor)}`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'begin_vertex',
        `#include <begin_vertex>
vTreeUv = uv;`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'project_vertex',
        `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
    vec3 instanceXAxis = normalize(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
    vec3 instanceYAxis = normalize(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
    vec3 instanceZAxis = normalize(vec3(instanceMatrix[2][0], instanceMatrix[2][1], instanceMatrix[2][2]));
    vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    vec2 instanceScale = vec2(length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2])),
    length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2])));
    vec3 cameraDirWorld = uMainCameraPos - (modelMatrix * vec4(instancePos, 1.0)).xyz;
    float distToCamera = length(cameraDirWorld);
    float shadowScale = 1.0 - smoothstep(uTreeShadowFadeNear, uTreeShadowFadeFar, distToCamera);
    vec3 lightDir = normalize(uTreeLightDirWorld);
    vec3 localViewDir = normalize(vec3(
        dot(lightDir, instanceXAxis),
        dot(lightDir, instanceYAxis),
        dot(lightDir, instanceZAxis)
    ));
    fsimSelectTreeImpostorFrames(localViewDir);
    vec3 upRef = abs(lightDir.y) > 0.98 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(upRef, lightDir));
    vec3 up = normalize(cross(lightDir, right));
    mvPosition.xyz = mat3(
        right.x, right.y, right.z,
        up.x, up.y, up.z,
        lightDir.x, lightDir.y, lightDir.z
    ) * (mvPosition.xyz * vec3(instanceScale.x * shadowScale, instanceScale.y * shadowScale, 1.0)) + instancePos;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        `#include <common>
varying vec2 vTreeUv;
varying vec4 vTreeImpostorIndices;
varying vec4 vTreeImpostorWeights;
varying float vTreeImpostorBlend;
uniform vec2 uTreeImpostorGrid;
uniform sampler2D uTreeImpostorDepthTex;

vec2 fsimResolveImpostorUv(vec2 baseUv, float frameIndexFloat) {
    float cols = max(1.0, uTreeImpostorGrid.x);
    float rows = max(1.0, uTreeImpostorGrid.y);
    float col = mod(frameIndexFloat, cols);
    float row = floor(frameIndexFloat / cols);
    vec2 tileScale = vec2(1.0 / cols, 1.0 / rows);
    return vec2(col, row) * tileScale + (baseUv * tileScale);
}`
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'alphamap_fragment',
        `#ifdef USE_ALPHAMAP
    float treeAlphaA = texture2D(alphaMap, fsimResolveImpostorUv(vTreeUv, vTreeImpostorIndices.x)).a;
    float treeAlphaB = texture2D(alphaMap, fsimResolveImpostorUv(vTreeUv, vTreeImpostorIndices.y)).a;
    float treeAlphaC = texture2D(alphaMap, fsimResolveImpostorUv(vTreeUv, vTreeImpostorIndices.z)).a;
    float treeAlphaD = texture2D(alphaMap, fsimResolveImpostorUv(vTreeUv, vTreeImpostorIndices.w)).a;
    float treeDepthA = texture2D(uTreeImpostorDepthTex, fsimResolveImpostorUv(vTreeUv, vTreeImpostorIndices.x)).r;
    float treeDepthB = texture2D(uTreeImpostorDepthTex, fsimResolveImpostorUv(vTreeUv, vTreeImpostorIndices.y)).r;
    float treeDepthC = texture2D(uTreeImpostorDepthTex, fsimResolveImpostorUv(vTreeUv, vTreeImpostorIndices.z)).r;
    float treeDepthD = texture2D(uTreeImpostorDepthTex, fsimResolveImpostorUv(vTreeUv, vTreeImpostorIndices.w)).r;
    float weightedDepth =
        treeDepthA * vTreeImpostorWeights.x +
        treeDepthB * vTreeImpostorWeights.y +
        treeDepthC * vTreeImpostorWeights.z +
        treeDepthD * vTreeImpostorWeights.w;
    float treeThickness = mix(0.72, 1.0, smoothstep(0.15, 0.9, 1.0 - weightedDepth));
    float weightedAlpha =
        treeAlphaA * vTreeImpostorWeights.x +
        treeAlphaB * vTreeImpostorWeights.y +
        treeAlphaC * vTreeImpostorWeights.z +
        treeAlphaD * vTreeImpostorWeights.w;
    diffuseColor.a *= weightedAlpha * treeThickness;
#endif`
    );

    return shader;
}

/**
 * @param {{ uniforms: Record<string, unknown>, defines?: Record<string, unknown>, vertexShader: string, fragmentShader: string }} shader
 * @param {TreeDepthShaderPatchOptions} [options]
 */
export function applyTreeDepthShaderPatch(shader, {
    mainCameraPosUniform,
    cameraFacing = true,
    lockYAxis = true,
    shadowFadeNear = 1200,
    shadowFadeFar = 1800
} = /** @type {TreeDepthShaderPatchOptions} */ ({
    mainCameraPosUniform: { value: null }
})) {
    shader.defines = shader.defines || {};
    shader.defines.DEPTH_PACKING = 3201;
    Object.assign(shader.uniforms, createTreeDepthUniformBindings(mainCameraPosUniform, shadowFadeNear, shadowFadeFar));

    if (!cameraFacing) {
        return shader;
    }

    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        `#include <common>
    uniform vec3 uMainCameraPos;
    uniform float uTreeShadowFadeNear;
    uniform float uTreeShadowFadeFar; `
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'project_vertex',
        `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
    vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    vec2 instanceScale = vec2(length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2])),
    length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2])));
                              
    vec3 cameraDir = uMainCameraPos - (modelMatrix * vec4(instancePos, 1.0)).xyz;

    float distToCamera = length(cameraDir);
    float shadowScale = 1.0 - smoothstep(uTreeShadowFadeNear, uTreeShadowFadeFar, distToCamera);

${lockYAxis ? 'cameraDir.y = 0.0;' : ''}
cameraDir = normalize(cameraDir);

if (length(cameraDir) > 0.0) {
        vec3 upRef = abs(cameraDir.y) > 0.98 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
        vec3 right = normalize(cross(upRef, cameraDir));
        vec3 up = normalize(cross(cameraDir, right));
        mat3 alignMat = ${lockYAxis ? `mat3(
    right.x, 0.0, right.z,
    0.0, 1.0, 0.0,
    cameraDir.x, 0.0, cameraDir.z
)` : `mat3(
    right.x, right.y, right.z,
    up.x, up.y, up.z,
    cameraDir.x, cameraDir.y, cameraDir.z
)`};
    mvPosition.xyz = alignMat * (mvPosition.xyz * vec3(instanceScale.x * shadowScale, instanceScale.y * shadowScale, 1.0)) + instancePos;
} else {
    mvPosition = instanceMatrix * mvPosition;
}
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`
    );

    return shader;
}

export function getDetailedBuildingFragments(style) {
    if (style === 'commercial') {
        return {
            colorFragment: `
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
} `,
            roughFragment: `
if (abs(vBldgNormal.y) < 0.9) {
            vec2 wallUv;
    if (abs(vBldgNormal.x) > 0.5) wallUv = vec2(vBldgObjPos.z * vBldgScale.z, vBldgObjPos.y * vBldgScale.y);
    else wallUv = vec2(vBldgObjPos.x * vBldgScale.x, vBldgObjPos.y * vBldgScale.y);
            float winX = fract(wallUv.x * 0.4);
            float winY = fract(wallUv.y * 0.33);
    if (winX > 0.15 && winY > 0.25) {
        roughnessFactor = 0.1;
    }
} `
        };
    }

    if (style === 'residential') {
        return {
            colorFragment: `
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
} `,
            roughFragment: `
if (abs(vBldgNormal.y) < 0.9) {
            vec2 wallUv;
    if (abs(vBldgNormal.x) > 0.5) wallUv = vec2(vBldgObjPos.z * vBldgScale.z, vBldgObjPos.y * vBldgScale.y);
    else wallUv = vec2(vBldgObjPos.x * vBldgScale.x, vBldgObjPos.y * vBldgScale.y);
            float winX = fract(wallUv.x * 0.25);
            float winY = fract(wallUv.y * 0.25);
    if (winX > 0.4 && winX < 0.8 && winY > 0.4 && winY < 0.8) {
        roughnessFactor = 0.15;
    }
} `
        };
    }

    if (style === 'industrial') {
        return {
            colorFragment: `
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
} `,
            roughFragment: `
if (abs(vBldgNormal.y) < 0.9) {
            vec2 wallUv;
    if (abs(vBldgNormal.x) > 0.5) wallUv = vec2(vBldgObjPos.z * vBldgScale.z, vBldgObjPos.y * vBldgScale.y);
    else wallUv = vec2(vBldgObjPos.x * vBldgScale.x, vBldgObjPos.y * vBldgScale.y);
    if (wallUv.y > 0.8 && fract(wallUv.x * 0.1) > 0.2 && fract(wallUv.x * 0.1) < 0.8) {
        roughnessFactor = 0.2;
    }
} `
        };
    }

    return { colorFragment: '', roughFragment: '' };
}

/**
 * @param {{ uniforms: Record<string, unknown>, defines?: Record<string, unknown>, vertexShader: string, fragmentShader: string }} shader
 * @param {DetailedBuildingShaderPatchOptions} options
 */
export function applyDetailedBuildingShaderPatch(shader, { style, cameraPosUniform = null, fadeNear = 6800, fadeFar = 7800 }) {
    if (cameraPosUniform) {
        Object.assign(shader.uniforms, createBuildingPopInUniformBindings(cameraPosUniform, fadeNear, fadeFar));
    }

    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        `#include <common>
    varying vec3 vBldgObjPos;
        varying vec3 vBldgScale;
        varying vec3 vBldgNormal;
${cameraPosUniform ? `uniform vec3 uBldgCameraPos;
uniform float uBldgFadeNear;
uniform float uBldgFadeFar;` : ''
            } `
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'begin_vertex',
        `#include <begin_vertex>
    vBldgObjPos = position;
vBldgNormal = normal;
#ifdef USE_INSTANCING
vBldgScale = vec3(
    length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2])),
    length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2])),
    length(vec3(instanceMatrix[2][0], instanceMatrix[2][1], instanceMatrix[2][2]))
);
#else
vBldgScale = vec3(1.0);
#endif
${cameraPosUniform ? `    #ifdef USE_INSTANCING
    vec3 _bldgInstPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float _bldgDist = distance((modelMatrix * vec4(_bldgInstPos, 1.0)).xyz, uBldgCameraPos);
    float _bldgScale = 1.0 - smoothstep(uBldgFadeNear, uBldgFadeFar, _bldgDist);
    transformed *= _bldgScale;
    #endif` : ''
            } `
    );

    const { colorFragment, roughFragment } = getDetailedBuildingFragments(style);

    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        `#include <common>
    varying vec3 vBldgObjPos;
        varying vec3 vBldgScale;
        varying vec3 vBldgNormal; `
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'color_fragment',
        `#include <color_fragment>\n${colorFragment} `
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'roughnessmap_fragment',
        `#include <roughnessmap_fragment>\n${roughFragment} `
    );

    return shader;
}

export function applyTerrainDetailShaderPatch(shader, {
    terrainDetailUniforms,
    atmosphereUniforms,
    timeUniform,
    isFarLOD = false,
    shadowContrast = 0.0
}) {
    const supportsLitTerrain = shader.fragmentShader.includes('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;');
    Object.assign(
        shader.uniforms,
        createTerrainDetailUniformBindings(terrainDetailUniforms, atmosphereUniforms, timeUniform)
    );

    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        `#include <common>
    attribute vec4 surfaceWeights;
    varying vec3 vTerrainWorldPos;
    varying vec3 vTerrainWorldNormal;
    varying float vTerrainDist;
    varying float vTerrainSlope;
    varying vec4 vTerrainSurfaceWeights;
    uniform vec3 uAtmosCameraPos;`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'begin_vertex',
        `#include <begin_vertex>
    vTerrainSurfaceWeights = surfaceWeights;`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'worldpos_vertex',
        `#include <worldpos_vertex>
    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
#ifdef USE_INSTANCING
worldPos = instanceMatrix * worldPos;
#endif
vTerrainWorldPos = worldPos.xyz;
vTerrainWorldNormal = normalize(mat3(modelMatrix) * normal);
vTerrainDist = distance(worldPos.xyz, uAtmosCameraPos);
vTerrainSlope = 1.0 - clamp(abs(vTerrainWorldNormal.y), 0.0, 1.0);`
    );

    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        `#include <common>
    varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;
varying float vTerrainDist;
varying float vTerrainSlope;
uniform sampler2D uTerrainDetailTex;
uniform sampler2D uTerrainGrassTex;
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
uniform float uSurfaceShadowDistance;
uniform float uSurfaceShadowFadeStart;
uniform vec3 uShadowCoverageCenter;
uniform float uShadowCoverageExtent;
uniform float uShadowCoverageFadeStart;
uniform float uTerrainAtmosStrength;
uniform float uTerrainGrassTexScale;
uniform float uTerrainGrassTexStrength;
uniform float uTerrainGrassTexNearStart;
uniform float uTerrainGrassTexNearEnd;
uniform float uTerrainGrassShowTexture;
uniform float uTerrainGrassDebugMask;
uniform float uTime;
uniform vec3 uTerrainSandColor;
uniform vec3 uTerrainGrassColor;
uniform vec3 uTerrainRockColor;
uniform vec3 uTerrainSnowColor;
varying vec4 vTerrainSurfaceWeights;

float resolveTerrainShadowFade(vec2 worldXZ) {
    float receiverShadowDist = distance(worldXZ, uAtmosCameraPos.xz);
    float receiverFadeEnd = max(uSurfaceShadowDistance, uSurfaceShadowFadeStart + 0.0001);
    float receiverFade = 1.0 - smoothstep(uSurfaceShadowFadeStart, receiverFadeEnd, receiverShadowDist);
    vec2 shadowOffset = abs(worldXZ - uShadowCoverageCenter.xz);
    float shadowCoverageDist = max(shadowOffset.x, shadowOffset.y);
    float coverageFadeEnd = max(uShadowCoverageExtent, uShadowCoverageFadeStart + 0.0001);
    float coverageFade = 1.0 - smoothstep(uShadowCoverageFadeStart, coverageFadeEnd, shadowCoverageDist);
    return min(receiverFade, coverageFade);
}

${ShaderLibrary.terrain_city_pars_fragment}
`
    );
    shader.fragmentShader = replaceShaderSnippet(
        shader.fragmentShader,
        DIFFUSE_COLOR_SNIPPET,
        `vec4 diffuseColor = vec4(diffuse, opacity);
${ShaderLibrary.terrain_city_fragment}

    vec4 terrainWeights = clamp(vTerrainSurfaceWeights, 0.0, 1.0);
    float terrainWeightSum = max(dot(terrainWeights, vec4(1.0)), 0.0001);
    terrainWeights /= terrainWeightSum;
    vec3 baseTerrainColor =
        uTerrainSandColor * terrainWeights.x +
        uTerrainGrassColor * terrainWeights.y +
        uTerrainRockColor * terrainWeights.z +
        uTerrainSnowColor * terrainWeights.w;
#ifdef USE_COLOR
    vec3 naturalTerrainVertexTint = clamp(vColor.rgb, 0.0, 1.0);
    baseTerrainColor *= naturalTerrainVertexTint;
#endif
    diffuseColor.rgb = baseTerrainColor;

    vec2 baseUv = vTerrainWorldPos.xz * uTerrainDetailScale;
    vec4 pNoise = texture2D(uTerrainDetailTex, baseUv * 0.12);
    float farDetailScale = 1.0;
#ifdef IS_FAR_LOD
    farDetailScale = 0.0;
#endif
    float slopeMask = smoothstep(uTerrainSlopeStart, uTerrainSlopeEnd, vTerrainSlope);
    float heightMask = smoothstep(uTerrainRockHeightStart, uTerrainRockHeightEnd, vTerrainWorldPos.y);
    float rockMask = max(max(slopeMask, heightMask), terrainWeights.z);
    float isCity = smoothstep(0.01, 0.1, cityAlpha);
    float grassTextureFade = (1.0 - smoothstep(uTerrainGrassTexNearStart, uTerrainGrassTexNearEnd, vTerrainDist))
        * terrainWeights.y
        * (1.0 - rockMask * 0.6)
        * (1.0 - isCity)
        * farDetailScale
        * uTerrainGrassShowTexture
        * uTerrainGrassTexStrength;
    vec2 grassUvA = vTerrainWorldPos.xz * uTerrainGrassTexScale;
    mat2 grassRotation = mat2(0.819152, -0.573576, 0.573576, 0.819152);
    vec2 grassUvB = grassRotation * (grassUvA * 0.83);
    vec3 grassTexA = texture2D(uTerrainGrassTex, grassUvA).rgb;
    vec3 grassTexB = texture2D(uTerrainGrassTex, grassUvB).rgb;
    vec3 grassTexColor = mix(grassTexA, grassTexB, 0.45);
    diffuseColor.rgb = mix(diffuseColor.rgb, grassTexColor, clamp(grassTextureFade, 0.0, 1.0));
    if (uTerrainGrassDebugMask > 0.5) {
        vec3 grassMaskDebug = mix(
            vec3(0.04, 0.0, 0.0),
            vec3(0.08, 0.95, 0.12),
            clamp(grassTextureFade * 1.2, 0.0, 1.0)
        );
        diffuseColor.rgb = mix(diffuseColor.rgb, grassMaskDebug, 0.9);
    }

${ShaderLibrary.terrain_city_pavement_fragment}
        float terrainAtmos = smoothstep(uAtmosNear, uAtmosFar, vTerrainDist) * uTerrainAtmosStrength;
        diffuseColor.rgb = mix(diffuseColor.rgb, uAtmosColor, terrainAtmos);`,
        'terrain diffuseColor assignment'
    );

    // Terrain owns its full surface color composition, so the stock vertex-color
    // modulation would re-tint asphalt and road markings with underlying grass.
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'color_fragment',
        ''
    );

    if (supportsLitTerrain) {
        shader.fragmentShader = replaceShaderInclude(
            shader.fragmentShader,
            'shadowmap_pars_fragment',
            `#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>`
        );
        shader.fragmentShader = replaceShaderSnippet(
            shader.fragmentShader,
            'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
            `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
float terrainShadowFade = resolveTerrainShadowFade(vTerrainWorldPos.xz);
float terrainShadowVisibility = mix(1.0, getShadowMask(), ${shadowContrast.toFixed(4)} * terrainShadowFade);
outgoingLight *= terrainShadowVisibility;`,
            'terrain shadow contrast adjustment'
        );
    }

    if (isFarLOD) {
        shader.fragmentShader = prependShaderDefine(shader.fragmentShader, '#define IS_FAR_LOD');
    }

    return shader;
}
