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
                `#include <worldpos_vertex>
    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
#ifdef USE_INSTANCING
worldPos = instanceMatrix * worldPos;
#endif
vAtmosWorldPos = worldPos.xyz; `
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>\nvarying vec3 vAtmosWorldPos; \nuniform vec3 uAtmosCameraPos; \nuniform vec3 uAtmosColor; \nuniform float uAtmosNear; \nuniform float uAtmosFar; `
            )
            .replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `vec4 diffuseColor = vec4(diffuse, opacity);
float atmosDist = distance(vAtmosWorldPos, uAtmosCameraPos);
float atmosMix = smoothstep(uAtmosNear, uAtmosFar, atmosDist) * ${strength.toFixed(4)};
float atmosLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(atmosLuma), ${desat.toFixed(4)} * atmosMix);
diffuseColor.rgb = mix(diffuseColor.rgb, uAtmosColor, atmosMix); `
            );
    };
    material.customProgramCacheKey = () => `atmos-${programKey}`;
}

export function applyWaterDualScrollToMaterial(material, timeUniform) {
    const prevCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (prevCompile) prevCompile(shader, renderer);

        shader.uniforms.uTime = timeUniform;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
    uniform float uTime; `
        ).replace(
            '#include <normal_fragment_maps>',
            `
#ifdef USE_NORMALMAP
    vec2 normalUv1 = vNormalMapUv + vec2(uTime * 0.12, uTime * 0.08);
    vec2 normalUv2 = vNormalMapUv * 1.5 + vec2(uTime * -0.08, uTime * 0.12);
    
    vec3 map1 = texture2D(normalMap, normalUv1).xyz;
    vec3 map2 = texture2D(normalMap, normalUv2).xyz;
    
    vec3 normal1 = map1 * 2.0 - 1.0;
    vec3 normal2 = map2 * 2.0 - 1.0;
    
    vec3 baseNormal = normalize(normal1 + normal2);
baseNormal.xy *= normalScale;

    // Compute TBN matrix from derivatives
    vec3 q0_ds = dFdx(- vViewPosition.xyz);
    vec3 q1_ds = dFdy(- vViewPosition.xyz);
    vec2 st0_ds = dFdx(vNormalMapUv.st);
    vec2 st1_ds = dFdy(vNormalMapUv.st);
    
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
#else
#include <normal_fragment_maps>
    #endif`
        );
    };

    const prevCacheKey = material.customProgramCacheKey;
    material.customProgramCacheKey = () => {
        return (prevCacheKey ? prevCacheKey() : '') + '-dualscroll';
    };
}

