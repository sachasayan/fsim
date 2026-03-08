import * as THREE from 'three';

export function createCameraController({ camera, planeGroup, clouds, PHYSICS, AIRCRAFT, getTerrainHeight }) {
  const cameraParams = {
    distance: 80,
    height: 15,
    springFactor: 0.1
  };

  let cameraMode = 0;
  let isDragging = false;
  let camRotX = 0;
  let camRotY = 0;
  let targetCamRotX = 0;
  let targetCamRotY = 0;
  let shouldRubberBandToTarget = false;
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const localOffset = new THREE.Vector3();
  const idealPosition = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const cockpitPos = new THREE.Vector3();
  const towerPos = new THREE.Vector3(400, 50, -500);
  const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const lookQuat = new THREE.Quaternion();

  window.addEventListener('mousedown', () => {
    isDragging = true;
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging && cameraMode !== 2) {
      camRotX -= e.movementX * 0.005;
      camRotY -= e.movementY * 0.005;
      camRotY = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camRotY));
    }
  });

  window.addEventListener('wheel', (e) => {
    if (cameraMode === 0) {
      cameraParams.distance += e.deltaY * 0.05;
      cameraParams.distance = Math.max(30, Math.min(200, cameraParams.distance));
    }
  });

  function cycleMode() {
    cameraMode = (cameraMode + 1) % 3;
    if (cameraMode === 0) {
      shouldRubberBandToTarget = true;
    }
  }

  function getMode() {
    return cameraMode;
  }

  function updateCamera(dt = 0.016) {
    forward.set(0, 0, -1).applyQuaternion(planeGroup.quaternion);
    up.set(0, 1, 0).applyQuaternion(planeGroup.quaternion);

    if (!isDragging && shouldRubberBandToTarget) {
      // 0.05 was the original hardcoded value per frame at ~60fps
      const rotLerpFactor = 1.0 - Math.pow(1.0 - 0.05, dt * 60.0);
      camRotX += (targetCamRotX - camRotX) * rotLerpFactor;
      camRotY += (targetCamRotY - camRotY) * rotLerpFactor;

      if (Math.abs(targetCamRotX - camRotX) < 0.001 && Math.abs(targetCamRotY - camRotY) < 0.001) {
        camRotX = targetCamRotX;
        camRotY = targetCamRotY;
        shouldRubberBandToTarget = false;
      }
    }
    // ... rest of the logic ...

    if (cameraMode === 0) {
      localOffset.set(0, 0, cameraParams.distance);
      localOffset.applyAxisAngle(axisX, camRotY);
      localOffset.applyAxisAngle(axisY, camRotX);
      localOffset.applyQuaternion(planeGroup.quaternion);

      idealPosition.copy(planeGroup.position).add(localOffset).addScaledVector(up, cameraParams.height);

      const baseLerp = cameraParams.springFactor * 2; // Was 0.2 originally
      const posLerpFactor = 1.0 - Math.pow(1.0 - baseLerp, dt * 60.0);
      camera.position.lerp(idealPosition, posLerpFactor);

      lookTarget.copy(planeGroup.position).addScaledVector(forward, 10).addScaledVector(up, 5);
      camera.lookAt(lookTarget);

      camera.fov = 60 + (PHYSICS.airspeed / 340) * 15;

      let camTerrainY = 0;
      if (camera.position.y < 1000) {
        camTerrainY = getTerrainHeight(camera.position.x, camera.position.z);
      }
      const minHeight = Math.max(camTerrainY + 2, -8);
      if (camera.position.y < minHeight) {
        camera.position.y = minHeight;
        camera.lookAt(lookTarget);
      }
    } else if (cameraMode === 1) {
      cockpitPos.copy(planeGroup.position).addScaledVector(forward, 15).addScaledVector(up, 1.5);
      camera.position.copy(cockpitPos);

      lookEuler.set(camRotY - 0.1, camRotX, 0, 'YXZ');
      lookQuat.setFromEuler(lookEuler);
      camera.quaternion.copy(planeGroup.quaternion).multiply(lookQuat);
      camera.fov = 75;
    } else if (cameraMode === 2) {
      // 0.05 was the original hardcoded value
      const towerLerpFactor = 1.0 - Math.pow(1.0 - 0.05, dt * 60.0);
      camera.position.lerp(towerPos, towerLerpFactor);
      camera.lookAt(planeGroup.position);
      let dist = camera.position.distanceTo(planeGroup.position);
      camera.fov = Math.max(10, 60 - dist / 100);
    }

    let shakeIntensity = 0;
    if (PHYSICS.onGround && PHYSICS.airspeed > 10) {
      shakeIntensity += Math.pow(PHYSICS.airspeed / 100, 2) * 0.8;
    }
    if (PHYSICS.spoilers && !PHYSICS.onGround && PHYSICS.airspeed > 40) {
      shakeIntensity += (PHYSICS.airspeed / 150) * 0.6;
    }

    const currentAoaDeg = Math.abs(PHYSICS.aoa * (180 / Math.PI));
    if (!PHYSICS.onGround && currentAoaDeg > AIRCRAFT.stallAngle - 10) {
      let severity = Math.min(1.0, (currentAoaDeg - (AIRCRAFT.stallAngle - 10)) / 10);
      shakeIntensity += severity * 2.0;
    }

    if (shakeIntensity > 0 && cameraMode !== 2) {
      const modeMultiplier = cameraMode === 1 ? 1.0 : 0.4;
      const shakeAmt = shakeIntensity * modeMultiplier * (dt * 60.0);
      camera.position.x += (Math.random() - 0.5) * shakeAmt;
      camera.position.y += (Math.random() - 0.5) * shakeAmt;
      camera.position.z += (Math.random() - 0.5) * shakeAmt;

      if (cameraMode === 1) {
        camera.rotation.x += (Math.random() - 0.5) * shakeIntensity * 0.02 * (dt * 60.0);
        camera.rotation.z += (Math.random() - 0.5) * shakeIntensity * 0.02 * (dt * 60.0);
      }
    }

    camera.updateProjectionMatrix();
  }

  function snapToTarget() {
    // Force synchronous update of vectors based on current plane state
    forward.set(0, 0, -1).applyQuaternion(planeGroup.quaternion);
    up.set(0, 1, 0).applyQuaternion(planeGroup.quaternion);

    if (cameraMode === 0) {
      localOffset.set(0, 0, cameraParams.distance);
      localOffset.applyAxisAngle(axisX, camRotY);
      localOffset.applyAxisAngle(axisY, camRotX);
      localOffset.applyQuaternion(planeGroup.quaternion);

      idealPosition.copy(planeGroup.position).add(localOffset).addScaledVector(up, cameraParams.height);
      camera.position.copy(idealPosition);

      lookTarget.copy(planeGroup.position).addScaledVector(forward, 10).addScaledVector(up, 5);
      camera.lookAt(lookTarget);
    } else if (cameraMode === 1) {
      cockpitPos.copy(planeGroup.position).addScaledVector(forward, 15).addScaledVector(up, 1.5);
      camera.position.copy(cockpitPos);

      lookEuler.set(camRotY - 0.1, camRotX, 0, 'YXZ');
      lookQuat.setFromEuler(lookEuler);
      camera.quaternion.copy(planeGroup.quaternion).multiply(lookQuat);
    } else if (cameraMode === 2) {
      camera.position.copy(towerPos);
      camera.lookAt(planeGroup.position);
    }
    camera.updateProjectionMatrix();
  }

  function setRotation(x, y) {
    camRotX = x;
    camRotY = y;
    targetCamRotX = x;
    targetCamRotY = y;
    shouldRubberBandToTarget = false;
  }

  function recenterBehindAircraft() {
    targetCamRotX = 0;
    targetCamRotY = 0;
    shouldRubberBandToTarget = true;
  }

  function setDistance(d) {
    cameraParams.distance = d;
  }

  return { cycleMode, getMode, updateCamera, snapToTarget, setRotation, setDistance, recenterBehindAircraft };
}
