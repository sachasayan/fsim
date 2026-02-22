import * as THREE from 'three';

export function createAircraftSystem({ scene, renderer }) {
  const planeGroup = new THREE.Group();
  scene.add(planeGroup);

  const engineFans = [];
  const engineExhausts = [];
  const movableSurfaces = { flaps: [], aileronsL: [], aileronsR: [], elevators: [], rudder: [], spoilers: [] };

  const fuselageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.4 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xe5e5e5, roughness: 0.25, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.0, metalness: 1.0 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.9 });

  const fuseCanvas = document.createElement('canvas');
  fuseCanvas.width = 2048;
  fuseCanvas.height = 1024;
  const fCtx = fuseCanvas.getContext('2d');
  fCtx.fillStyle = '#ffffff';
  fCtx.fillRect(0, 0, 2048, 1024);
  fCtx.fillStyle = '#e0e0e0';
  fCtx.fillRect(0, 512, 2048, 512);
  fCtx.fillStyle = '#0033a0';
  fCtx.fillRect(0, 480, 2048, 40);
  fCtx.fillStyle = '#d50032';
  fCtx.fillRect(0, 520, 2048, 10);
  fCtx.fillStyle = '#0a0a0a';
  for (let side = 0; side < 2; side++) {
    let y = side === 0 ? 250 : 774;
    for (let x = 200; x < 1800; x += 30) {
      if (x % 400 < 60) {
        fCtx.fillStyle = '#bbbbbb';
        fCtx.fillRect(x, y - 20, 25, 50);
        fCtx.strokeStyle = '#555';
        fCtx.strokeRect(x, y - 20, 25, 50);
        fCtx.fillStyle = '#0a0a0a';
      } else {
        fCtx.fillRect(x, y, 12, 16);
      }
    }
  }
  const fuseTex = new THREE.CanvasTexture(fuseCanvas);
  fuseTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const texturedFuselageMat = new THREE.MeshStandardMaterial({ map: fuseTex, roughness: 0.15, metalness: 0.4 });

  const fuselageGeo = new THREE.CylinderGeometry(2.2, 2.2, 34, 64);
  fuselageGeo.rotateX(Math.PI / 2);
  fuselageGeo.rotateZ(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuselageGeo, texturedFuselageMat);
  fuselage.castShadow = true;
  fuselage.receiveShadow = true;
  planeGroup.add(fuselage);

  const nosePoints = [];
  for (let i = 0; i <= 20; i++) {
    let t = i / 20;
    nosePoints.push(new THREE.Vector2(Math.sin((t * Math.PI) / 2) * 2.2, Math.cos((t * Math.PI) / 2) * 6));
  }
  const noseGeo = new THREE.LatheGeometry(nosePoints, 64);
  noseGeo.rotateX(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, fuselageMat);
  nose.position.z = -17;
  nose.castShadow = true;
  planeGroup.add(nose);

  const cockpitGeo = new THREE.SphereGeometry(2.23, 32, 16, Math.PI * 0.3, Math.PI * 0.4, 0.4, 0.35);
  cockpitGeo.rotateX(Math.PI / 2);
  cockpitGeo.rotateZ(Math.PI / 2);
  const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
  cockpit.position.set(0, 0.4, -19.2);
  cockpit.rotation.x = -0.15;
  planeGroup.add(cockpit);

  const tailPoints = [];
  for (let i = 0; i <= 20; i++) {
    let t = i / 20;
    tailPoints.push(new THREE.Vector2(Math.max(2.2 * (1 - Math.pow(t, 1.5)), 0.3), t * 8));
  }
  const tailGeo = new THREE.LatheGeometry(tailPoints, 64);
  tailGeo.rotateX(Math.PI / 2);
  const tailCone = new THREE.Mesh(tailGeo, fuselageMat);
  tailCone.position.z = 17;
  tailCone.castShadow = true;
  planeGroup.add(tailCone);

  const apuGeo = new THREE.CylinderGeometry(0.3, 0.15, 0.6, 16);
  apuGeo.rotateX(Math.PI / 2);
  const apu = new THREE.Mesh(apuGeo, metalMat);
  apu.position.z = 25.3;
  planeGroup.add(apu);

  const bellyGeo = new THREE.CylinderGeometry(2.6, 2.6, 14, 32);
  bellyGeo.rotateZ(Math.PI / 2);
  bellyGeo.scale(1, 0.35, 1.2);
  const belly = new THREE.Mesh(bellyGeo, fuselageMat);
  belly.position.set(0, -1.8, 1.5);
  planeGroup.add(belly);

  const wingGroup = new THREE.Group();
  const wingGeo = new THREE.BoxGeometry(42, 0.6, 7.5, 32, 1, 8);
  const wingPos = wingGeo.attributes.position;
  for (let i = 0; i < wingPos.count; i++) {
    let x = wingPos.getX(i);
    let y = wingPos.getY(i);
    let z = wingPos.getZ(i);
    let dist = Math.abs(x);
    let zNorm = (z + 3.75) / 7.5;
    let thick = zNorm < 0.3 ? Math.sqrt(zNorm / 0.3) : 1.0 - (zNorm - 0.3) * 0.8;
    y *= thick;
    z += dist * 0.65;
    y += dist * 0.1;
    let taper = 1.0 - (dist / 21) * 0.7;
    z = (z - dist * 0.65) * taper + dist * 0.65 - 0.5;
    y *= Math.max(0.3, taper);
    wingPos.setXYZ(i, x, y, z);
  }
  wingGeo.computeVertexNormals();
  const wing = new THREE.Mesh(wingGeo, wingMat);
  wing.castShadow = true;
  wing.receiveShadow = true;
  wingGroup.add(wing);

  function addTrailingSurface(xStart, xEnd, zBase, chord, type) {
    let width = Math.abs(xEnd - xStart);
    let midX = (xStart + xEnd) / 2;
    let geo = new THREE.BoxGeometry(width - 0.1, 0.2, chord, Math.max(2, Math.floor(width / 2)), 1, 2);
    let pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let vx = pos.getX(i);
      let vy = pos.getY(i);
      let vz = pos.getZ(i);
      let worldX = midX + vx;
      let dist = Math.abs(worldX);
      let taper = 1.0 - (dist / 21) * 0.7;
      vz *= taper;
      vy *= taper;
      vy *= 1.0 - ((vz + chord / 2) / chord) * 0.8;
      pos.setXYZ(i, vx, vy, vz);
    }
    geo.computeVertexNormals();
    geo.translate(0, 0, chord / 2);
    let mesh = new THREE.Mesh(geo, wingMat);
    let dist = Math.abs(midX);
    let sweepZ = dist * 0.65;
    let dihedralY = dist * 0.1;
    let taper = 1.0 - (dist / 21) * 0.7;
    mesh.position.set(midX, dihedralY, sweepZ + zBase * taper - 0.5);
    wingGroup.add(mesh);
    movableSurfaces[type].push(mesh);
  }

  addTrailingSurface(-14, -3, 3.75, 2.5, 'flaps');
  addTrailingSurface(-20.5, -14.2, 3.75, 1.8, 'aileronsL');
  addTrailingSurface(3, 14, 3.75, 2.5, 'flaps');
  addTrailingSurface(14.2, 20.5, 3.75, 1.8, 'aileronsR');

  function addSpoiler(xStart, xEnd, zBase, chord) {
    let width = Math.abs(xEnd - xStart);
    let midX = (xStart + xEnd) / 2;
    let geo = new THREE.BoxGeometry(width - 0.2, 0.05, chord);
    geo.translate(0, 0.025, chord / 2);
    let mesh = new THREE.Mesh(geo, wingMat);
    let dist = Math.abs(midX);
    let sweepZ = dist * 0.65;
    let dihedralY = dist * 0.1;
    let taper = 1.0 - (dist / 21) * 0.7;
    mesh.position.set(midX, dihedralY + 0.12, sweepZ + zBase * taper - 0.5);
    wingGroup.add(mesh);
    movableSurfaces.spoilers.push(mesh);
  }
  addSpoiler(-13.5, -3.5, 2.2, 1.2);
  addSpoiler(3.5, 13.5, 2.2, 1.2);

  const fairingGeo = new THREE.CylinderGeometry(0.18, 0.05, 4.0, 16);
  fairingGeo.rotateX(Math.PI / 2);
  const fPos = fairingGeo.attributes.position;
  for (let i = 0; i < fPos.count; i++) {
    let fz = fPos.getZ(i);
    let fy = fPos.getY(i);
    if (fz < 0) {
      fPos.setY(i, fy * Math.max(0, 1.0 - Math.abs(fz) / 2.0));
    }
  }
  fairingGeo.computeVertexNormals();
  [-12, -9, -6, 6, 9, 12].forEach((fx) => {
    const fairing = new THREE.Mesh(fairingGeo, wingMat);
    let absX = Math.abs(fx);
    fairing.position.set(fx, absX * 0.1 - 0.4, 2.5 + absX * 0.65);
    wingGroup.add(fairing);
  });

  const wingletGeo = new THREE.BoxGeometry(0.2, 3.5, 2);
  const wingletPos = wingletGeo.attributes.position;
  for (let i = 0; i < wingletPos.count; i++) {
    let wy = wingletPos.getY(i);
    let wz = wingletPos.getZ(i);
    if (wy > 0) wz += 1.5;
    let taper = 1.0 - Math.abs(wy / 1.75) * 0.5;
    wingletPos.setZ(i, (wz - 1.5) * taper + 1.5);
  }
  wingletGeo.computeVertexNormals();
  const wingletL = new THREE.Mesh(wingletGeo, wingMat);
  wingletL.position.set(-20.9, 2.0, 14.5);
  wingletL.rotation.set(-0.2, 0, -0.3);
  wingGroup.add(wingletL);
  const wingletR = new THREE.Mesh(wingletGeo, wingMat);
  wingletR.position.set(20.9, 2.0, 14.5);
  wingletR.rotation.set(-0.2, 0, 0.3);
  wingGroup.add(wingletR);

  wingGroup.position.set(0, -1.0, 1);
  planeGroup.add(wingGroup);

  const empennage = new THREE.Group();
  const vTailGeo = new THREE.BoxGeometry(0.5, 9, 5);
  const vTailPos = vTailGeo.attributes.position;
  for (let i = 0; i < vTailPos.count; i++) {
    let y = vTailPos.getY(i);
    let z = vTailPos.getZ(i);
    if (y > 0) z += 5.0;
    let taper = 1.0 - (Math.abs(y) / 4.5) * 0.6;
    vTailPos.setZ(i, (z - 2.5) * taper + 2.5);
  }
  vTailGeo.computeVertexNormals();
  const vTail = new THREE.Mesh(vTailGeo, wingMat);
  vTail.position.set(0, 5, 20);
  empennage.add(vTail);

  const rudderGeo = new THREE.BoxGeometry(0.4, 8.5, 2.5);
  const rPos = rudderGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    let y = rPos.getY(i);
    let z = rPos.getZ(i);
    if (y > 0) z += 4.5;
    let taper = 1.0 - (Math.abs(y) / 4.25) * 0.6;
    rPos.setXYZ(i, rPos.getX(i) * taper, y, (z - 1.25) * taper + 1.25);
  }
  rudderGeo.computeVertexNormals();
  rudderGeo.translate(0, 0, 1.25);
  const rudder = new THREE.Mesh(rudderGeo, wingMat);
  rudder.position.set(0, 5.2, 22.5);
  empennage.add(rudder);
  movableSurfaces.rudder.push(rudder);

  const hTailGeo = new THREE.BoxGeometry(16, 0.4, 3.5);
  const hTailPos = hTailGeo.attributes.position;
  for (let i = 0; i < hTailPos.count; i++) {
    let x = hTailPos.getX(i);
    let y = hTailPos.getY(i);
    let z = hTailPos.getZ(i);
    let dist = Math.abs(x);
    z += dist * 0.6;
    y += dist * 0.08;
    let taper = 1.0 - (dist / 8) * 0.6;
    hTailPos.setXYZ(i, x, y * taper, (z - 1.75) * taper + 1.75);
  }
  hTailGeo.computeVertexNormals();
  const hTail = new THREE.Mesh(hTailGeo, wingMat);
  hTail.position.set(0, 1.2, 22.5);
  empennage.add(hTail);

  const elevGeo = new THREE.BoxGeometry(7.8, 0.2, 2.0);
  elevGeo.translate(0, 0, 1.0);
  function addElevator(xStart, xEnd) {
    let midX = (xStart + xEnd) / 2;
    let mesh = new THREE.Mesh(elevGeo, wingMat);
    let dist = Math.abs(midX);
    let taper = 1.0 - (dist / 8) * 0.6;
    mesh.scale.set(1, taper, taper);
    mesh.position.set(midX, 1.2 + dist * 0.08, 24.25 + dist * 0.6);
    empennage.add(mesh);
    movableSurfaces.elevators.push(mesh);
  }
  addElevator(-7.8, -0.2);
  addElevator(0.2, 7.8);

  planeGroup.add(empennage);

  const fanCanvas = document.createElement('canvas');
  fanCanvas.width = 256;
  fanCanvas.height = 256;
  const fanCtx = fanCanvas.getContext('2d');
  fanCtx.fillStyle = '#111';
  fanCtx.fillRect(0, 0, 256, 256);
  fanCtx.translate(128, 128);
  fanCtx.fillStyle = '#555';
  for (let i = 0; i < 24; i++) {
    fanCtx.rotate((Math.PI * 2) / 24);
    fanCtx.beginPath();
    fanCtx.moveTo(0, 0);
    fanCtx.lineTo(20, -120);
    fanCtx.lineTo(-10, -120);
    fanCtx.fill();
  }
  fanCtx.fillStyle = '#fff';
  fanCtx.beginPath();
  fanCtx.arc(0, 0, 20, 0, Math.PI);
  fanCtx.fill();
  const fanTex = new THREE.CanvasTexture(fanCanvas);
  const fanMat = new THREE.MeshStandardMaterial({ map: fanTex, roughness: 0.5, metalness: 0.5 });

  function createEngine(x, z) {
    const engGroup = new THREE.Group();
    const cowlGeo = new THREE.CylinderGeometry(1.6, 1.4, 5.5, 32);
    cowlGeo.rotateX(Math.PI / 2);
    const cowlPos = cowlGeo.attributes.position;
    for (let i = 0; i < cowlPos.count; i++) {
      let y = cowlPos.getY(i);
      if (y < -1.0) cowlPos.setY(i, -1.0 - (y + 1.0) * 0.2);
    }
    cowlGeo.computeVertexNormals();
    const cowl = new THREE.Mesh(cowlGeo, texturedFuselageMat);
    cowl.castShadow = true;
    engGroup.add(cowl);

    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.15, 16, 32), metalMat);
    lip.position.z = -2.75;
    engGroup.add(lip);

    const fan = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), fanMat);
    fan.position.z = -1.8;
    engGroup.add(fan);
    engineFans.push(fan);

    const exhaustGeo = new THREE.CylinderGeometry(0.8, 0.5, 2.0, 32);
    exhaustGeo.rotateX(Math.PI / 2);
    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.5, emissive: 0xff4400, emissiveIntensity: 0.0 });
    const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
    exhaust.position.z = 3.5;
    engGroup.add(exhaust);
    engineExhausts.push(exhaustMat);

    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.0, 4), wingMat);
    pylon.position.set(0, 1.5, -0.5);
    pylon.rotation.x = 0.1;
    engGroup.add(pylon);

    engGroup.position.set(x, -2.2, z);
    return engGroup;
  }
  planeGroup.add(createEngine(-7.5, 0));
  planeGroup.add(createEngine(7.5, 0));

  const gearGroup = new THREE.Group();
  const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const strutMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 });

  function createNoseGear() {
    const g = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3), strutMat);
    strut.position.y = -1.5;
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8), strutMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = -3.0;
    const w1 = new THREE.Mesh(tireGeo, tireMat);
    w1.position.set(-0.4, -3.0, 0);
    const w2 = new THREE.Mesh(tireGeo, tireMat);
    w2.position.set(0.4, -3.0, 0);
    g.add(strut, axle, w1, w2);
    g.position.set(0, -0.5, -15);
    return g;
  }

  function createMainGear(x) {
    const g = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.5), strutMat);
    strut.position.y = -1.75;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 1.8), strutMat);
    beam.position.y = -3.5;
    [[-0.4, -3.5, -0.6], [0.4, -3.5, -0.6], [-0.4, -3.5, 0.6], [0.4, -3.5, 0.6]].forEach((pos) => {
      let w = new THREE.Mesh(tireGeo, tireMat);
      w.position.set(...pos);
      g.add(w);
    });
    g.add(strut, beam);
    g.position.set(x, -0.5, 3);
    return g;
  }
  gearGroup.add(createNoseGear(), createMainGear(-4.5), createMainGear(4.5));

  const strobes = [];
  const beacons = [];
  const lightBulbGeo = new THREE.SphereGeometry(0.15, 8, 8);

  const redLight = new THREE.PointLight(0xff0000, 2, 20);
  redLight.position.set(-21, 2.0, 15);
  redLight.add(new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0000, emissiveIntensity: 30 })));
  planeGroup.add(redLight);

  const greenLight = new THREE.PointLight(0x00ff00, 2, 20);
  greenLight.position.set(21, 2.0, 15);
  greenLight.add(new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00ff00, emissiveIntensity: 30 })));
  planeGroup.add(greenLight);

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

  return {
    planeGroup,
    engineFans,
    engineExhausts,
    movableSurfaces,
    gearGroup,
    strobes,
    beacons
  };
}
