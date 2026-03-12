import * as THREE from 'three';

import {
    applyNearCloudShaderPatch,
    createNearCloudUniformBindings
} from './CloudShaderPatches.js';

const NEAR_CLOUD_UNIFORM_KEYS = [
    'uCloudCameraPos',
    'uNearFadeStart',
    'uNearFadeEnd',
    'uCloudMinLight',
    'uCloudSunDir',
    'uCloudPhaseStrength'
];

const SOURCE_CACHE = new Map();

function makePlaceholderUniformMap(keys) {
    return Object.fromEntries(keys.map((key) => [key, { value: null }]));
}

function buildNearCloudOwnedShaderSource() {
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: THREE.ShaderLib.basic.vertexShader,
        fragmentShader: THREE.ShaderLib.basic.fragmentShader
    };

    applyNearCloudShaderPatch(shader, {
        sharedCloudUniforms: makePlaceholderUniformMap(NEAR_CLOUD_UNIFORM_KEYS)
    });

    return {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        defines: shader.defines || {}
    };
}

function buildFarCloudOwnedShaderSource() {
    return {
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
    };
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
