import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createDefaultPostStackDefinitions,
    createPostProcessingStack
} from '../js/modules/core/PostProcessingStack.js';

class FakeRenderPass {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
    }
}

class FakeSMAAPass {
    constructor(width, height) {
        this.createdSize = [width, height];
        this.enabled = true;
    }

    setSize(width, height) {
        this.size = [width, height];
    }
}

class FakeBloomPass {
    constructor(vector, strength, radius, threshold) {
        this.vector = vector;
        this.args = [strength, radius, threshold];
    }

    setSize(width, height) {
        this.size = [width, height];
    }
}

class FakeVector2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

test('createPostProcessingStack assembles passes declaratively and applies resize/update hooks', () => {
    const composer = {
        passes: [],
        addPass(pass) {
            this.passes.push(pass);
        },
        setSize(width, height) {
            this.size = [width, height];
        }
    };
    const definitions = createDefaultPostStackDefinitions({
        THREEImpl: { Vector2: FakeVector2 },
        RenderPassImpl: FakeRenderPass,
        SMAAPassImpl: FakeSMAAPass,
        UnrealBloomPassImpl: FakeBloomPass
    });

    const stack = createPostProcessingStack({
        renderer: {},
        scene: { id: 'scene' },
        camera: { id: 'camera' },
        width: 800,
        height: 600,
        pixelRatio: 1.5,
        definitions,
        composerFactory: () => composer
    });

    assert.equal(composer.passes.length, 3);
    assert.deepEqual(composer.size, [800, 600]);
    assert.deepEqual(stack.getPass('smaa').createdSize, [1200, 900]);
    assert.equal(stack.getPass('bloom').threshold, 5.0);
    assert.equal(stack.getPass('bloom').strength, 0.8);
    assert.equal(stack.getPass('bloom').radius, 0.4);

    stack.update({ pixelRatio: 0.8 });
    assert.equal(stack.getPass('smaa').enabled, false);

    stack.resize(1024, 768, 1.25);
    assert.deepEqual(composer.size, [1024, 768]);
    assert.deepEqual(stack.getPass('smaa').size, [1280, 960]);
    assert.deepEqual(stack.getPass('bloom').size, [1024, 768]);
});
