// @ts-check

import { createOwnedShaderDescriptor } from './ShaderDescriptor.js';
import { finalizeOwnedShaderSource } from './OwnedShaderSourceBuilder.js';
import { createRunwayLightUniformBindings } from './RunwayShaderPatches.js';

/** @typedef {ReturnType<typeof finalizeOwnedShaderSource>} OwnedShaderSource */
/** @typedef {ReturnType<typeof createOwnedShaderDescriptor>} OwnedShaderDescriptor */

const SOURCE_CACHE = new Map();
const DESCRIPTOR_CACHE = new Map();

/**
 * @param {{ intensity: number }} options
 * @returns {OwnedShaderSource}
 */
function buildRunwayLightOwnedShaderSource({ intensity }) {
    return finalizeOwnedShaderSource({
        label: 'runway light owned source',
        shader: {
            defines: {},
            vertexShader: `
                #include <common>
                #include <color_pars_vertex>
                #include <fog_pars_vertex>
                #include <logdepthbuf_pars_vertex>
                varying vec3 vInstanceColor;
                varying float vDist;

                void main() {
                    #include <color_vertex>

                    #ifdef USE_INSTANCING_COLOR
                        vInstanceColor = instanceColor.xyz;
                    #else
                        vInstanceColor = vec3(1.0);
                    #endif

                    vec3 transformed = vec3(position);
                    vec4 mvPosition = vec4(transformed, 1.0);

                    #ifdef USE_INSTANCING
                        mvPosition = instanceMatrix * mvPosition;
                    #endif

                    mvPosition = modelViewMatrix * mvPosition;
                    vDist = - mvPosition.z;
                    gl_Position = projectionMatrix * mvPosition;
                    #include <fog_vertex>
                    #include <logdepthbuf_vertex>
                }
            `,
            fragmentShader: `
                uniform vec3 diffuse;
                uniform float opacity;
                uniform float uIntensity;
                varying vec3 vInstanceColor;
                varying float vDist;

                #include <common>
                #include <logdepthbuf_pars_fragment>
                #include <fog_pars_fragment>

                void main() {
                    #include <logdepthbuf_fragment>

                    float lodFade = smoothstep(16000.0, 10000.0, vDist);
                    vec4 diffuseColor = vec4(diffuse * vInstanceColor * uIntensity * lodFade, opacity);
                    vec3 outgoingLight = diffuseColor.rgb;
                    gl_FragColor = vec4(outgoingLight, diffuseColor.a);
                    #include <fog_fragment>
                }
            `
        },
        requiredVertex: [
            { pattern: 'varying vec3 vInstanceColor;', description: 'instance color varying' },
            { pattern: 'vDist = - mvPosition.z;', description: 'distance fade varying assignment' }
        ],
        requiredFragment: [
            { pattern: 'uniform float uIntensity;', description: 'intensity uniform' },
            { pattern: 'float lodFade = smoothstep(16000.0, 10000.0, vDist);', description: 'LOD fade logic' }
        ]
    });
}

/**
 * @param {{ intensity: number }} options
 * @returns {OwnedShaderSource}
 */
export function getRunwayLightOwnedShaderSource({ intensity }) {
    const cacheKey = `runway-light:${intensity}`;
    if (!SOURCE_CACHE.has(cacheKey)) {
        SOURCE_CACHE.set(cacheKey, buildRunwayLightOwnedShaderSource({ intensity }));
    }
    return SOURCE_CACHE.get(cacheKey);
}

/**
 * @param {number} intensity
 * @returns {{ uIntensity: { value: number } }}
 */
export function getRunwayLightUniformBindings(intensity) {
    return createRunwayLightUniformBindings(intensity);
}

/**
 * @param {{ intensity: number }} options
 * @returns {OwnedShaderDescriptor}
 */
export function getRunwayLightShaderDescriptor({ intensity }) {
    const cacheKey = `runway-light:${intensity}`;
    if (!DESCRIPTOR_CACHE.has(cacheKey)) {
        DESCRIPTOR_CACHE.set(cacheKey, createOwnedShaderDescriptor({
            id: `runway-light-${intensity}`,
            baseCacheKey: `runway-light-owned-v1-${intensity}`,
            patchId: 'runway-light-owned-source',
            patchCacheKey: `runway-light-owned-source-${intensity}`,
            metadata: {
                intensity,
                shaderFamily: 'basic',
                system: 'runway'
            },
            source: getRunwayLightOwnedShaderSource({ intensity }),
            uniformBindings() {
                return getRunwayLightUniformBindings(intensity);
            }
        }));
    }
    return DESCRIPTOR_CACHE.get(cacheKey);
}
