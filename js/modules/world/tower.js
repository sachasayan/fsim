import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export function createTowerSystem({ scene, getTerrainHeight }) {
  const towerGroup = new THREE.Group();

  const towerX = -190;
  const towerZ = -300;
  const terrainY = getTerrainHeight(towerX, towerZ);

  // Optimized Materials
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.84, metalness: 0.05 });
  const darkFrameMat = new THREE.MeshStandardMaterial({ color: 0x34383f, roughness: 0.62, metalness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1a2a35,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.4
  });
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x70757c, roughness: 0.7, metalness: 0.1 });

  // Merge Concrete Parts (Base, Shaft, Mid Platform)
  const baseGeo = new THREE.CylinderGeometry(8, 10, 10, 10);
  baseGeo.translate(0, terrainY + 5, 0);

  const shaftGeo = new THREE.CylinderGeometry(5.2, 6.2, 58, 10);
  shaftGeo.translate(0, terrainY + 34, 0);

  const midGeo = new THREE.CylinderGeometry(8.5, 8.5, 1.6, 12);
  midGeo.translate(0, terrainY + 52, 0);

  const concreteGeo = BufferGeometryUtils.mergeGeometries([baseGeo, shaftGeo, midGeo]);
  const concreteMesh = new THREE.Mesh(concreteGeo, concreteMat);
  concreteMesh.castShadow = true;
  concreteMesh.receiveShadow = true;
  towerGroup.add(concreteMesh);

  // Cab and Roof
  const cabFloorY = terrainY + 59;
  const cabHeight = 10;

  const cabOuterGeo = new THREE.CylinderGeometry(12, 10, cabHeight, 12);
  cabOuterGeo.translate(0, cabFloorY, 0);

  const roofGeo = new THREE.CylinderGeometry(10.2, 12.5, 2.2, 12);
  const roofY = cabFloorY + cabHeight * 0.5 + 1.1;
  roofGeo.translate(0, roofY, 0);

  const mastGeo = new THREE.CylinderGeometry(0.22, 0.28, 9, 8);
  mastGeo.translate(0, roofY + 5.5, 0);

  const frameGeo = BufferGeometryUtils.mergeGeometries([cabOuterGeo, roofGeo, mastGeo]);
  const frameMesh = new THREE.Mesh(frameGeo, darkFrameMat);
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  towerGroup.add(frameMesh);

  // Glass (Now using StandardMaterial)
  const glassGeo = new THREE.CylinderGeometry(11.2, 9.5, cabHeight - 1.2, 12, 1, true);
  glassGeo.translate(0, cabFloorY, 0);
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  towerGroup.add(glassMesh);

  // Beacons
  const beaconMatRed = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3333, emissiveIntensity: 20 });
  const beaconMatWhite = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff3cf, emissiveIntensity: 14 });
  const beaconGeoBase = new THREE.SphereGeometry(0.35, 8, 8);

  // Top beacon (separate for red)
  const beaconTop = new THREE.Mesh(beaconGeoBase, beaconMatRed);
  beaconTop.position.set(0, roofY + 5.5 + 4.8, 0);
  towerGroup.add(beaconTop);

  // White beacons (merged)
  const whiteBeaconGeos = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const bGeo = beaconGeoBase.clone();
    bGeo.translate(Math.cos(a) * 8.8, cabFloorY + 3.2, Math.sin(a) * 8.8);
    whiteBeaconGeos.push(bGeo);
  }
  const mergedWhiteBeaconsGeo = BufferGeometryUtils.mergeGeometries(whiteBeaconGeos);
  const whiteBeaconsMesh = new THREE.Mesh(mergedWhiteBeaconsGeo, beaconMatWhite);
  towerGroup.add(whiteBeaconsMesh);

  towerGroup.position.set(towerX, 0, towerZ);
  scene.add(towerGroup);

  return { towerGroup };
}
