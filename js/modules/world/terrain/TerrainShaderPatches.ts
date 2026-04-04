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
 * @property {boolean} [cameraFacing]
 * @property {boolean} [lockYAxis]
 * @property {number} [shadowFadeNear]
 * @property {number} [shadowFadeFar]
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
        '#include <common>\nvarying vec3 vWaterWorldPos;'
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'worldpos_vertex',
        `#include <worldpos_vertex>
    vec4 waterWorldPos = modelMatrix * vec4(transformed, 1.0);
#ifdef USE_INSTANCING
waterWorldPos = instanceMatrix * waterWorldPos;
#endif
vWaterWorldPos = waterWorldPos.xyz; `
    );

    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        `#include <common>
varying vec3 vWaterWorldPos;
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
        `vec2 waterUv = clamp((vWaterWorldPos.xz - uWaterBoundsMin) / max(uWaterBoundsSize, vec2(0.0001)), 0.0, 1.0);
vec2 waterDepthUv = mix(uWaterDepthUvMin, uWaterDepthUvMax, waterUv);
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

    // Distance-based shadow culling to prevent ALPHATEST discard overdraw
    float distToCamera = length(cameraDir);
    float shadowScale = 1.0 - smoothstep(uTreeShadowFadeNear, uTreeShadowFadeFar, distToCamera);

// Don't pitch trees up/down towards the camera
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