// Injects distance-based pop-in scale into a building material's vertex shader.
// Buildings scale from 0 → 1 over the range [fadeNear, fadeFar] (in world-space units).
export function setupBuildingPopIn(material, cameraPosUniform, fadeNear = 6800, fadeFar = 7800) {
    const prevCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (prevCompile) prevCompile(shader, renderer);

        shader.uniforms.uBldgCameraPos = cameraPosUniform;
        shader.uniforms.uBldgFadeNear = { value: fadeNear };
        shader.uniforms.uBldgFadeFar = { value: fadeFar };

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
    uniform vec3 uBldgCameraPos;
uniform float uBldgFadeNear;
uniform float uBldgFadeFar;`
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
    #ifdef USE_INSTANCING
    // World position of this instance's origin
    vec3 bldgInstancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float bldgDist = distance((modelMatrix * vec4(bldgInstancePos, 1.0)).xyz, uBldgCameraPos);
    // Scale: 1 at fadeNear, 0 at fadeFar → smoothly grow in
    float bldgPopInScale = 1.0 - smoothstep(uBldgFadeNear, uBldgFadeFar, bldgDist);
transformed *= bldgPopInScale;
#endif`
            );
    };

    const prevCacheKey = material.customProgramCacheKey;
    material.customProgramCacheKey = () =>
        (prevCacheKey ? prevCacheKey.call(material) : material.uuid) + `-bldg-popin-${fadeNear}-${fadeFar}`;
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
        shader.vertexShader = shader.vertexShader.replace(
            '#include <beginnormal_vertex>',
            `
#include <beginnormal_vertex>
    #ifdef USE_INSTANCING
    vec3 cameraDirN = cameraPosition - (modelMatrix * vec4(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2], 1.0)).xyz;
cameraDirN.y = 0.0;
cameraDirN = normalize(cameraDirN);
if (length(cameraDirN) > 0.0) {
        vec3 rightN = normalize(cross(vec3(0.0, 1.0, 0.0), cameraDirN));
        mat3 alignMatN = mat3(
    rightN.x, 0.0, rightN.z,
    0.0, 1.0, 0.0,
    cameraDirN.x, 0.0, cameraDirN.z
);
    objectNormal = alignMatN * objectNormal;
}
#endif
    `
        ).replace(
            '#include <project_vertex>',
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
cameraDir.y = 0.0;
cameraDir = normalize(cameraDir);

if (length(cameraDir) > 0.0) {
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), cameraDir));
        mat3 alignMat = mat3(
    right.x, 0.0, right.z,
    0.0, 1.0, 0.0,
    cameraDir.x, 0.0, cameraDir.z
);
    mvPosition.xyz = alignMat * (mvPosition.xyz * vec3(instanceScale.x, instanceScale.y, 1.0)) + instancePos;
} else {
    mvPosition = instanceMatrix * mvPosition;
}
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`
        );
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
        // We MUST define DEPTH_PACKING for the depth shader to work if we modify it
        shader.defines = shader.defines || {};
        shader.defines.DEPTH_PACKING = 3201; // THREE.RGBADepthPacking enum value

        shader.uniforms.uMainCameraPos = mainCameraPosUniform;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
    uniform vec3 uMainCameraPos; `
        ).replace(
            '#include <project_vertex>',
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
    float shadowScale = 1.0 - smoothstep(600.0, 800.0, distToCamera);

// Don't pitch trees up/down towards the camera
cameraDir.y = 0.0;
cameraDir = normalize(cameraDir);

if (length(cameraDir) > 0.0) {
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), cameraDir));
        mat3 alignMat = mat3(
    right.x, 0.0, right.z,
    0.0, 1.0, 0.0,
    cameraDir.x, 0.0, cameraDir.z
);
    mvPosition.xyz = alignMat * (mvPosition.xyz * vec3(instanceScale.x * shadowScale, instanceScale.y * shadowScale, 1.0)) + instancePos;
} else {
    mvPosition = instanceMatrix * mvPosition;
}
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`
        );
    };

    mat.customProgramCacheKey = () => 'treeDepthBillboard_v3';
    return mat;
}

export function createDetailedBuildingMat(style, cameraPosUniform = null) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });
    mat.onBeforeCompile = (shader) => {
        if (cameraPosUniform) {
            shader.uniforms.uBldgCameraPos = cameraPosUniform;
            shader.uniforms.uBldgFadeNear = { value: 6800 };
            shader.uniforms.uBldgFadeFar = { value: 7800 };
        }

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
    varying vec3 vBldgObjPos;
        varying vec3 vBldgScale;
        varying vec3 vBldgNormal;
${cameraPosUniform ? `uniform vec3 uBldgCameraPos;
uniform float uBldgFadeNear;
uniform float uBldgFadeFar;` : ''
            } `
        ).replace(
            '#include <begin_vertex>',
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
} `;
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
} `;
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
} `;
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
} `;
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
} `;
            roughFragment = `
