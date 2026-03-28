// @ts-check

import {
    replaceShaderInclude,
    replaceShaderSnippet
} from './ShaderPatchUtils.js';

/**
 * @typedef SharedCloudUniforms
 * @property {{ value: import('three').Vector3 }} uCloudCameraPos
 * @property {{ value: number }} uNearFadeStart
 * @property {{ value: number }} uNearFadeEnd
 * @property {{ value: number }} uCloudMinLight
 * @property {{ value: import('three').Vector3 }} uCloudSunDir
 * @property {{ value: number }} uCloudPhaseStrength
 */

/**
 * @param {SharedCloudUniforms} sharedCloudUniforms
 * @returns {{
 *   uCloudCameraPos: SharedCloudUniforms['uCloudCameraPos'],
 *   uNearFadeStart: SharedCloudUniforms['uNearFadeStart'],
 *   uNearFadeEnd: SharedCloudUniforms['uNearFadeEnd'],
 *   uCloudMinLight: SharedCloudUniforms['uCloudMinLight'],
 *   uCloudSunDir: SharedCloudUniforms['uCloudSunDir'],
 *   uCloudPhaseStrength: SharedCloudUniforms['uCloudPhaseStrength']
 * }}
 */
export function createNearCloudUniformBindings(sharedCloudUniforms) {
    return {
        uCloudCameraPos: sharedCloudUniforms.uCloudCameraPos,
        uNearFadeStart: sharedCloudUniforms.uNearFadeStart,
        uNearFadeEnd: sharedCloudUniforms.uNearFadeEnd,
        uCloudMinLight: sharedCloudUniforms.uCloudMinLight,
        uCloudSunDir: sharedCloudUniforms.uCloudSunDir,
        uCloudPhaseStrength: sharedCloudUniforms.uCloudPhaseStrength
    };
}

/**
 * @param {import('three').WebGLProgramParametersWithUniforms['shader']} shader
 * @param {{ sharedCloudUniforms: SharedCloudUniforms }} options
 * @returns {import('three').WebGLProgramParametersWithUniforms['shader']}
 */
export function applyNearCloudShaderPatch(shader, { sharedCloudUniforms }) {
    Object.assign(shader.uniforms, createNearCloudUniformBindings(sharedCloudUniforms));

    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        `#include <common>
      varying vec3 vCloudWorldPos;
      varying vec2 vCloudUv;`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'worldpos_vertex',
        `
      vCloudUv = uv;
      
      // Correct Instance World Mapping - Name it worldPosition for compatibility with other Three.js chunks
      #ifdef USE_INSTANCING
        vec4 worldPosition = modelMatrix * (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0));
      #else
        vec4 worldPosition = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      #endif
      vCloudWorldPos = worldPosition.xyz;
      
      // Spherical Billboarding: Force the instance to face the camera in View Space
      mvPosition = viewMatrix * worldPosition;
      
      // Extract instance scale
      #ifdef USE_INSTANCING
        vec2 instanceScale = vec2(
          length(vec3(instanceMatrix[0].xyz)), 
          length(vec3(instanceMatrix[1].xyz))
        );
      #else
        vec2 instanceScale = vec2(1.0);
      #endif
      
      // Expand the quad in view-space xy
      mvPosition.xy += position.xy * instanceScale;
      
      gl_Position = projectionMatrix * mvPosition;
      `
    );

    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        `#include <common>
      varying vec3 vCloudWorldPos;
      varying vec2 vCloudUv;
      uniform vec3 uCloudCameraPos;
      uniform float uNearFadeStart;
      uniform float uNearFadeEnd;
      uniform float uCloudMinLight;
      uniform vec3 uCloudSunDir;
      uniform float uCloudPhaseStrength;`
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'alphatest_fragment',
        `#include <alphatest_fragment>
      float cloudDist = distance(vCloudWorldPos.xz, uCloudCameraPos.xz);
      float nearFade = 1.0 - smoothstep(uNearFadeStart, uNearFadeEnd, cloudDist);
      diffuseColor.a = clamp(diffuseColor.a * nearFade, 0.0, 1.0);`
    );
    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'opaque_fragment',
        `
      vec3 lightDir = normalize(uCloudSunDir);
      vec3 viewDir = normalize(uCloudCameraPos - vCloudWorldPos);
      float cosTheta = dot(viewDir, -lightDir); // Negative lightDir for correct forward scattering
      
      // Dual-lobe Henyey-Greenstein phase function for forward (silver-lining) and backward scattering
      float g1 = 0.65; // High forward scattering
      float g2 = -0.15; // Slight backward scattering
      float phase1 = (1.0 - g1 * g1) / pow(1.0 + g1 * g1 - 2.0 * g1 * cosTheta, 1.5);
      float phase2 = (1.0 - g2 * g2) / pow(1.0 + g2 * g2 - 2.0 * g2 * cosTheta, 1.5);
      float phase = mix(phase1, phase2, 0.4) * uCloudPhaseStrength;
      
      // Top boost to simulate in-scattering from the sky dome
      float topBoost = smoothstep(1200.0, 5400.0, vCloudWorldPos.y) * 0.12;
      
      // Add bright sun scattering instead of just brightening the base color
      vec3 sunScatterColor = vec3(1.0, 0.97, 0.88);
      vec3 scatterLight = mix(vec3(1.0), sunScatterColor, 0.7) * phase;
      
      // Base color should be fully lit by ambient (which is just diffuseColor since we're unlit Basic material)
      // We add scatter light, and a fake top boost
      outgoingLight = diffuseColor.rgb + scatterLight + (diffuseColor.rgb * topBoost);
      
      // Apply our manual cloud minimum brightness curve
      outgoingLight = max(outgoingLight, diffuseColor.rgb * max(uCloudMinLight, 0.3));
      
      #include <opaque_fragment>
      `
    );

    return shader;
}
