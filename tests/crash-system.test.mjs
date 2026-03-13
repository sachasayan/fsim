import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createCrashSystem,
  evaluateCrashImpact
} from '../js/modules/crash/CrashSystem.js';

function makeDocumentStub() {
  const nodes = new Map();
  return {
    getElementById(id) {
      if (!nodes.has(id)) {
        nodes.set(id, {
          style: {},
          innerText: ''
        });
      }
      return nodes.get(id);
    }
  };
}

function makeCrashHarness() {
  const scene = new THREE.Scene();
  const planeGroup = new THREE.Group();
  scene.add(planeGroup);
  const PHYSICS = {
    crashed: false,
    crashState: 'active',
    crashTimer: 0,
    crashReason: '',
    resetDelaySeconds: 5,
    throttle: 1,
    spoilers: false,
    brakes: false,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    velocity: new THREE.Vector3(0, -12, -80),
    angularVelocity: new THREE.Vector3(0.2, 0.1, 0.1)
  };
  const AIRCRAFT = { mass: 50000 };
  const physicsAdapter = {
    getRapier: () => null,
    setMainBodyActive() { }
  };
  let resetCalls = 0;

  const crashSystem = createCrashSystem({
    scene,
    physicsAdapter,
    getTerrainHeight: () => 0,
    planeGroup,
    AIRCRAFT,
    PHYSICS,
    spawnParticle: () => { },
    getBreakupPieceSpecs: () => [],
    onResetRequested: () => {
      resetCalls += 1;
    }
  });

  return { crashSystem, PHYSICS, getResetCalls: () => resetCalls };
}

test('evaluateCrashImpact ignores airborne frames without ground transition', () => {
  const result = evaluateCrashImpact({
    wasOnGround: false,
    isOnGround: false,
    velocity: new THREE.Vector3(0, -9, -70),
    angularVelocity: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion()
  });

  assert.equal(result.triggered, false);
});

test('evaluateCrashImpact triggers on excessive vertical touchdown speed', () => {
  const result = evaluateCrashImpact({
    wasOnGround: false,
    isOnGround: true,
    velocity: new THREE.Vector3(0, -8.4, -62),
    angularVelocity: new THREE.Vector3(0.1, 0.1, 0.1),
    quaternion: new THREE.Quaternion()
  });

  assert.equal(result.triggered, true);
  assert.match(result.reason, /IMPACT/);
});

test('evaluateCrashImpact allows firm but survivable landing', () => {
  const result = evaluateCrashImpact({
    wasOnGround: false,
    isOnGround: true,
    velocity: new THREE.Vector3(0, -3.2, -66),
    angularVelocity: new THREE.Vector3(0.05, 0.02, 0.03),
    quaternion: new THREE.Quaternion()
  });

  assert.equal(result.triggered, false);
});

test('crash system advances timer and auto-resets after five seconds even without debris pool', () => {
  const previousDocument = globalThis.document;
  globalThis.document = makeDocumentStub();

  try {
    const { crashSystem, PHYSICS, getResetCalls } = makeCrashHarness();
    crashSystem.beginCrash({ reason: 'TEST' });

    assert.equal(PHYSICS.crashState, 'breaking');
    crashSystem.update(4.9);
    assert.equal(getResetCalls(), 0);

    crashSystem.update(0.11);
    assert.equal(getResetCalls(), 1);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('crash system endCrash restores active flight state', () => {
  const previousDocument = globalThis.document;
  globalThis.document = makeDocumentStub();

  try {
    const { crashSystem, PHYSICS } = makeCrashHarness();
    crashSystem.beginCrash({ reason: 'TEST' });
    crashSystem.endCrash();

    assert.equal(PHYSICS.crashed, false);
    assert.equal(PHYSICS.crashState, 'active');
    assert.equal(PHYSICS.crashTimer, 0);
    assert.equal(PHYSICS.crashReason, '');
  } finally {
    globalThis.document = previousDocument;
  }
});
