import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { warmupShaderPrograms } from '../js/modules/world/ShaderWarmup.js';

test('warmupShaderPrograms uses compileAsync when available and disposes provider resources', async () => {
    let compileCount = 0;
    let disposed = false;

    const report = await warmupShaderPrograms({
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
    assert.equal(report.compiled, true);
    assert.equal(report.mode, 'compileAsync');
    assert.equal(report.providerCount, 1);
    assert.equal(report.objectCount, 1);
    assert.deepEqual(report.providers, [{ id: 'provider-0', objectCount: 1, materials: [] }]);
});

test('warmupShaderPrograms falls back to compile when compileAsync is unavailable', async () => {
    let compileCount = 0;

    const report = await warmupShaderPrograms({
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
    assert.equal(report.compiled, true);
    assert.equal(report.mode, 'compile');
    assert.deepEqual(report.providers, [{ id: 'provider-0', objectCount: 1, materials: [] }]);
});
