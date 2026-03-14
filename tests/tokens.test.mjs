import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTokenSystem } from '../js/modules/world/tokens.js';
import { createRuntimeLodSettings } from '../js/modules/world/LodSystem.js';

test('tokens are only visible at LOD0', () => {
  const scene = new THREE.Scene();
  const lodSettings = createRuntimeLodSettings();
  const tokenSystem = createTokenSystem({
    scene,
    getTerrainHeight: () => 0,
    lodSettings
  });

  tokenSystem.updateLOD(new THREE.Vector3(), 1000);
  assert.equal(tokenSystem.tokenMesh.visible, true);

  tokenSystem.updateLOD(new THREE.Vector3(), lodSettings.airport.thresholds.mid + 1000);
  assert.equal(tokenSystem.tokenMesh.visible, false);
});

test('tokens follow terrain changes during updates', () => {
  const scene = new THREE.Scene();
  const lodSettings = createRuntimeLodSettings();
  let terrainOffset = 0;
  const tokenSystem = createTokenSystem({
    scene,
    getTerrainHeight: () => terrainOffset,
    lodSettings
  });

  tokenSystem.updateLOD(new THREE.Vector3(), 1000);
  tokenSystem.updateTokenSystem({
    timeMs: 0,
    aircraftPosition: new THREE.Vector3(999999, 999999, 999999),
    cameraPosition: new THREE.Vector3(0, 500, 0),
    cameraQuaternion: new THREE.Quaternion()
  });

  const before = new THREE.Matrix4();
  tokenSystem.tokenMesh.getMatrixAt(0, before);
  const beforeY = new THREE.Vector3().setFromMatrixPosition(before).y;

  terrainOffset = 250;
  tokenSystem.updateTokenSystem({
    timeMs: 0,
    aircraftPosition: new THREE.Vector3(999999, 999999, 999999),
    cameraPosition: new THREE.Vector3(0, 500, 0),
    cameraQuaternion: new THREE.Quaternion()
  });

  const after = new THREE.Matrix4();
  tokenSystem.tokenMesh.getMatrixAt(0, after);
  const afterY = new THREE.Vector3().setFromMatrixPosition(after).y;

  assert.ok(afterY > beforeY + 200, `expected token Y to increase significantly, before=${beforeY}, after=${afterY}`);
});
