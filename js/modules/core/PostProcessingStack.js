import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

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

    for (const definition of definitions) {
        const pass = definition.create(runtimeState);
        composer.addPass(pass);
        passesById.set(definition.id, { definition, pass });
    }

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
        }
    };
}
