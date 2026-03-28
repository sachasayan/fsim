// @ts-check

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AIRCRAFT_BREAKUP_PIECES } from './aircraft_breakup.js';

type AircraftPhysicsLike = {
  flaps: number;
  aileron: number;
  elevator: number;
  rudder: number;
  spoilers: boolean;
};

type MarkerObject = THREE.Object3D & { intensity?: number; userData: Record<string, any> & { baseIntensity?: number } };
type HingedObject = THREE.Object3D & { userData: Record<string, any> & { hingeAxis?: THREE.Vector3; currentRot?: number } };
type AircraftSystemArgs = { scene: THREE.Scene };
type LoadedGltf = Awaited<ReturnType<typeof GLTFLoader.prototype.loadAsync>>;
type AircraftSystem = {
  planeGroup: THREE.Group;
  engineExhausts: THREE.Object3D[];
  movableSurfaces: {
    flaps: HingedObject[];
    aileronsL: HingedObject[];
    aileronsR: HingedObject[];
    elevators: HingedObject[];
    rudder: HingedObject[];
    spoilers: HingedObject[];
    gears: Array<{ animGroup: HingedObject; type: string }>;
  };
  gearGroup: THREE.Group;
  strobes: MarkerObject[];
  beacons: MarkerObject[];
  getBreakupPieceSpecs: () => Array<(typeof AIRCRAFT_BREAKUP_PIECES)[number] & { sourceObjects: THREE.Object3D[]; localPosition: THREE.Vector3; localQuaternion: THREE.Quaternion }>;
  updateAircraftLOD: (camera?: THREE.Camera | null) => void;
  updateControlSurfaces: (PHYSICS: AircraftPhysicsLike, dt: number) => void;
};

/**
 * @param {AircraftSystemArgs} args
 * @returns {AircraftSystem}
 */
