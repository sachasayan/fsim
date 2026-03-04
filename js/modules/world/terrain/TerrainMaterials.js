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
        vAtmosWorldPos = worldPos.xyz;`
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

export function applyWaterDualScrollToMaterial(material, timeUniform) {
    const prevCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (prevCompile) prevCompile(shader, renderer);

        shader.uniforms.uTime = timeUniform;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
uniform float uTime;`
        ).replace(
            '#include <normal_fragment_maps>',
            `
#ifdef USE_NORMALMAP
    vec2 normalUv1 = vNormalMapUv + vec2(uTime * 0.12, uTime * 0.08);
    vec2 normalUv2 = vNormalMapUv * 1.5 + vec2(uTime * -0.08, uTime * 0.12);
    
    vec3 map1 = texture2D( normalMap, normalUv1 ).xyz;
    vec3 map2 = texture2D( normalMap, normalUv2 ).xyz;
    
    vec3 normal1 = map1 * 2.0 - 1.0;
    vec3 normal2 = map2 * 2.0 - 1.0;
    
    vec3 baseNormal = normalize(normal1 + normal2);
    baseNormal.xy *= normalScale;
    
    // Compute TBN matrix from derivatives
    vec3 q0_ds = dFdx( - vViewPosition.xyz );
    vec3 q1_ds = dFdy( - vViewPosition.xyz );
    vec2 st0_ds = dFdx( vNormalMapUv.st );
    vec2 st1_ds = dFdy( vNormalMapUv.st );
    
    vec3 N_ds = normalize( normal );
    vec3 q1perp_ds = cross( q1_ds, N_ds );
    vec3 q0perp_ds = cross( N_ds, q0_ds );
    
    vec3 T_ds = q1perp_ds * st0_ds.x + q0perp_ds * st1_ds.x;
    vec3 B_ds = q1perp_ds * st0_ds.y + q0perp_ds * st1_ds.y;
    
    float det_ds = max( dot( T_ds, T_ds ), dot( B_ds, B_ds ) );
    float scale_ds = ( det_ds == 0.0 ) ? 0.0 : inversesqrt( det_ds );
    
    vec3 T_n_ds = T_ds * scale_ds;
    vec3 B_n_ds = B_ds * scale_ds;
    mat3 tbn_ds = mat3( T_n_ds, B_n_ds, N_ds );
    
    normal = normalize( tbn_ds * baseNormal );
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
    if(length(cameraDirN) > 0.0) {
        vec3 rightN = normalize(cross(vec3(0.0, 1.0, 0.0), cameraDirN));
        mat3 alignMatN = mat3(
            rightN.x, 0.0, rightN.z,
            0.0,      1.0, 0.0,
            cameraDirN.x, 0.0, cameraDirN.z
        );
        objectNormal = alignMatN * objectNormal;
    }
#endif
            `
        ).replace(
            '#include <project_vertex>',
            `
vec4 mvPosition = vec4( transformed, 1.0 );
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
    
    if(length(cameraDir) > 0.0) {
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), cameraDir));
        mat3 alignMat = mat3(
            right.x, 0.0, right.z,
            0.0,     1.0, 0.0,
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
            uniform vec3 uMainCameraPos;`
        ).replace(
            '#include <project_vertex>',
            `
vec4 mvPosition = vec4( transformed, 1.0 );
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
    
    if(length(cameraDir) > 0.0) {
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), cameraDir));
        mat3 alignMat = mat3(
            right.x, 0.0, right.z,
            0.0,     1.0, 0.0,
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

export function createDetailedBuildingMat(style) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });
    mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
        varying vec3 vBldgObjPos;
        varying vec3 vBldgScale;
        varying vec3 vBldgNormal; `
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
    #endif`
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
        varying vec3 vBldgNormal;`
        ).replace(
            '#include <color_fragment>',
            `#include <color_fragment>\n${colorFragment}`
        ).replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>\n${roughFragment}`
        );
    };
    mat.customProgramCacheKey = () => `detailed - building - mat - v2 - ${style} `;
    return mat;
}

export function setupTerrainMaterial(material, terrainDetailUniforms, atmosphereUniforms, isFarLOD = false) {
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
uniform float uTerrainFoliageStrength; `
            )
            .replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `vec4 diffuseColor = vec4(diffuse, opacity);
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
    float nearMid = 1.0 - smoothstep(140.0, 1700.0, vTerrainDist);
    float macro = 0.5 + 0.5 * sin(vTerrainWorldPos.x * 0.0018 + pNoise.b * 4.0) * sin(vTerrainWorldPos.z * 0.0022 - pNoise.a * 3.0);
    diffuseColor.rgb *= mix(1.0, mix(0.85, 1.15, macro), nearMid * (1.0 - rockMask * 0.4));
    float foliageFade = 1.0 - smoothstep(uTerrainFoliageNearStart, uTerrainFoliageNearEnd, vTerrainDist);
    float foliage = (1.0 - rockMask) * foliageFade * smoothstep(0.48, 0.86, grassDetail);
    float phase = vTerrainWorldPos.x * 24.0 + vTerrainWorldPos.z * 21.0 + pNoise.r * 6.0;
    float micro = abs(fract(phase * 0.15915 - 0.5) * 4.0 - 2.0) - 1.0; 
    float blade = smoothstep(0.01, 0.99, abs(micro));
    diffuseColor.rgb *= mix(1.0, 0.2 + 1.2 * blade, foliage);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb + vec3(0.02, 0.06, 0.015), foliage * 0.82);
    #endif
    float terrainAtmos = smoothstep(uAtmosNear, uAtmosFar, vTerrainDist) * uTerrainAtmosStrength;
    diffuseColor.rgb = mix(diffuseColor.rgb, uAtmosColor, terrainAtmos); `
            );

        if (isFarLOD) {
            shader.fragmentShader = '#define IS_FAR_LOD\n' + shader.fragmentShader;
        }
    };
    material.customProgramCacheKey = () => `terrain - detail - v4 - ${isFarLOD ? 'far' : 'near'} `;
}
