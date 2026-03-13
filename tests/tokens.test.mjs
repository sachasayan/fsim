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
