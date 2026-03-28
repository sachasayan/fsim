import * as THREE from 'three';
import { createOwnedShaderDescriptor } from './ShaderDescriptor.js';
import { finalizeOwnedShaderSource } from './OwnedShaderSourceBuilder.js';
import { createNearCloudUniformBindings } from './CloudShaderPatches.js';

const SOURCE_CACHE = new Map();
const DESCRIPTOR_CACHE = new Map();

function buildNearCloudOwnedShaderSource() {
    return finalizeOwnedShaderSource({
        label: 'near cloud owned source',
        shader: {
            defines: {},
            vertexShader: `
                #include <common>
                #include <uv_pars_vertex>
                #include <color_pars_vertex>
                #include <logdepthbuf_pars_vertex>
                varying vec3 vCloudWorldPos;
                varying vec2 vCloudUv;

                void main() {
                    #include <uv_vertex>
                    #include <color_vertex>

                    vCloudUv = uv;

                    #ifdef USE_INSTANCING
                        vec4 worldPosition = modelMatrix * (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0));
                    #else
                        vec4 worldPosition = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                    #endif

                    vCloudWorldPos = worldPosition.xyz;

                    vec4 mvPosition = viewMatrix * worldPosition;

                    #ifdef USE_INSTANCING
                        vec2 instanceScale = vec2(
                            length(vec3(instanceMatrix[0].xyz)),
                            length(vec3(instanceMatrix[1].xyz))
                        );
                    #else
                        vec2 instanceScale = vec2(1.0);
                    #endif

                    mvPosition.xy += position.xy * instanceScale;
                    gl_Position = projectionMatrix * mvPosition;
                    #include <logdepthbuf_vertex>
                }
            `,
            fragmentShader: `
                uniform vec3 diffuse;
                uniform float opacity;
                uniform sampler2D map;
                uniform vec3 uCloudCameraPos;
                uniform float uNearFadeStart;
                uniform float uNearFadeEnd;
                uniform float uCloudMinLight;
                uniform vec3 uCloudSunDir;
                uniform float uCloudPhaseStrength;

                varying vec3 vCloudWorldPos;
                varying vec2 vCloudUv;

                #include <common>
                #include <color_pars_fragment>
                #include <alphatest_pars_fragment>
                #include <logdepthbuf_pars_fragment>
                #include <dithering_pars_fragment>

                void main() {
                    #include <logdepthbuf_fragment>

                    vec4 diffuseColor = vec4(diffuse, opacity);
                    #include <color_fragment>
                    vec4 sampledDiffuseColor = texture2D(map, vCloudUv);
                    diffuseColor *= sampledDiffuseColor;

                    float cloudDist = distance(vCloudWorldPos.xz, uCloudCameraPos.xz);
                    float nearFade = 1.0 - smoothstep(uNearFadeStart, uNearFadeEnd, cloudDist);
                    diffuseColor.a = clamp(diffuseColor.a * nearFade, 0.0, 1.0);
                    #include <alphatest_fragment>

                    vec3 lightDir = normalize(uCloudSunDir);
                    vec3 viewDir = normalize(uCloudCameraPos - vCloudWorldPos);
                    float cosTheta = dot(viewDir, -lightDir);

                    float g1 = 0.65;
                    float g2 = -0.15;
                    float phase1 = (1.0 - g1 * g1) / pow(1.0 + g1 * g1 - 2.0 * g1 * cosTheta, 1.5);
                    float phase2 = (1.0 - g2 * g2) / pow(1.0 + g2 * g2 - 2.0 * g2 * cosTheta, 1.5);
                    float phase = mix(phase1, phase2, 0.4) * uCloudPhaseStrength;

                    float topBoost = smoothstep(1200.0, 5400.0, vCloudWorldPos.y) * 0.12;
                    vec3 sunScatterColor = vec3(1.0, 0.97, 0.88);
                    vec3 scatterLight = mix(vec3(1.0), sunScatterColor, 0.7) * phase;

                    vec3 outgoingLight = diffuseColor.rgb + scatterLight + (diffuseColor.rgb * topBoost);
                    outgoingLight = max(outgoingLight, diffuseColor.rgb * max(uCloudMinLight, 0.3));

                    gl_FragColor = vec4(outgoingLight, diffuseColor.a);
                    #include <dithering_fragment>
                }
            `
        },
        requiredVertex: [
            { pattern: 'varying vec3 vCloudWorldPos;', description: 'cloud world position varying' },
            { pattern: 'vCloudUv = uv;', description: 'cloud UV varying assignment' }
        ],
        requiredFragment: [
            { pattern: 'float nearFade = 1.0 - smoothstep(uNearFadeStart, uNearFadeEnd, cloudDist);', description: 'near fade calculation' },
            { pattern: 'outgoingLight = diffuseColor.rgb + scatterLight + (diffuseColor.rgb * topBoost);', description: 'cloud scattering lighting' }
        ],
        forbiddenFragment: [
            { pattern: '#include <opaque_fragment>', description: 'late snippet-style opaque patching' }
        ]
    });
}

