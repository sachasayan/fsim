import * as THREE from 'three';

export function createTowerSystem({ scene, getTerrainHeight }) {
  const towerGroup = new THREE.Group();

  const towerX = -190;
  const towerZ = -300;
  const terrainY = getTerrainHeight(towerX, towerZ);

  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.84, metalness: 0.05 });
  const darkFrameMat = new THREE.MeshStandardMaterial({ color: 0x34383f, roughness: 0.62, metalness: 0.2 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2a35,
    roughness: 0.08,
    metalness: 0.1,
    transmission: 0.68,
    thickness: 0.28
  });
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x70757c, roughness: 0.7, metalness: 0.1 });

  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 10, 10), concreteMat);
  base.position.y = terrainY + 5;
  base.castShadow = true;
  base.receiveShadow = true;
  towerGroup.add(base);

  // Shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.2, 58, 10), concreteMat);
  shaft.position.y = terrainY + 34;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  towerGroup.add(shaft);

  // Mid platform
  const midPlatform = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 1.6, 12), platformMat);
  midPlatform.position.y = terrainY + 52;
  midPlatform.castShadow = true;
  midPlatform.receiveShadow = true;
  towerGroup.add(midPlatform);

  // Cab frame
  const cabFloorY = terrainY + 59;
  const cabHeight = 10;
  const cabOuter = new THREE.Mesh(new THREE.CylinderGeometry(12, 10, cabHeight, 12), darkFrameMat);
  cabOuter.position.y = cabFloorY;
  cabOuter.castShadow = true;
  cabOuter.receiveShadow = true;
  towerGroup.add(cabOuter);

  const cabGlass = new THREE.Mesh(new THREE.CylinderGeometry(11.2, 9.5, cabHeight - 1.2, 12, 1, true), glassMat);
  cabGlass.position.y = cabFloorY;
  towerGroup.add(cabGlass);

  const roof = new THREE.Mesh(new THREE.CylinderGeometry(10.2, 12.5, 2.2, 12), darkFrameMat);
  roof.position.y = cabFloorY + cabHeight * 0.5 + 1.1;
  roof.castShadow = true;
  roof.receiveShadow = true;
  towerGroup.add(roof);

  // Antenna mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 9, 8), darkFrameMat);
  mast.position.y = roof.position.y + 5.5;
  towerGroup.add(mast);

  // Emissive top lights (static)
  const beaconMatRed = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3333, emissiveIntensity: 20 });
  const beaconMatWhite = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff3cf, emissiveIntensity: 14 });
  const beaconGeo = new THREE.SphereGeometry(0.35, 8, 8);

  const beaconTop = new THREE.Mesh(beaconGeo, beaconMatRed);
  beaconTop.position.set(0, mast.position.y + 4.8, 0);
  towerGroup.add(beaconTop);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const b = new THREE.Mesh(beaconGeo, beaconMatWhite);
    b.position.set(Math.cos(a) * 8.8, cabFloorY + 3.2, Math.sin(a) * 8.8);
    towerGroup.add(b);
  }

  towerGroup.position.set(towerX, 0, towerZ);
  scene.add(towerGroup);

  return { towerGroup };
}