if (abs(vBldgNormal.y) < 0.9) {
            vec2 wallUv;
    if (abs(vBldgNormal.x) > 0.5) wallUv = vec2(vBldgObjPos.z * vBldgScale.z, vBldgObjPos.y * vBldgScale.y);
    else wallUv = vec2(vBldgObjPos.x * vBldgScale.x, vBldgObjPos.y * vBldgScale.y);
    if (wallUv.y > 0.8 && fract(wallUv.x * 0.1) > 0.2 && fract(wallUv.x * 0.1) < 0.8) {
        roughnessFactor = 0.2;
    }
} `;
        }

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
    varying vec3 vBldgObjPos;
        varying vec3 vBldgScale;
        varying vec3 vBldgNormal; `
        ).replace(
            '#include <color_fragment>',
            `#include <color_fragment>\n${colorFragment} `
        ).replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>\n${roughFragment} `
        );
    };
    mat.customProgramCacheKey = () => `detailed-building-mat-v3-${style}${cameraPosUniform ? '-popin' : ''}`;
    return mat;
}

export function setupTerrainMaterial(material, terrainDetailUniforms, atmosphereUniforms, isFarLOD = false, cityData = null) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTerrainDetailTex = terrainDetailUniforms.uTerrainDetailTex;
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

        if (cityData && cityData.roadMaskTexture) {
            shader.uniforms.uRoadMaskTex = { value: cityData.roadMaskTexture };
            shader.uniforms.uCityCenter = { value: new THREE.Vector2(cityData.center[0], cityData.center[1]) };
            shader.uniforms.uCityMaskRadius = { value: cityData.maskRadius };
        }

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
    varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;
        varying float vTerrainDist;
        varying float vTerrainSlope;
        uniform vec3 uAtmosCameraPos;`
            )
            .replace(
                '#include <worldpos_vertex>',
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

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
    varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;
varying float vTerrainDist;
varying float vTerrainSlope;
uniform sampler2D uTerrainDetailTex;
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
uniform float uTerrainFoliageStrength;
uniform float uTime;

#ifdef HAS_CITY_MASK
uniform sampler2D uRoadMaskTex;
uniform vec2 uCityCenter;
uniform float uCityMaskRadius;
#endif
`
            )
            .replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `vec4 diffuseColor = vec4(diffuse, opacity);
    float cityAlpha = 0.0;
#ifdef HAS_CITY_MASK
    vec2 cityUv = (vTerrainWorldPos.xz - uCityCenter + vec2(uCityMaskRadius)) / (uCityMaskRadius * 2.0);
cityUv.y = 1.0 - cityUv.y;
if (cityUv.x >= 0.0 && cityUv.x <= 1.0 && cityUv.y >= 0.0 && cityUv.y <= 1.0) {
    cityAlpha = texture2D(uRoadMaskTex, cityUv).r;
}
#endif

#ifndef IS_FAR_LOD
    vec2 baseUv = vTerrainWorldPos.xz * uTerrainDetailScale;
    vec4 pNoise = texture2D(uTerrainDetailTex, baseUv * 0.12);
    vec2 perturbedUv = baseUv + (pNoise.ba * 2.0 - 1.0) * 1.25;
    vec4 detailA = texture2D(uTerrainDetailTex, perturbedUv);
    vec4 detailB = texture2D(uTerrainDetailTex, perturbedUv * 2.61 + pNoise.rg * 0.2);
    float grassDetail = mix(detailA.r, detailB.r, 0.4);
    float rockDetail = mix(detailA.g, detailB.g, 0.5);
    float slopeMask = smoothstep(uTerrainSlopeStart, uTerrainSlopeEnd, vTerrainSlope);
    float heightMask = smoothstep(uTerrainRockHeightStart, uTerrainRockHeightEnd, vTerrainWorldPos.y);
    float rockMask = max(slopeMask, heightMask);
    float detailLuma = mix(grassDetail, rockDetail, rockMask);
    float detailBoost = mix(0.2, 2.0, detailLuma);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * detailBoost, uTerrainDetailStrength);

    // Suppress macro and foliage in city zones
    float isCity = smoothstep(0.01, 0.1, cityAlpha);
    
    float nearMid = 1.0 - smoothstep(140.0, 1700.0, vTerrainDist);
    float macro = 0.5 + 0.5 * sin(vTerrainWorldPos.x * 0.0018 + pNoise.b * 4.0) * sin(vTerrainWorldPos.z * 0.0022 - pNoise.a * 3.0);