export function createAircraftSystem({ scene }) {
  const planeGroup = new THREE.Group();
  scene.add(planeGroup);

  const engineExhausts = [];
  const movableSurfaces = { flaps: [], aileronsL: [], aileronsR: [], elevators: [], rudder: [], spoilers: [], gears: [] };
  const pendingPivots = { flaps: [], aileronsL: [], aileronsR: [], elevators: [], rudder: [], spoilers: [] };
  const floatingTabs = { aileronL: null, aileronR: null, elevatorL: null, elevatorR: null };
  const gearGroup = new THREE.Group();
  const strobes = [];
  const beacons = [];
  const breakupSourceLookup = new Map();
  let breakupPieceSpecs = [];

  // We'll add the loaded model to a wrapper so we can scale/rotate it
  const modelWrapper = new THREE.Group();
  modelWrapper.rotation.y = 0; // Model is backwards if Math.PI was used, so 0 should face it forward (or vice versa, we'll test)
  planeGroup.add(modelWrapper);

  const loader = new GLTFLoader();

  /**
   * @param {string} url
   * @returns {Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>}
   */
  const loadGltf = (url) => new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

  Promise.all([
    loadGltf('./models/b738.glb'),
    loadGltf('./models/nosegear.glb'),
    loadGltf('./models/lwing.glb'),
    loadGltf('./models/rwing.glb'),
    fetch('./js/modules/world/aircraft_config.json').then(r => r.json())
  ]).then(([mainGltf, noseGltf, lwingGltf, rwingGltf, AIRCRAFT_CONFIG]) => {
    const mainScene = (mainGltf as LoadedGltf).scene;
    const noseScene = (noseGltf as LoadedGltf).scene;
    const lwingScene = (lwingGltf as LoadedGltf).scene;
    const rwingScene = (rwingGltf as LoadedGltf).scene;
    const model = mainScene;

    /**
     * @param {string | null | undefined} name
     * @param {THREE.Object3D | null | undefined} object
     */
    const registerBreakupSource = (name, object) => {
      if (!name || !object) return;
      breakupSourceLookup.set(name.toLowerCase(), object);
    };

    /**
     * @param {THREE.Object3D} scene
     * @param {string[]} partsList
     * @param {[number, number, number]} center
     * @param {[number, number, number]} axis
     * @param {string | null} [breakupAlias]
     * @returns {HingedObject}
     */
    const extractGearCluster = (scene, partsList, center, axis, breakupAlias = null) => {
      const cluster = new THREE.Group();
      /** @type {THREE.Object3D[]} */
      const extractedChildren = [];

      // Collect first to prevent mutating the graph during traverse
      scene.traverse(child => {
        if (!child.isMesh && !child.isGroup) return;
        const name = child.name ? child.name.toLowerCase() : '';
        if (!name) return;
        if (partsList.some(k => name.includes(k))) {
          extractedChildren.push(child);
        }
      });

      // Move after traversal is safely finished
      extractedChildren.forEach(child => {
        child.position.set(0, 0, 0);
        child.rotation.set(0, -Math.PI / 2, 0);
        child.scale.set(1, 1, 1);
        cluster.add(child);
      });

      const [cx, cy, cz] = center;
      // Map XML [Long, Lat, Vert] natively to Root Three.js [Lat, Vert, Long] = [cy, cz, cx]
      const pivotWorld = new THREE.Vector3(cy, cz, cx);

      const restGroup = new THREE.Group();
      restGroup.position.copy(pivotWorld);

      /** @type {HingedObject} */
      const animGroup = /** @type {HingedObject} */ (new THREE.Group());
      const [ax, ay, az] = axis;
      animGroup.userData.hingeAxis = new THREE.Vector3(ay, az, ax).normalize();

      restGroup.add(animGroup);

      const meshOffset = new THREE.Group();
      meshOffset.position.copy(pivotWorld).negate();
      animGroup.add(meshOffset);
      meshOffset.add(cluster);

      model.add(restGroup);
      if (breakupAlias) registerBreakupSource(breakupAlias, animGroup);
      return animGroup;
    };

    movableSurfaces.gears.push({
      animGroup: extractGearCluster(noseScene, ['ngrim', 'ngtyre', 'nlink', 'nlower', 'noseaxle', 'nouter', 'steercyl', 'collar'], [-15.5, 0, -1.22], [0, 1, 0], 'gear_nose'),
      type: 'nose'
    });

    movableSurfaces.gears.push({
      animGroup: extractGearCluster(noseScene, ['lhngdoor'], [-16.55, -0.53, -1.09], [1, 0, -0.09]),
      type: 'doorLH'
    });

    movableSurfaces.gears.push({
      animGroup: extractGearCluster(noseScene, ['rhngdoor'], [-16.55, 0.48, -1.09], [1, 0, -0.1]),
      type: 'doorRH'
    });

    movableSurfaces.gears.push({
      animGroup: extractGearCluster(lwingScene, ['mglh', 'sidestrutl', 'sidestrutu', 'mgouterstrut', 'geardoor', 'lhgd', 'lhdrag'], [-7.2, -2.88, -0.6], [1, 0, 0], 'gear_main_lh'),
      type: 'mainLH'
    });

    movableSurfaces.gears.push({
      animGroup: extractGearCluster(rwingScene, ['mgrh', 'rhsidestrut', 'geardoorrh', 'rhgd', 'rhdrag'], [-7.2, 2.88, -0.6], [1, 0, 0], 'gear_main_rh'),
      type: 'mainRH'
    });

    modelWrapper.add(model);

    // Best Practice: The GLB is a static export. However, the exact animation pivots 
    // were documented in the original FlightGear XML source files!
    // We load those explicit `center` and `axis` definitions instead of guessing math.
    /**
     * @param {THREE.Object3D} mesh
     * @returns {THREE.Object3D}
     */
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
      /** @type {HingedObject} */
      const animGroup = /** @type {HingedObject} */ (new THREE.Group());
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
        registerBreakupSource(name, child);

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
    pendingPivots.flaps.forEach(c => movableSurfaces.flaps.push(/** @type {HingedObject} */ (makePivot(c))));
    pendingPivots.aileronsL.forEach(c => movableSurfaces.aileronsL.push(/** @type {HingedObject} */ (makePivot(c))));
    pendingPivots.aileronsR.forEach(c => movableSurfaces.aileronsR.push(/** @type {HingedObject} */ (makePivot(c))));
    pendingPivots.elevators.forEach(c => movableSurfaces.elevators.push(/** @type {HingedObject} */ (makePivot(c))));
    pendingPivots.rudder.forEach(c => movableSurfaces.rudder.push(/** @type {HingedObject} */ (makePivot(c))));
    pendingPivots.spoilers.forEach(c => movableSurfaces.spoilers.push(/** @type {HingedObject} */ (makePivot(c))));

    modelWrapper.add(gearGroup); // Placeholder for future gear integration

    breakupPieceSpecs = AIRCRAFT_BREAKUP_PIECES.map((piece) => {
      const sourceObjects = piece.sourceNodeNames
        .map((name) => breakupSourceLookup.get(name.toLowerCase()))
        .filter(Boolean);
      if (sourceObjects.length === 0) return null;

      const first = sourceObjects[0];
      first.updateWorldMatrix(true, false);
      const localPosition = new THREE.Vector3();
      const localQuaternion = new THREE.Quaternion();
      const localScale = new THREE.Vector3();
      const planeInverse = new THREE.Matrix4().copy(planeGroup.matrixWorld).invert();
      const relative = new THREE.Matrix4().multiplyMatrices(planeInverse, first.matrixWorld);
      relative.decompose(localPosition, localQuaternion, localScale);

      return {
        ...piece,
        sourceObjects,
        localPosition,
        localQuaternion
      };
    }).filter(Boolean);
  });

  const lightBulbGeo = new THREE.SphereGeometry(0.15, 10, 10);

  /**
   * @param {number | string | THREE.Color} color
   * @param {number} emissiveIntensity
   * @returns {MarkerObject}
   */
  function createMarker(color, emissiveIntensity) {
    /** @type {MarkerObject} */
    const marker = /** @type {MarkerObject} */ (new THREE.Object3D());
    marker.intensity = 0;
    marker.userData.baseIntensity = emissiveIntensity;
    const lens = new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: color,
      emissiveIntensity
    }));
    marker.add(lens);
    return marker;
  }

  /**
   * @param {number | string | THREE.Color} color
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  function addNavLight(color, x, y, z) {
    const navMarker = createMarker(color, 20);
    navMarker.position.set(x, y, z);
    planeGroup.add(navMarker);
    return navMarker;
  }

  // Left Red
  addNavLight(0xff0000, -17.5, 2.0, 5);
  // Right Green
  addNavLight(0x00ff00, 17.5, 2.0, 5);

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  function addStrobe(x, y, z) {
    const strobe = createMarker(0xffffff, 70);
    strobe.position.set(x, y, z);
    planeGroup.add(strobe);
    strobes.push(strobe);
  }

  addStrobe(-18, 2.0, 5.5);
  addStrobe(18, 2.0, 5.5);
  addStrobe(0, 8.5, 17); // Tail strobe

  const beaconTop = createMarker(0xff0000, 35);
  beaconTop.position.set(0, 3.5, 0);
  planeGroup.add(beaconTop);
  beacons.push(beaconTop);

  const beaconBot = createMarker(0xff0000, 35);
  beaconBot.position.set(0, -1.0, 2);
  planeGroup.add(beaconBot);
  beacons.push(beaconBot);

  const landingLights = new THREE.Group();
  const llLeft = createMarker(0xfff2cc, 18);
  llLeft.position.set(-2, 0, -5);
  const llRight = createMarker(0xfff2cc, 18);
  llRight.position.set(2, 0, -5);
  landingLights.add(llLeft, llRight);
  gearGroup.add(landingLights);
  planeGroup.add(gearGroup);

  /**
   * @param {THREE.Camera | null | undefined} camera
   */
  function updateAircraftLOD(camera) {
    if (!camera) return;
    const dist = planeGroup.position.distanceTo(camera.position);

    // Hide high-detail parts when far away (> 4000 units)
    const isNear = dist < 4000;

    if (gearGroup.visible !== isNear) {
      gearGroup.visible = isNear;
      // Also hide movable surfaces if far
      Object.keys(movableSurfaces).forEach(key => {
        const group = movableSurfaces[key];
        if (key === 'gears') {
          group.forEach(g => g.animGroup.visible = isNear);
        } else {
          group.forEach(mesh => mesh.visible = isNear);
        }
      });
    }

  }

  /**
   * @param {AircraftPhysicsLike} PHYSICS
   * @param {number} dt
   */
  function updateControlSurfaces(PHYSICS, dt) {
    // Helper to rotate a hingeGroup around its predefined custom axis
    /**
     * @param {HingedObject} group
     * @param {number} angle
     */
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
    getBreakupPieceSpecs: () => breakupPieceSpecs,
    updateAircraftLOD,
    updateControlSurfaces
  };
}
