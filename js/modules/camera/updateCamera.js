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
  }

  function getMode() {
    return cameraMode;
  }

  function updateCamera() {
    forward.set(0, 0, -1).applyQuaternion(planeGroup.quaternion);
    up.set(0, 1, 0).applyQuaternion(planeGroup.quaternion);

    if (!isDragging) {
      camRotX += (0 - camRotX) * 0.05;
      camRotY += (0 - camRotY) * 0.05;
    }

    if (cameraMode === 0) {
      localOffset.set(0, 0, cameraParams.distance);
      localOffset.applyAxisAngle(axisX, camRotY);
      localOffset.applyAxisAngle(axisY, camRotX);
      localOffset.applyQuaternion(planeGroup.quaternion);

      idealPosition.copy(planeGroup.position).add(localOffset).addScaledVector(up, cameraParams.height);

      camera.position.lerp(idealPosition, cameraParams.springFactor * 2);

      lookTarget.copy(planeGroup.position).addScaledVector(forward, 10).addScaledVector(up, 5);
      camera.lookAt(lookTarget);

      camera.fov = 60 + (PHYSICS.airspeed / 340) * 15;

      const camTerrainY = getTerrainHeight(camera.position.x, camera.position.z);
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
      camera.position.lerp(towerPos, 0.05);
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
      camera.position.x += (Math.random() - 0.5) * shakeIntensity * modeMultiplier;
      camera.position.y += (Math.random() - 0.5) * shakeIntensity * modeMultiplier;
      camera.position.z += (Math.random() - 0.5) * shakeIntensity * modeMultiplier;

      if (cameraMode === 1) {
        camera.rotation.x += (Math.random() - 0.5) * shakeIntensity * 0.02;
        camera.rotation.z += (Math.random() - 0.5) * shakeIntensity * 0.02;
      }
    }

    camera.updateProjectionMatrix();
  }

  return { cycleMode, getMode, updateCamera };
}