diffuseColor.rgb *= mix(1.0, mix(0.85, 1.15, macro), nearMid * (1.0 - rockMask * 0.4) * (1.0 - isCity));
    
    float foliageFade = 1.0 - smoothstep(uTerrainFoliageNearStart, uTerrainFoliageNearEnd, vTerrainDist);
    float foliage = (1.0 - rockMask) * (1.0 - isCity) * foliageFade * smoothstep(0.48, 0.86, grassDetail);
    
    float phase = vTerrainWorldPos.x * 24.0 + vTerrainWorldPos.z * 21.0 + pNoise.r * 6.0;
    float micro = abs(fract(phase * 0.15915 - 0.5) * 4.0 - 2.0) - 1.0; 
    float blade = smoothstep(0.01, 0.99, abs(micro));
diffuseColor.rgb *= mix(1.0, 0.2 + 1.2 * blade, foliage);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb + vec3(0.02, 0.06, 0.015), foliage * 0.82);
#endif

#ifdef HAS_CITY_MASK
        // Pavement from 80/255 (0.31) to 160/255 (0.62)
        float isUrbanPavement = smoothstep(0.20, 0.40, cityAlpha);
        // Asphalt from 160/255 (0.62) upwards
        float isRoadAsphalt = smoothstep(0.55, 0.65, cityAlpha);
        
        vec3 pavementColor = vec3(0.55, 0.55, 0.55); // lighter concrete gray so it pops
        vec3 asphaltColor = vec3(0.20, 0.20, 0.20); // dark asphalt

#ifndef IS_FAR_LOD
pavementColor *= mix(0.85, 1.15, rockDetail); // add grit
#endif

        // Dashed center lane markings
        float isCenter = smoothstep(0.92, 0.98, cityAlpha);
        float dashPattern = step(0.5, fract(vTerrainWorldPos.x * 0.10 + vTerrainWorldPos.z * 0.10));
        vec3 markingColor = vec3(0.92, 0.88, 0.72); // warm off-white
        
        vec3 finalCityColor = mix(pavementColor, asphaltColor, isRoadAsphalt);
finalCityColor = mix(finalCityColor, markingColor, isCenter * dashPattern * 0.75);

#ifndef IS_FAR_LOD
        // Traffic Layer (Headlights & Taillights)
        // High frequency scrolling patterns on asphalt
        float trafficAnim = uTime * 1.8;
        float flowX = fract(vTerrainWorldPos.x * 0.04 + trafficAnim);
        float flowZ = fract(vTerrainWorldPos.z * 0.04 - trafficAnim);

        // Heads (white/yellow) and Tails (red)
        float heads = step(0.96, fract(vTerrainWorldPos.x * 0.3 + trafficAnim * 1.2)) +
    step(0.96, fract(vTerrainWorldPos.z * 0.3 - trafficAnim * 1.2));
        float tails = step(0.96, fract(vTerrainWorldPos.x * 0.3 + (trafficAnim + 0.5) * 1.2)) +
    step(0.96, fract(vTerrainWorldPos.z * 0.3 - (trafficAnim + 0.5) * 1.2));

        // Modulate by urban density (high cityAlpha)
        float trafficDensity = smoothstep(0.65, 0.95, cityAlpha);
        vec3 headlightCol = vec3(1.0, 0.98, 0.85);
        vec3 taillightCol = vec3(1.0, 0.1, 0.05);

finalCityColor = mix(finalCityColor, headlightCol, heads * isRoadAsphalt * trafficDensity * 0.9);
finalCityColor = mix(finalCityColor, taillightCol, tails * isRoadAsphalt * trafficDensity * 0.7);
#endif

        diffuseColor.rgb = mix(diffuseColor.rgb, finalCityColor, isUrbanPavement);
        #endif
        float terrainAtmos = smoothstep(uAtmosNear, uAtmosFar, vTerrainDist) * uTerrainAtmosStrength;
        diffuseColor.rgb = mix(diffuseColor.rgb, uAtmosColor, terrainAtmos);`
            );

        if (isFarLOD) shader.fragmentShader = '#define IS_FAR_LOD\n' + shader.fragmentShader;
        if (cityData && cityData.roadMaskTexture) shader.fragmentShader = '#define HAS_CITY_MASK\n' + shader.fragmentShader;
    };
    const fragId = (isFarLOD ? 'far' : 'near') + (cityData ? '-city' : '');
    material.customProgramCacheKey = () => `terrain-detail-v5-${fragId}`;
}
