import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { mergeShadowCoverage } from '../js/modules/world/authoredObjects.js';

test('mergeShadowCoverage keeps the aircraft-centered fit when contributor is already covered', () => {
  const baseCenter = new THREE.Vector3(0, 0, 0);
  const contributorCenter = new THREE.Vector3(50, 0, 0);
  const targetCenter = new THREE.Vector3();

  const result = mergeShadowCoverage(baseCenter, 200, contributorCenter, 40, 20, targetCenter);

  assert.equal(result.extent, 200);
  assert.deepEqual(result.center.toArray(), [0, 0, 0]);
});

test('mergeShadowCoverage expands and recenters for a large nearby object', () => {
  const baseCenter = new THREE.Vector3(0, 0, 0);
  const contributorCenter = new THREE.Vector3(600, 0, 0);
  const targetCenter = new THREE.Vector3();

  const result = mergeShadowCoverage(baseCenter, 260, contributorCenter, 180, 60, targetCenter);

  assert.equal(result.extent, 540);
  assert.deepEqual(result.center.toArray(), [300, 0, 0]);
});
