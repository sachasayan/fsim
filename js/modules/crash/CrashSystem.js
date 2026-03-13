import * as THREE from 'three';

export const DEFAULT_CRASH_THRESHOLDS = {
  verticalSpeed: 7.5,
  totalSpeed: 95,
  angularSpeed: 2.8,
  bankRadians: 1.05,
  pitchRadians: 0.7
};

export function evaluateCrashImpact({
  wasOnGround,
  isOnGround,
  velocity,
  angularVelocity,
  quaternion,
  thresholds = DEFAULT_CRASH_THRESHOLDS
}) {
  if (wasOnGround || !isOnGround) {
    return {
      triggered: false,
      impactSpeed: velocity.length(),
      impactVerticalSpeed: Math.max(0, -velocity.y),
      impactAngularSpeed: angularVelocity.length(),
      reason: ''
    };
  }

  const impactSpeed = velocity.length();
  const impactVerticalSpeed = Math.max(0, -velocity.y);
  const impactAngularSpeed = angularVelocity.length();
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
  const bank = Math.abs(euler.z);
  const pitch = Math.abs(euler.x);
  const attitudePenalty = bank > thresholds.bankRadians || pitch > thresholds.pitchRadians;

  const triggered = (
    impactVerticalSpeed >= thresholds.verticalSpeed ||
    (impactVerticalSpeed >= thresholds.verticalSpeed * 0.55 && impactSpeed >= thresholds.totalSpeed) ||
    (impactAngularSpeed >= thresholds.angularSpeed && impactSpeed >= thresholds.totalSpeed * 0.5) ||
    (attitudePenalty && impactVerticalSpeed >= thresholds.verticalSpeed * 0.6)
  );

  let reason = '';
  if (triggered) {
    reason = `IMPACT ${impactVerticalSpeed.toFixed(1)} M/S VS, ${impactSpeed.toFixed(0)} M/S GS`;
  }

  return {
    triggered,
    impactSpeed,
    impactVerticalSpeed,
    impactAngularSpeed,
    reason
  };
}

