import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { warmupShaderPrograms } from '../js/modules/world/ShaderWarmup.js';

test('warmupShaderPrograms uses compileAsync when available and disposes provider resources', async () => {
    let compileCount = 0;
    let disposed = false;

    await warmupShaderPrograms({
        renderer: {
            async compileAsync(scene, camera) {
                compileCount += 1;
                assert.equal(scene.children.length, 1);
                assert.ok(camera.isPerspectiveCamera);
            }
        },
        providers: [
            () => ({
                objects: [new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())],
                dispose() {
                    disposed = true;
                }
            })
        ]
    });

    assert.equal(compileCount, 1);
    assert.equal(disposed, true);
});

test('warmupShaderPrograms falls back to compile when compileAsync is unavailable', async () => {
    let compileCount = 0;

    await warmupShaderPrograms({
        renderer: {
            compile(scene, camera) {
                compileCount += 1;
                assert.equal(scene.children.length, 1);
                assert.ok(camera.isPerspectiveCamera);
            }
        },
        providers: [
            () => ({
                objects: [new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())]
            })
        ]
    });

    assert.equal(compileCount, 1);
});
