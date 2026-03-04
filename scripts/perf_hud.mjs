import { performance } from 'node:perf_hooks';
import * as THREE from 'three';

const PHYSICS = {
  airspeed: 100,
  position: new THREE.Vector3(0, 1000, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  quaternion: new THREE.Quaternion(),
  aoa: 0,
  slip: 0,
  heightAgl: 1000,
  throttle: 0.5,
  gForce: 1,
  gearTransition: 1,
  flaps: 0,
  spoilers: false,
  brakes: false
};

function originalCode() {
  const euler = new THREE.Euler().setFromQuaternion(PHYSICS.quaternion, 'YXZ');
  const pitch = euler.x * (180 / Math.PI);
  const roll = -euler.z * (180 / Math.PI);
  let heading = -euler.y * (180 / Math.PI);
  if (heading < 0) heading += 360;
  return pitch + roll + heading;
}

const eulerCached = new THREE.Euler();
function optimizedCode() {
  eulerCached.setFromQuaternion(PHYSICS.quaternion, 'YXZ');
  const pitch = eulerCached.x * (180 / Math.PI);
  const roll = -eulerCached.z * (180 / Math.PI);
  let heading = -eulerCached.y * (180 / Math.PI);
  if (heading < 0) heading += 360;
  return pitch + roll + heading;
}

function benchmark(name, fn, iterations) {
  let sink = 0;
  for (let i = 0; i < iterations / 10; i++) sink += fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) sink += fn();
  const end = performance.now();

  console.log(`${name}: ${(end - start).toFixed(2)}ms`);
  return end - start;
}

const iterations = 1000000;
console.log(`Benchmarking ${iterations} iterations...`);

const origTime = benchmark('Original', originalCode, iterations);
const optTime = benchmark('Optimized', optimizedCode, iterations);

console.log(`Improvement: ${((origTime - optTime) / origTime * 100).toFixed(2)}%`);
