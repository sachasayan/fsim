import {
    replaceShaderInclude,
    replaceShaderSnippet
} from './ShaderPatchUtils.js';

const DIFFUSE_COLOR_SNIPPET = 'vec4 diffuseColor = vec4( diffuse, opacity );';

export function applyInstancedRunwayLightShaderPatch(shader, { intensity }) {
    shader.uniforms.uIntensity = { value: intensity };

    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'common',
        `#include <common>
         varying vec3 vInstanceColor;
         varying float vDist;`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'color_vertex',
        `#include <color_vertex>
         #ifdef USE_INSTANCING_COLOR
           vInstanceColor = instanceColor;
         #else
           vInstanceColor = vec3(1.0);
         #endif`
    );
    shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        'project_vertex',
        `#include <project_vertex>
         vDist = - mvPosition.z;`
    );

    shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        'common',
        `#include <common>
         uniform float uIntensity;
         varying vec3 vInstanceColor;
         varying float vDist;`
    );
    shader.fragmentShader = replaceShaderSnippet(
        shader.fragmentShader,
        DIFFUSE_COLOR_SNIPPET,
        `float lodFade = smoothstep(16000.0, 10000.0, vDist);
         vec4 diffuseColor = vec4( diffuse * vInstanceColor * uIntensity * lodFade, opacity );`,
        'runway light diffuseColor assignment'
    );

    return shader;
}
