// @ts-check

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/** @typedef {import('three').Scene} Scene */
/** @typedef {import('three').Camera} Camera */
/** @typedef {import('three').WebGLRenderer} WebGLRenderer */

/**
 * @typedef PostStackRuntimeState
 * @property {WebGLRenderer} renderer
 * @property {Scene} scene
 * @property {Camera} camera
 * @property {number} width
 * @property {number} height
 * @property {number} pixelRatio
 */

/**
 * @typedef PostStackDefinition
 * @property {string} id
 * @property {(state: PostStackRuntimeState) => any} create
 * @property {((state: PostStackRuntimeState & { pass: any }) => void) | undefined} [resize]
 * @property {((state: PostStackRuntimeState & { pass: any, frameTimeEmaMs?: number }) => void) | undefined} [update]
 */

/**
 * @param {{
 *   THREEImpl?: typeof THREE,
 *   RenderPassImpl?: typeof RenderPass,
 *   SMAAPassImpl?: typeof SMAAPass,
 *   UnrealBloomPassImpl?: typeof UnrealBloomPass
 * }} [options]
 * @returns {PostStackDefinition[]}
 */
export function createDefaultPostStackDefinitions({
    THREEImpl = THREE,
    RenderPassImpl = RenderPass,
    SMAAPassImpl = SMAAPass,
    UnrealBloomPassImpl = UnrealBloomPass
} = {}) {
    return [
        {
            id: 'renderScene',
            create: ({ scene, camera }) => new RenderPassImpl(scene, camera)
        },
        {
            id: 'smaa',
            create: ({ width, height, pixelRatio }) => new SMAAPassImpl(width * pixelRatio, height * pixelRatio),
            resize: ({ pass, width, height, pixelRatio }) => {
                pass.setSize(width * pixelRatio, height * pixelRatio);
            },
            update: ({ pass, pixelRatio }) => {
                pass.enabled = pixelRatio >= 0.95;
            }
        },
        {
            id: 'bloom',
            create: ({ width, height }) => {
                const pass = new UnrealBloomPassImpl(new THREEImpl.Vector2(width, height), 1.5, 0.4, 0.85);
                pass.threshold = 5.0;
                pass.strength = 0.8;
                pass.radius = 0.4;
                return pass;
            },
            resize: ({ pass, width, height }) => {
                if (typeof pass.setSize === 'function') {
                    pass.setSize(width, height);
                }
            }
        }
    ];
}

/**
 * @param {{
 *   renderer: WebGLRenderer,
 *   scene: Scene,
 *   camera: Camera,
 *   width: number,
 *   height: number,
 *   pixelRatio: number,
 *   definitions?: PostStackDefinition[],
 *   composerFactory?: (rendererRef: WebGLRenderer) => EffectComposer
 * }} options
 */
export function createPostProcessingStack({
    renderer,
    scene,
    camera,
    width,
    height,
    pixelRatio,
    definitions = createDefaultPostStackDefinitions(),
    composerFactory = (rendererRef) => new EffectComposer(rendererRef)
}) {
    const composer = composerFactory(renderer);
    const runtimeState = { renderer, scene, camera, width, height, pixelRatio };
    const passesById = new Map();
    const passTimings = new Map();
    let totalRenderMs = 0;

    /** @param {number} value */
    function roundTiming(value) {
        if (!Number.isFinite(value)) return null;
        return Math.round(value * 1000) / 1000;
    }

    /**
     * @param {PostStackDefinition} definition
     * @param {any} pass
     */
    function wrapPassRender(definition, pass) {
        if (typeof pass?.render !== 'function') return;
        const originalRender = pass.render.bind(pass);
        pass.render = (...args) => {
            const start = performance.now();
            const result = originalRender(...args);
            const durationMs = performance.now() - start;
            passTimings.set(definition.id, durationMs);
            return result;
        };
    }

    for (const definition of definitions) {
        const pass = definition.create(runtimeState);
        wrapPassRender(definition, pass);
        composer.addPass(pass);
        passesById.set(definition.id, { definition, pass });
    }

    /**
     * @param {'resize' | 'update'} hook
     * @param {Partial<PostStackRuntimeState & { frameTimeEmaMs?: number }>} [nextState]
     */
    function applyDefinitions(hook, nextState = {}) {
        Object.assign(runtimeState, nextState);

        if (hook === 'resize') {
            composer.setSize(runtimeState.width, runtimeState.height);
        }

        for (const { definition, pass } of passesById.values()) {
            if (typeof definition[hook] === 'function') {
                definition[hook]({ ...runtimeState, pass });
            }
        }
    }

    applyDefinitions('resize', { width, height, pixelRatio });
    applyDefinitions('update');

    return {
        composer,
        render(deltaTime) {
            passTimings.clear();
            const start = performance.now();
            composer.render(deltaTime);
            totalRenderMs = performance.now() - start;
        },
        resize(nextWidth, nextHeight, nextPixelRatio = runtimeState.pixelRatio) {
            applyDefinitions('resize', {
                width: nextWidth,
                height: nextHeight,
                pixelRatio: nextPixelRatio
            });
        },
        update(nextState = {}) {
            applyDefinitions('update', nextState);
        },
        getPass(id) {
            return passesById.get(id)?.pass || null;
        },
        getPassTimings() {
            return {
                renderScene: roundTiming(passTimings.get('renderScene') ?? 0),
                smaa: roundTiming(passTimings.get('smaa') ?? 0),
                bloom: roundTiming(passTimings.get('bloom') ?? 0),
                total: roundTiming(totalRenderMs)
            };
        }
    };
}
