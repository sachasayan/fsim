import * as THREE from 'three';

function buildFuselageTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Longitudinal cheatlines (Sides)
  const stripeW = 32;
  const stripeR = 8;
  [500, 1524].forEach(x => {
    ctx.fillStyle = '#003a8c';
    ctx.fillRect(x, 0, stripeW, canvas.height);
    ctx.fillStyle = '#d50032';
    ctx.fillRect(x + stripeW + 4, 0, stripeR, canvas.height);
  });


  // Doors (L/R sides)
  function drawDoor(x, y) {
    ctx.fillStyle = 'rgba(205,205,205,0.72)';
    ctx.fillRect(x, y, 26, 64);
    ctx.strokeStyle = 'rgba(70,70,70,0.45)';
    ctx.strokeRect(x, y, 26, 64);
    ctx.fillStyle = 'rgba(15,15,15,0.75)';
    ctx.fillRect(x + 8, y + 8, 10, 12);
  }

  [240, 1240, 1700].forEach((x) => {
    drawDoor(x, 210);
    drawDoor(x, 752);
  });



  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function buildWingTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(95,95,95,0.35)';
  ctx.lineWidth = 2;
  for (let y = 120; y < 910; y += 120) {
    ctx.beginPath();
    ctx.moveTo(90, y);
    ctx.lineTo(930, y - 20);
    ctx.stroke();
  }


  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