const tmpMatrix = new THREE.Matrix4();
const tmpInvMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpWorldPos = new THREE.Vector3();
const tmpWorldQuat = new THREE.Quaternion();
const tmpImpulse = new THREE.Vector3();
const tmpAngImpulse = new THREE.Vector3();
const tmpInheritedLinear = new THREE.Vector3();
const tmpOffsetVelocity = new THREE.Vector3();
const tmpTerrainVelocity = new THREE.Vector3();
const tmpTangentVelocity = new THREE.Vector3();
export function createCrashSystem({
  scene,
  physicsAdapter,
  getTerrainHeight,
  planeGroup,
  AIRCRAFT,
  PHYSICS,
  spawnParticle,
  getBreakupPieceSpecs,
  onResetRequested
}) {
  const debrisGroup = new THREE.Group();
  debrisGroup.visible = false;
  debrisGroup.name = 'CrashDebrisGroup';
  scene.add(debrisGroup);

  const pieces = [];
  let poolReady = false;
  let debrisActiveCount = 0;

  function createColliderDesc(RAPIER, collider) {
    if (collider.type === 'capsule') {
      return RAPIER.ColliderDesc.capsule(collider.halfHeight, collider.radius);
    }
    const [hx, hy, hz] = collider.halfExtents;
    return RAPIER.ColliderDesc.cuboid(hx, hy, hz);
  }

  function buildPieceVisual(spec) {
    const root = new THREE.Group();
    root.name = `CrashPiece:${spec.id}`;
    root.visible = false;
    root.matrixAutoUpdate = true;

    tmpInvMatrix.copy(planeGroup.matrixWorld).invert();
    for (const source of spec.sourceObjects) {
      source.updateWorldMatrix(true, false);
      const clone = source.clone(true);
      tmpMatrix.multiplyMatrices(tmpInvMatrix, source.matrixWorld);
      tmpMatrix.decompose(tmpPos, tmpQuat, tmpScale);
      clone.position.copy(tmpPos);
      clone.quaternion.copy(tmpQuat);
      clone.scale.copy(tmpScale);
      clone.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = spec.fxProfile === 'fire';
          node.receiveShadow = false;
          node.frustumCulled = false;
        }
      });
      root.add(clone);
    }
    return root;
  }

  function ensurePool() {
    if (poolReady) return true;
    const rapier = physicsAdapter.getRapier();
    const specs = getBreakupPieceSpecs?.();
    if (!rapier || !specs || specs.length === 0) return false;
    const { RAPIER, world } = rapier;

    for (const spec of specs) {
      const visual = buildPieceVisual(spec);
      debrisGroup.add(visual);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, -10000, 0)
          .setLinearDamping(0.1)
          .setAngularDamping(0.18)
          .setCcdEnabled(true)
      );
      world.createCollider(
        createColliderDesc(RAPIER, spec.collider)
          .setDensity(Math.max(12, AIRCRAFT.mass * spec.massFraction * 0.0012))
          .setFriction(0.22)
          .setRestitution(0.05),
        body
      );
      pieces.push({
        ...spec,
        visual,
        body,
        active: false,
        settled: false,
        bounceCount: 0,
        localPosition: spec.localPosition.clone(),
        localQuaternion: spec.localQuaternion.clone()
      });
    }

    poolReady = true;
    return true;
  }

  function emitImpactFx(position, fxProfile, velocityScale) {
    const burstCount = fxProfile === 'fire' ? 16 : 8;
    for (let i = 0; i < burstCount; i++) {
      const vel = tmpImpulse.set(
        (Math.random() - 0.5) * 14,
        Math.random() * 18 + velocityScale * 0.2,
        (Math.random() - 0.5) * 14
      );
      if (fxProfile === 'fire') {
        spawnParticle(position, vel, 9 + Math.random() * 8, 14, 2.2, 1.0, 0.3, 0.05);
      } else {
        spawnParticle(position, vel, 6 + Math.random() * 7, 10, 2.8, 0.4, 0.4, 0.4);
      }
    }
  }

  function beginCrash({
    reason = 'AIRFRAME FAILURE',
    baseVelocity = null,
    baseAngularVelocity = null
  } = {}) {
    ensurePool();

    PHYSICS.crashed = true;
    PHYSICS.crashState = 'breaking';
    PHYSICS.crashTimer = 0;
    PHYSICS.crashReason = reason;
    PHYSICS.throttle = 0;
    PHYSICS.spoilers = true;
    PHYSICS.brakes = false;

    planeGroup.visible = false;
    debrisGroup.visible = true;
    physicsAdapter.setMainBodyActive(false);

    if (!poolReady) return false;

    const inheritedVelocity = baseVelocity || PHYSICS.velocity;
    const inheritedAngularVelocity = baseAngularVelocity || PHYSICS.angularVelocity;
    const planePos = planeGroup.position;
    const planeQuat = planeGroup.quaternion;
    debrisActiveCount = 0;

    for (const piece of pieces) {
      piece.active = true;
      piece.settled = false;
      piece.bounceCount = 0;
      debrisActiveCount++;

      tmpWorldPos.copy(piece.localPosition).applyQuaternion(planeQuat).add(planePos);
      tmpWorldQuat.copy(planeQuat).multiply(piece.localQuaternion);
      piece.visual.visible = true;
      piece.visual.position.copy(tmpWorldPos);
      piece.visual.quaternion.copy(tmpWorldQuat);

      piece.body.setTranslation(tmpWorldPos, true);
      piece.body.setRotation(tmpWorldQuat, true);
      piece.body.resetForces(true);
      piece.body.resetTorques(true);

      tmpInheritedLinear.copy(inheritedVelocity);
      tmpOffsetVelocity.copy(piece.localPosition).applyQuaternion(planeQuat);
      tmpOffsetVelocity.cross(inheritedAngularVelocity);
      tmpImpulse
        .copy(tmpInheritedLinear)
        .add(tmpOffsetVelocity)
        .add(tmpAngImpulse.fromArray(piece.localImpulse).applyQuaternion(planeQuat));
      piece.body.setLinvel(tmpImpulse, true);

      tmpAngImpulse.fromArray(piece.angularImpulse).applyQuaternion(planeQuat).add(inheritedAngularVelocity);
      piece.body.setAngvel(tmpAngImpulse, true);

      emitImpactFx(tmpWorldPos, piece.fxProfile, inheritedVelocity.length());
    }

    return true;
  }

  function syncFocusFromDebris() {
    if (!debrisActiveCount) return;
    let focusPiece = null;
    for (const piece of pieces) {
      if (!piece.active) continue;
      if (!focusPiece || piece.massFraction > focusPiece.massFraction) focusPiece = piece;
    }
    if (!focusPiece) return;
    const p = focusPiece.body.translation();
    const q = focusPiece.body.rotation();
    PHYSICS.position.set(p.x, p.y, p.z);
    PHYSICS.quaternion.set(q.x, q.y, q.z, q.w);
    PHYSICS.velocity.set(0, 0, 0);
    PHYSICS.angularVelocity.set(0, 0, 0);
  }

  function updateDebrisStep(dt) {
    if (PHYSICS.crashState !== 'breaking') return;
    if (!poolReady) {
      PHYSICS.crashTimer += dt;
      if (PHYSICS.crashTimer >= PHYSICS.resetDelaySeconds) {
        onResetRequested?.();
      }
      return;
    }

    let activeMovingPieces = 0;
    for (const piece of pieces) {
      if (!piece.active || piece.settled) continue;
      const position = piece.body.translation();
      const velocity = piece.body.linvel();
      const angularVelocity = piece.body.angvel();
      const terrainY = getTerrainHeight(position.x, position.z) + piece.clearance;

      if (position.y <= terrainY) {
        const nextY = terrainY;
        tmpTerrainVelocity.set(velocity.x, velocity.y, velocity.z);
        const downward = Math.min(0, tmpTerrainVelocity.y);
        tmpTerrainVelocity.y = Math.max(0, -downward * 0.28);
        tmpTangentVelocity.set(tmpTerrainVelocity.x, 0, tmpTerrainVelocity.z).multiplyScalar(0.78);
        tmpTerrainVelocity.x = tmpTangentVelocity.x;
        tmpTerrainVelocity.z = tmpTangentVelocity.z;

        piece.body.setTranslation({ x: position.x, y: nextY, z: position.z }, true);
        piece.body.setLinvel(tmpTerrainVelocity, true);
        piece.body.setAngvel({
          x: angularVelocity.x * 0.82,
          y: angularVelocity.y * 0.82,
          z: angularVelocity.z * 0.82
        }, true);
        piece.bounceCount += 1;
      }

      const speedSq = piece.body.linvel().x ** 2 + piece.body.linvel().y ** 2 + piece.body.linvel().z ** 2;
      const angSq = piece.body.angvel().x ** 2 + piece.body.angvel().y ** 2 + piece.body.angvel().z ** 2;
      if (piece.bounceCount >= 2 && speedSq < 3.0 && angSq < 1.2) {
        piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        piece.settled = true;
      } else {
        activeMovingPieces++;
      }

      const p = piece.body.translation();
      const q = piece.body.rotation();
      piece.visual.position.set(p.x, p.y, p.z);
      piece.visual.quaternion.set(q.x, q.y, q.z, q.w);
    }

    syncFocusFromDebris();
    PHYSICS.crashTimer += dt;
    PHYSICS.crashState = activeMovingPieces > 0 ? 'breaking' : 'reset_pending';
    if (PHYSICS.crashTimer >= PHYSICS.resetDelaySeconds) {
      onResetRequested?.();
    }
  }

  function updateResetPending(dt) {
    if (PHYSICS.crashState !== 'reset_pending') return;
    PHYSICS.crashTimer += dt;
    if (PHYSICS.crashTimer >= PHYSICS.resetDelaySeconds) {
      onResetRequested?.();
    }
  }

  function endCrash() {
    PHYSICS.crashed = false;
    PHYSICS.crashState = 'active';
    PHYSICS.crashTimer = 0;
    PHYSICS.crashReason = '';
    debrisActiveCount = 0;

    for (const piece of pieces) {
      piece.active = false;
      piece.settled = false;
      piece.bounceCount = 0;
      piece.visual.visible = false;
      piece.visual.position.set(0, -10000, 0);
      piece.body.setTranslation({ x: 0, y: -10000, z: 0 }, true);
      piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    debrisGroup.visible = false;
    planeGroup.visible = true;
    physicsAdapter.setMainBodyActive(true);
  }

  function update(dt) {
    if (PHYSICS.crashState === 'breaking') {
      updateDebrisStep(dt);
    } else if (PHYSICS.crashState === 'reset_pending') {
      updateResetPending(dt);
    }
  }

  function getFocusPosition(target = new THREE.Vector3()) {
    if (PHYSICS.crashState === 'active') return target.copy(planeGroup.position);
    return target.copy(PHYSICS.position);
  }

  return {
    beginCrash,
    endCrash,
    update,
    getFocusPosition,
    ensurePool,
    isReady: () => poolReady,
    isBreaking: () => PHYSICS.crashState === 'breaking' || PHYSICS.crashState === 'reset_pending',
    getDebrisCount: () => pieces.length,
    getActiveDebrisCount: () => debrisActiveCount
  };
}