function buildFarCloudOwnedShaderSource() {
    return finalizeOwnedShaderSource({
        label: 'far cloud owned source',
        shader: {
        vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
        fragmentShader: `
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform vec3 uCloudCameraPos;
      uniform vec3 uSunDir;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uDomainRadius;
      uniform float uFarFadeStart;
      uniform float uFarFadeEnd;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash2(i + vec2(0.0, 0.0));
        float b = hash2(i + vec2(1.0, 0.0));
        float c = hash2(i + vec2(0.0, 1.0));
        float d = hash2(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float sum = 0.0;
        float amp = 0.6;
        float freq = 1.0;
        for (int i = 0; i < 3; i++) {
          sum += noise2(p * freq) * amp;
          freq *= 2.1;
          amp *= 0.45;
        }
        return sum;
      }

      void main() {
        vec2 wind = vec2(uTime * 0.0012, -uTime * 0.0007);
        vec2 p = (vWorldPos.xz * 0.00008) + wind;
        float n = fbm(p + fbm(p * 0.5) * 0.3);

        float coverage = smoothstep(0.58, 0.82, n);
        float alpha = coverage;

        float dist = distance(vWorldPos.xz, uCloudCameraPos.xz);
        float farFade = smoothstep(uFarFadeStart, uFarFadeEnd, dist);
        alpha *= farFade;
        float domainFade = 1.0 - smoothstep(uDomainRadius * 0.7, uDomainRadius, dist);
        alpha *= domainFade;

        float edge = fwidth(alpha) * 2.0 + 0.02;
        alpha = smoothstep(0.05 - edge, 1.0 + edge, alpha);

        vec3 lightDir = normalize(uSunDir);
        vec3 viewDir = normalize(uCloudCameraPos - vWorldPos);
        float cosTheta = dot(viewDir, -lightDir);

        float g1 = 0.65;
        float g2 = -0.15;
        float phase1 = (1.0 - g1 * g1) / pow(1.0 + g1 * g1 - 2.0 * g1 * cosTheta, 1.5);
        float phase2 = (1.0 - g2 * g2) / pow(1.0 + g2 * g2 - 2.0 * g2 * cosTheta, 1.5);
        float phase = mix(phase1, phase2, 0.4) * 0.25;

        vec3 sunScatterColor = vec3(1.0, 0.97, 0.88);
        vec3 phaseTint = mix(uColor, sunScatterColor, 0.8);
        vec3 finalColor = mix(uColor, phaseTint, clamp(phase, 0.0, 1.0));

        if (alpha < 0.01) discard;
        gl_FragColor = vec4(finalColor, alpha * uOpacity);
      }
    `,
        defines: {}
    },
        requiredVertex: [
            { pattern: 'varying vec3 vWorldPos;', description: 'far cloud world position varying' }
        ],
        requiredFragment: [
            { pattern: 'uniform float uTime;', description: 'time uniform' },
            { pattern: 'float n = fbm(p + fbm(p * 0.5) * 0.3);', description: 'fbm coverage noise' },
            { pattern: 'gl_FragColor = vec4(finalColor, alpha * uOpacity);', description: 'final far cloud color output' }
        ]
    });
}

export function getNearCloudOwnedShaderSource() {
    if (!SOURCE_CACHE.has('near')) {
        SOURCE_CACHE.set('near', buildNearCloudOwnedShaderSource());
    }
    return SOURCE_CACHE.get('near');
}

export function getNearCloudUniformBindings(sharedCloudUniforms) {
    return createNearCloudUniformBindings(sharedCloudUniforms);
}

export function getNearCloudShaderDescriptor() {
    if (!DESCRIPTOR_CACHE.has('near')) {
        DESCRIPTOR_CACHE.set('near', createOwnedShaderDescriptor({
            id: 'near-cloud-owned',
            baseCacheKey: 'near-clouds-owned-v1',
            patchId: 'near-cloud-owned-source',
            patchCacheKey: 'near-cloud-owned-source-v1',
            metadata: {
                shaderFamily: 'basic',
                cloudLayer: 'near',
                system: 'clouds'
            },
            source: getNearCloudOwnedShaderSource(),
            uniformBindings({ sharedCloudUniforms }) {
                return getNearCloudUniformBindings(sharedCloudUniforms);
            }
        }));
    }
    return DESCRIPTOR_CACHE.get('near');
}

export function getFarCloudOwnedShaderSource() {
    if (!SOURCE_CACHE.has('far')) {
        SOURCE_CACHE.set('far', buildFarCloudOwnedShaderSource());
    }
    return SOURCE_CACHE.get('far');
}

export function createFarCloudUniforms({ cloudTuning }) {
    return {
        uTime: { value: 0 },
        uCloudCameraPos: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(0.25, 0.85, 0.45).normalize() },
        uColor: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 0.28 },
        uDomainRadius: { value: 114000.0 },
        uFarFadeStart: { value: cloudTuning.farFadeStart },
        uFarFadeEnd: { value: cloudTuning.farFadeEnd }
    };
}