export function createAircraftSystem({ scene, renderer }) {
  const planeGroup = new THREE.Group();
  scene.add(planeGroup);

  const engineFans = [];
  const engineExhausts = [];
  const movableSurfaces = { flaps: [], aileronsL: [], aileronsR: [], elevators: [], rudder: [], spoilers: [] };

  const fuselageTex = buildFuselageTexture(renderer);
  const wingTex = buildWingTexture(renderer);

  const fuselageMat = new THREE.MeshStandardMaterial({
    map: fuselageTex,
    roughness: 0.2,
    metalness: 0.42,
    side: THREE.DoubleSide
  });
  const wingMat = new THREE.MeshStandardMaterial({
    map: wingTex,
    roughness: 0.28,
    metalness: 0.55
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x12161b,
    roughness: 0.1,
    metalness: 0.5
  });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xb6b6b6, roughness: 0.26, metalness: 0.93 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x2e2e2e, roughness: 0.62, metalness: 0.35 });

  const fuselageGeo = new THREE.CylinderGeometry(2.2, 2.2, 34, 36, 1, false);
  fuselageGeo.rotateX(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
  fuselage.castShadow = true;
  fuselage.receiveShadow = true;
  planeGroup.add(fuselage);

  const nosePoints = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    nosePoints.push(new THREE.Vector2(Math.sin((t * Math.PI) / 2) * 2.2, Math.cos((t * Math.PI) / 2) * 6.2));
  }
  const noseGeo = new THREE.LatheGeometry(nosePoints, 36);
  noseGeo.rotateX(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, fuselageMat);
  nose.position.z = -17.1;
  nose.castShadow = true;
  planeGroup.add(nose);


  const cockpitGeo = new THREE.SphereGeometry(2.23, 24, 12, Math.PI * 0.3, Math.PI * 0.4, 0.35, 0.44);
  cockpitGeo.rotateX(Math.PI / 2);
  cockpitGeo.rotateZ(Math.PI / 2);
  const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
  cockpit.position.set(0, 0.45, -19.3);
  cockpit.rotation.x = -0.12;
  planeGroup.add(cockpit);

  const tailPoints = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    tailPoints.push(new THREE.Vector2(Math.max(2.2 * (1 - Math.pow(t, 1.45)), 0.3), t * 8.4));
  }
  const tailGeo = new THREE.LatheGeometry(tailPoints, 36);
  tailGeo.rotateX(Math.PI / 2);
  const tailCone = new THREE.Mesh(tailGeo, fuselageMat);
  tailCone.position.z = 17;
  tailCone.castShadow = true;
  planeGroup.add(tailCone);





  // Wing system
  const wingGroup = new THREE.Group();
  const wingGeo = new THREE.BoxGeometry(42, 0.62, 7.5, 34, 1, 10);
  const wingPos = wingGeo.attributes.position;
  for (let i = 0; i < wingPos.count; i++) {
    const x = wingPos.getX(i);
    let y = wingPos.getY(i);
    let z = wingPos.getZ(i);
    const dist = Math.abs(x);
    const zNorm = (z + 3.75) / 7.5;
    const thick = zNorm < 0.3 ? Math.sqrt(zNorm / 0.3) : 1.0 - (zNorm - 0.3) * 0.78;
    y *= thick;
    z += dist * 0.66;
    y += dist * 0.1;
    const taper = 1.0 - (dist / 21) * 0.7;
    z = (z - dist * 0.66) * taper + dist * 0.66 - 0.48;
    y *= Math.max(0.32, taper);
    wingPos.setXYZ(i, x, y, z);
  }
  wingGeo.computeVertexNormals();
  const wing = new THREE.Mesh(wingGeo, wingMat);
  wing.castShadow = true;
  wing.receiveShadow = true;
  wingGroup.add(wing);

  function wingTaperAtX(localX) {
    return 1.0 - (Math.abs(localX) / 21) * 0.7;
  }

  function wingSurfaceZ(localX, localZ) {
    const dist = Math.abs(localX);
    const taper = wingTaperAtX(localX);
    return dist * 0.66 + localZ * taper - 0.48;
  }

  function wingTopY(localX, localZ) {
    const dist = Math.abs(localX);
    const taper = wingTaperAtX(localX);
    const zNorm = (localZ + 3.75) / 7.5;
    const thick = zNorm < 0.3 ? Math.sqrt(zNorm / 0.3) : 1.0 - (zNorm - 0.3) * 0.78;
    let y = 0.31 * thick;
    y += dist * 0.1;
    y *= Math.max(0.32, taper);
    return y;
  }

  function addTrailingSurface(xStart, xEnd, zBase, chord, type) {
    const width = Math.abs(xEnd - xStart);
    const midX = (xStart + xEnd) / 2;
    const geo = new THREE.BoxGeometry(width - 0.1, 0.2, chord, Math.max(2, Math.floor(width / 2)), 1, 3);
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      let vy = pos.getY(i);
      let vz = pos.getZ(i);
      const worldX = midX + vx;
      const dist = Math.abs(worldX);
      const taper = 1.0 - (dist / 21) * 0.7;
      vz *= taper;
      vy *= taper;
      vy *= 1.0 - ((vz + chord / 2) / chord) * 0.8;
      pos.setXYZ(i, vx, vy, vz);
    }

    geo.computeVertexNormals();
    geo.translate(0, 0, chord / 2);
    const mesh = new THREE.Mesh(geo, wingMat);
    const taper = wingTaperAtX(midX);
    const frontEdgeZ = wingSurfaceZ(midX, zBase) - chord * taper + 0.02;
    const y = wingTopY(midX, zBase - chord * 0.5) - 0.03;
    mesh.position.set(midX, y, frontEdgeZ);
    wingGroup.add(mesh);
    movableSurfaces[type].push(mesh);
  }

  addTrailingSurface(-14, -3, 3.75, 2.5, 'flaps');
  addTrailingSurface(-20.6, -14.2, 3.75, 1.8, 'aileronsL');
  addTrailingSurface(3, 14, 3.75, 2.5, 'flaps');
  addTrailingSurface(14.2, 20.6, 3.75, 1.8, 'aileronsR');

  function addSpoiler(xStart, xEnd, zBase, chord) {
    const width = Math.abs(xEnd - xStart);
    const midX = (xStart + xEnd) / 2;
    const geo = new THREE.BoxGeometry(width - 0.2, 0.05, chord);
    geo.translate(0, 0.025, chord / 2);
    const mesh = new THREE.Mesh(geo, wingMat);
    const y = wingTopY(midX, zBase) + 0.01;
    mesh.position.set(midX, y, wingSurfaceZ(midX, zBase));
    wingGroup.add(mesh);
    movableSurfaces.spoilers.push(mesh);
  }

  addSpoiler(-13.5, -3.5, 2.2, 1.2);
  addSpoiler(3.5, 13.5, 2.2, 1.2);




  const wingletGeo = new THREE.BoxGeometry(0.22, 3.7, 2.1);
  const wingletPos = wingletGeo.attributes.position;
  for (let i = 0; i < wingletPos.count; i++) {
    const wy = wingletPos.getY(i);
    let wz = wingletPos.getZ(i);
    if (wy > 0) wz += 1.7;
    const taper = 1.0 - Math.abs(wy / 1.85) * 0.5;
    wingletPos.setZ(i, (wz - 1.5) * taper + 1.5);
  }
  wingletGeo.computeVertexNormals();

  const wingletL = new THREE.Mesh(wingletGeo, wingMat);
  wingletL.position.set(-20.9, 2.05, 14.6);
  wingletL.rotation.set(-0.2, 0, -0.3);
  wingGroup.add(wingletL);

  const wingletR = new THREE.Mesh(wingletGeo, wingMat);
  wingletR.position.set(20.9, 2.05, 14.6);
  wingletR.rotation.set(-0.2, 0, 0.3);
  wingGroup.add(wingletR);

  wingGroup.position.set(0, -1.0, 1);
  planeGroup.add(wingGroup);

  // Empennage
  const empennage = new THREE.Group();
  const vTailGeo = new THREE.BoxGeometry(0.55, 9.4, 5.4);
  const vTailPos = vTailGeo.attributes.position;
  for (let i = 0; i < vTailPos.count; i++) {
    const y = vTailPos.getY(i);
    let z = vTailPos.getZ(i);
    if (y > 0) z += 5.4;
    const taper = 1.0 - (Math.abs(y) / 4.7) * 0.6;
    vTailPos.setZ(i, (z - 2.7) * taper + 2.7);
  }
  vTailGeo.computeVertexNormals();
  const vTail = new THREE.Mesh(vTailGeo, wingMat);
  vTail.position.set(0, 5.1, 20.1);
  empennage.add(vTail);

  const rudderGeo = new THREE.BoxGeometry(0.42, 8.8, 2.8);
  const rudderPos = rudderGeo.attributes.position;
  for (let i = 0; i < rudderPos.count; i++) {
    const y = rudderPos.getY(i);
    let z = rudderPos.getZ(i);
    if (y > 0) z += 4.8;
    const taper = 1.0 - (Math.abs(y) / 4.4) * 0.6;
    rudderPos.setXYZ(i, rudderPos.getX(i) * taper, y, (z - 1.4) * taper + 1.4);
  }
  rudderGeo.computeVertexNormals();
  rudderGeo.translate(0, 0, 1.4);
  const rudder = new THREE.Mesh(rudderGeo, wingMat);
  rudder.position.set(0, 5.25, 22.65);
  empennage.add(rudder);
  movableSurfaces.rudder.push(rudder);

  const hTailGeo = new THREE.BoxGeometry(16.4, 0.42, 3.6);
  const hTailPos = hTailGeo.attributes.position;
  for (let i = 0; i < hTailPos.count; i++) {
    const x = hTailPos.getX(i);
    let y = hTailPos.getY(i);
    let z = hTailPos.getZ(i);
    const dist = Math.abs(x);
    z += dist * 0.62;
    y += dist * 0.08;
    const taper = 1.0 - (dist / 8.2) * 0.6;
    hTailPos.setXYZ(i, x, y * taper, (z - 1.8) * taper + 1.8);
  }
  hTailGeo.computeVertexNormals();
  const hTail = new THREE.Mesh(hTailGeo, wingMat);
  hTail.position.set(0, 1.2, 22.5);
  empennage.add(hTail);

  const elevGeo = new THREE.BoxGeometry(7.9, 0.2, 2.0);
  elevGeo.translate(0, 0, 1.0);
  function addElevator(xStart, xEnd) {
    const midX = (xStart + xEnd) / 2;
    const mesh = new THREE.Mesh(elevGeo, wingMat);
    const dist = Math.abs(midX);
    const taper = 1.0 - (dist / 8.0) * 0.6;
    mesh.scale.set(1, taper, taper);
    mesh.position.set(midX, 1.2 + dist * 0.08, 24.25 + dist * 0.6);
    empennage.add(mesh);
    movableSurfaces.elevators.push(mesh);
  }

  addElevator(-7.9, -0.2);
  addElevator(0.2, 7.9);
  planeGroup.add(empennage);


  function createEngine(x, z) {
    const engGroup = new THREE.Group();

    const cowlGeo = new THREE.CylinderGeometry(1.62, 1.36, 5.9, 36);
    cowlGeo.rotateX(Math.PI / 2);
    const cowlPos = cowlGeo.attributes.position;
    for (let i = 0; i < cowlPos.count; i++) {
      const y = cowlPos.getY(i);
      if (y < -1.0) cowlPos.setY(i, -1.0 - (y + 1.0) * 0.24);
    }
    cowlGeo.computeVertexNormals();

    const cowl = new THREE.Mesh(cowlGeo, fuselageMat);
    cowl.castShadow = true;
    engGroup.add(cowl);





    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.8,
      metalness: 0.1
    });

    const pylonRoot = new THREE.Mesh(new THREE.BoxGeometry(0.56, 2.25, 4.2), wingMat);
    pylonRoot.position.set(0, 1.62, -0.45);
    pylonRoot.rotation.x = 0.11;
    engGroup.add(pylonRoot);


    engGroup.position.set(x, -2.2, z);
    return engGroup;
  }

  planeGroup.add(createEngine(-7.5, 0));
  planeGroup.add(createEngine(7.5, 0));

  // Landing gear
  const gearGroup = new THREE.Group();
  const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9, metalness: 0.15 });
  const strutMat = new THREE.MeshStandardMaterial({ color: 0xb6b6b6, metalness: 0.88, roughness: 0.2 });

  function createNoseGear() {
    const g = new THREE.Group();

    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3), strutMat);
    strut.position.y = -1.5;
    g.add(strut);


    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8), strutMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = -3.0;
    g.add(axle);

    const w1 = new THREE.Mesh(tireGeo, tireMat);
    w1.position.set(-0.4, -3.0, 0);
    const w2 = new THREE.Mesh(tireGeo, tireMat);
    w2.position.set(0.4, -3.0, 0);
    g.add(w1, w2);


    g.position.set(0, -0.5, -15);
    return g;
  }

  function createMainGear(x) {
    const g = new THREE.Group();

    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.5), strutMat);
    strut.position.y = -1.75;
    g.add(strut);


    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 1.8), strutMat);
    beam.position.y = -3.5;
    g.add(beam);

    [[-0.4, -3.5, -0.6], [0.4, -3.5, -0.6], [-0.4, -3.5, 0.6], [0.4, -3.5, 0.6]].forEach((pos) => {
      const wheel = new THREE.Mesh(tireGeo, tireMat);
      wheel.position.set(...pos);
      g.add(wheel);
    });


    g.position.set(x, -0.5, 3);
    return g;
  }

  gearGroup.add(createNoseGear(), createMainGear(-4.5), createMainGear(4.5));


  const strobes = [];
  const beacons = [];
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

  addNavLight(0xff0000, -21, 2.0, 15);
  addNavLight(0x00ff00, 21, 2.0, 15);

  function addStrobe(x, y, z) {
    const strobe = new THREE.PointLight(0xffffff, 0, 100);
    strobe.position.set(x, y, z);
    strobe.add(new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 80 })));
    planeGroup.add(strobe);
    strobes.push(strobe);
  }

  addStrobe(-21.5, 2.0, 15.5);
  addStrobe(21.5, 2.0, 15.5);
  addStrobe(0, 9.5, 24);

  const beaconTop = new THREE.PointLight(0xff0000, 0, 50);
  beaconTop.position.set(0, 2.5, 0);
  beaconTop.add(new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0000, emissiveIntensity: 40 })));
  planeGroup.add(beaconTop);
  beacons.push(beaconTop);

  const beaconBot = new THREE.PointLight(0xff0000, 0, 50);
  beaconBot.position.set(0, -2.5, 0);
  beaconBot.add(new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0000, emissiveIntensity: 40 })));
  planeGroup.add(beaconBot);
  beacons.push(beaconBot);

  const landingLights = new THREE.Group();
  const llLeft = new THREE.SpotLight(0xffffff, 5, 2000, 0.2, 0.5, 0.1);
  llLeft.position.set(-3, -1, -5);
  llLeft.target.position.set(-3, -1, -100);

  const llRight = new THREE.SpotLight(0xffffff, 5, 2000, 0.2, 0.5, 0.1);
  llRight.position.set(3, -1, -5);
  llRight.target.position.set(3, -1, -100);

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

  return {
    planeGroup,
    engineExhausts,
    movableSurfaces,
    gearGroup,
    strobes,
    beacons,
    updateAircraftLOD
  };
}
