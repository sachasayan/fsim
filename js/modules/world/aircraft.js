import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AIRCRAFT_CONFIG } from './aircraft_config.js';

export function createAircraftSystem({ scene }) {
  const planeGroup = new THREE.Group();
  scene.add(planeGroup);

  const engineExhausts = [];
  const movableSurfaces = { flaps: [], aileronsL: [], aileronsR: [], elevators: [], rudder: [], spoilers: [] };
  const pendingPivots = { flaps: [], aileronsL: [], aileronsR: [], elevators: [], rudder: [], spoilers: [] };
  const floatingTabs = { aileronL: null, aileronR: null, elevatorL: null, elevatorR: null };
  const gearGroup = new THREE.Group();
  const gearElements = [];
  const strobes = [];
  const beacons = [];

  // We'll add the loaded model to a wrapper so we can scale/rotate it
  const modelWrapper = new THREE.Group();
  modelWrapper.rotation.y = 0; // Model is backwards if Math.PI was used, so 0 should face it forward (or vice versa, we'll test)
  planeGroup.add(modelWrapper);

  const loader = new GLTFLoader();
  loader.load('./models/b738.glb', (gltf) => {
    const model = gltf.scene;

    // We don't want to scale down the model. Just center it horizontally and adjust Y.
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    // Base Y offset to ensure gears sit on ground and model isn't sunken too much
    model.position.y += 1.5;

    modelWrapper.add(model);

    // Best Practice: The GLB is a static export. However, the exact animation pivots 
    // were documented in the original FlightGear XML source files!
    // We load those explicit `center` and `axis` definitions instead of guessing math.
    function makePivot(mesh) {
      const config = AIRCRAFT_CONFIG.pivots[mesh.name];
      if (!config) return mesh;

      const [cx, cy, cz] = config.center;
      const pivotLocal = new THREE.Vector3(cx, cy, cz);

      // 1) The Rest Group: Holds the node's original complex hierarchy transforms
      const restGroup = new THREE.Group();
      restGroup.quaternion.copy(mesh.quaternion);
      restGroup.scale.copy(mesh.scale);

      // Project the exact XML vertex pivot mathematically through the mesh matrix 
      // so we know exactly where it sits in the parent's coordinate space!
      mesh.updateMatrix();
      const pivotParentSpace = pivotLocal.clone().applyMatrix4(mesh.matrix);
      restGroup.position.copy(pivotParentSpace);

      // 2) The Anim Group: Sits at [0,0,0] securely inside RestGroup.
      // This safely catches `setFromAxisAngle` without destroying the base rotations!
      const animGroup = new THREE.Group();
      const [ax, ay, az] = config.axis;
      // Native XML values, no axis scrambling needed.
      animGroup.userData.hingeAxis = new THREE.Vector3(ax, ay, az).normalize();

      // 3) Rebuild the tree
      mesh.parent.add(restGroup);
      restGroup.add(animGroup);
      animGroup.add(mesh);

      // 4) Rescue sub-meshes: If the exported mesh has strictly baked children (like undefined balance tabs),
      // dropping `mesh.quaternion` will permanently rotate their parent space and break their visual alignment.
      // By reparenting them directly to `animGroup`, they perfectly inherit the unmutated `RestGroup` rotation!
      const subMeshes = [...mesh.children];
      subMeshes.forEach(child => {
        animGroup.add(child);
        child.position.x -= cx;
        child.position.y -= cy;
        child.position.z -= cz;
      });

      // 5) Reverse the raw internal offset of the mesh and wipe its old transforms 
      // since RestGroup holds them perfectly now.
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
      mesh.position.set(-cx, -cy, -cz);

      return animGroup;
    }

    // Map movable surfaces
    model.traverse((child) => {
      if (child.isMesh || child.isGroup) {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }

        const name = child.name ? child.name.toLowerCase() : '';
        if (!name) return;

        // Hide floating boxes/artifacts that were exported with the model
        if (name === 'circle_006' || name.startsWith('a-light') || name.startsWith('eexit') || name.startsWith('slat')) {
          child.visible = false;
        }

        // Flaps
        if (name.includes('flap') && !name.includes('fairing')) pendingPivots.flaps.push(child);
        if (name.includes('slat') && !name.includes('fairing')) pendingPivots.flaps.push(child);

        // Ailerons
        if (name === 'lhaileron') pendingPivots.aileronsL.push(child);
        else if (name === 'rhaileron') pendingPivots.aileronsR.push(child);
        else if (name === 'ailerontablh') floatingTabs.aileronL = child;
        else if (name === 'ailerontabrh') floatingTabs.aileronR = child;

        // Elevators
        if (name === 'lhelevator') pendingPivots.elevators.push(child);
        if (name === 'rhelevator') pendingPivots.elevators.push(child);
        if (name === 'lhelevatortab') floatingTabs.elevatorL = child;
        if (name === 'rhelevatortab') floatingTabs.elevatorR = child;

        // Rudder
        if (name === 'rudder') pendingPivots.rudder.push(child);

        // Spoilers
        if (name.includes('spoiler')) pendingPivots.spoilers.push(child);

        // Engine exhausts
        if (name.includes('tailpipe')) engineExhausts.push(child);
      }
    });

    // Pass 1.5: Structurally rescue all floating sibling tabs by bolting them to their moving aerodynamic surfaces!
    // This prevents tabs from statically sticking to the fuselage while the wing trailing edge pitches away.
    if (floatingTabs.aileronL) {
      const parent = pendingPivots.aileronsL.find(a => a.name.toLowerCase() === 'lhaileron') || pendingPivots.aileronsL[0];
      if (parent) parent.attach(floatingTabs.aileronL);
    }
    if (floatingTabs.aileronR) {
      const parent = pendingPivots.aileronsR.find(a => a.name.toLowerCase() === 'rhaileron') || pendingPivots.aileronsR[0];
      if (parent) parent.attach(floatingTabs.aileronR);
    }
    if (floatingTabs.elevatorL) {
      const parent = pendingPivots.elevators.find(e => e.name.toLowerCase() === 'lhelevator');
      if (parent) parent.attach(floatingTabs.elevatorL);
    }
    if (floatingTabs.elevatorR) {
      const parent = pendingPivots.elevators.find(e => e.name.toLowerCase() === 'rhelevator');
      if (parent) parent.attach(floatingTabs.elevatorR);
    }

    // Pass 2: Apply tree transformations AFTER collection to prevent loop recursion
    pendingPivots.flaps.forEach(c => movableSurfaces.flaps.push(makePivot(c)));
    pendingPivots.aileronsL.forEach(c => movableSurfaces.aileronsL.push(makePivot(c)));
    pendingPivots.aileronsR.forEach(c => movableSurfaces.aileronsR.push(makePivot(c)));
    pendingPivots.elevators.forEach(c => movableSurfaces.elevators.push(makePivot(c)));
    pendingPivots.rudder.forEach(c => movableSurfaces.rudder.push(makePivot(c)));
    pendingPivots.spoilers.forEach(c => movableSurfaces.spoilers.push(makePivot(c)));

    modelWrapper.add(gearGroup); // Placeholder for future gear integration
  });

  const lightBulbGeo = new THREE.SphereGeometry(0.15, 10, 10);

  function addNavLight(color, x, y, z) {
    const light = new THREE.PointLight(color, 2, 20);
    light.position.set(x, y, z);

    const lens = new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: color,
      emissiveIntensity: 32
    }));
    light.add(lens);

    planeGroup.add(light);
    return light;
  }

  // Left Red
  addNavLight(0xff0000, -17.5, 2.0, 5);
  // Right Green
  addNavLight(0x00ff00, 17.5, 2.0, 5);

  function addStrobe(x, y, z) {
    const strobe = new THREE.PointLight(0xffffff, 0, 100);
    strobe.position.set(x, y, z);
    strobe.add(new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 80 })));
    planeGroup.add(strobe);
    strobes.push(strobe);
  }

  addStrobe(-18, 2.0, 5.5);
  addStrobe(18, 2.0, 5.5);
  addStrobe(0, 8.5, 17); // Tail strobe

  const beaconTop = new THREE.PointLight(0xff0000, 0, 50);
  beaconTop.position.set(0, 3.5, 0);
  beaconTop.add(new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0000, emissiveIntensity: 40 })));
  planeGroup.add(beaconTop);
  beacons.push(beaconTop);

  const beaconBot = new THREE.PointLight(0xff0000, 0, 50);
  beaconBot.position.set(0, -1.0, 2);
  beaconBot.add(new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0000, emissiveIntensity: 40 })));
  planeGroup.add(beaconBot);
  beacons.push(beaconBot);

  const landingLights = new THREE.Group();
  const llLeft = new THREE.SpotLight(0xffffff, 5, 2000, 0.2, 0.5, 0.1);
  llLeft.position.set(-2, 0, -5);
  llLeft.target.position.set(-2, 0, -100);

  const llRight = new THREE.SpotLight(0xffffff, 5, 2000, 0.2, 0.5, 0.1);
  llRight.position.set(2, 0, -5);
  llRight.target.position.set(2, 0, -100);

  landingLights.add(llLeft, llLeft.target, llRight, llRight.target);
  gearGroup.add(landingLights);
  planeGroup.add(gearGroup);

  function updateAircraftLOD(camera) {
    if (!camera) return;
    const dist = planeGroup.position.distanceTo(camera.position);

    // Hide high-detail parts when far away (> 4000 units)
    const isNear = dist < 4000;

    if (gearGroup.visible !== isNear) {
      gearGroup.visible = isNear;
      // Also hide movable surfaces if far
      Object.values(movableSurfaces).forEach(group => {
        group.forEach(mesh => mesh.visible = isNear);
      });
    }
  }

  function updateControlSurfaces(PHYSICS, dt) {
    // Helper to rotate a hingeGroup around its predefined custom axis
    const applyHinge = (group, angle) => {
      if (group.userData && group.userData.hingeAxis) {
        group.quaternion.setFromAxisAngle(group.userData.hingeAxis, angle);
      } else {
        // Fallback for parts without config
        group.rotation.x = angle;
      }
    };

    movableSurfaces.flaps.forEach(f => applyHinge(f, PHYSICS.flaps * 0.6));
    movableSurfaces.aileronsL.forEach(a => applyHinge(a, PHYSICS.aileron * 0.5));
    movableSurfaces.aileronsR.forEach(a => applyHinge(a, -PHYSICS.aileron * 0.5));
    movableSurfaces.elevators.forEach(e => applyHinge(e, -PHYSICS.elevator * 0.5));
    movableSurfaces.rudder.forEach(r => applyHinge(r, PHYSICS.rudder * 0.5));

    const targetSpoilerRot = PHYSICS.spoilers ? -0.8 : 0;
    movableSurfaces.spoilers.forEach(s => {
      // Need to store spoiler state manually since we are using quaternions
      if (s.userData.currentRot === undefined) s.userData.currentRot = 0;
      s.userData.currentRot += (targetSpoilerRot - s.userData.currentRot) * 10 * dt;
      applyHinge(s, s.userData.currentRot);
    });
  }

  return {
    planeGroup,
    engineExhausts,
    movableSurfaces,
    gearGroup,
    strobes,
    beacons,
    updateAircraftLOD,
    updateControlSurfaces
  };
}
