// @ts-check

import * as THREE from 'three';

/**
 * @typedef {{
 *   active: boolean,
 *   life: number,
 *   maxLife: number,
 *   pos: THREE.Vector3,
 *   vel: THREE.Vector3,
 *   size: number,
 *   growth: number,
 *   r: number,
 *   g: number,
 *   b: number
 * }} ParticleEntry
 */

/**
 * @typedef {{
 *   scene: THREE.Scene
 * }} CreateParticleSystemArgs
 */

/**
 * @param {CreateParticleSystemArgs} args
 */
export function createParticleSystem({ scene }) {
  // Global Particle Texture (For Contrails/Smoke)
  const particleCanvas = document.createElement('canvas');
  particleCanvas.width = 64;
  particleCanvas.height = 64;
  const pCtx = particleCanvas.getContext('2d');
  if (!pCtx) {
    throw new Error('Failed to create particle canvas context');
  }
  const pGrad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  pGrad.addColorStop(0, 'rgba(255,255,255,1)');
  pGrad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  pGrad.addColorStop(1, 'rgba(255,255,255,0)');
  pCtx.fillStyle = pGrad;
  pCtx.fillRect(0, 0, 64, 64);
  const globalParticleTex = new THREE.CanvasTexture(particleCanvas);

  const MAX_PARTICLES = 1500;
  const particleGeo = new THREE.PlaneGeometry(1, 1);
  const particleMat = new THREE.MeshBasicMaterial({
    map: globalParticleTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending, // Changed from Additive so dark smoke renders correctly
    color: 0xffffff
  });

  const particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, MAX_PARTICLES);
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(particleMesh);

  /** @type {ParticleEntry[]} */
  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    particles.push({ active: false, life: 0, maxLife: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1, growth: 1, r: 1, g: 1, b: 1 });
    particleMesh.setColorAt(i, new THREE.Color(0x000000));

    const m = new THREE.Matrix4();
    m.scale(new THREE.Vector3(0, 0, 0));
    particleMesh.setMatrixAt(i, m);
  }
  let pIdx = 0;

  /**
   * @param {THREE.Vector3} pos
   * @param {THREE.Vector3} vel
   * @param {number} size
   * @param {number} growth
   * @param {number} life
   * @param {number} r
   * @param {number} g
   * @param {number} b
   */
  function spawnParticle(pos, vel, size, growth, life, r, g, b) {
    const p = particles[pIdx];
    p.active = true;
    p.life = life;
    p.maxLife = life;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.size = size;
    p.growth = growth;
    p.r = r;
    p.g = g;
    p.b = b;
    pIdx = (pIdx + 1) % MAX_PARTICLES;
  }

  const pDummy = new THREE.Object3D();
  const pColor = new THREE.Color();

  return { MAX_PARTICLES, particleMesh, particles, spawnParticle, pDummy, pColor };
}
