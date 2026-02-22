import * as THREE from 'three';

function buildFuselageTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Lower fuselage tint and cheatline
  ctx.fillStyle = '#e2e2e2';
  ctx.fillRect(0, 520, canvas.width, 504);
  ctx.fillStyle = '#003a8c';
  ctx.fillRect(0, 486, canvas.width, 36);
  ctx.fillStyle = '#d50032';
  ctx.fillRect(0, 525, canvas.width, 8);

  // Panel seams and subtle grime
  ctx.strokeStyle = 'rgba(120,120,120,0.28)';
  ctx.lineWidth = 1;
  for (let x = 130; x < canvas.width - 100; x += 88) {
    ctx.beginPath();
    ctx.moveTo(x, 90);
    ctx.lineTo(x, 935);
    ctx.stroke();
  }

  for (let y = 170; y < 930; y += 130) {
    ctx.strokeStyle = y % 260 === 0 ? 'rgba(95,95,95,0.18)' : 'rgba(130,130,130,0.12)';
    ctx.beginPath();
    ctx.moveTo(120, y);
    ctx.lineTo(canvas.width - 120, y);
    ctx.stroke();
  }

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

  // Cabin windows and cockpit eyebrow windows
  for (let side = 0; side < 2; side++) {
    const y = side === 0 ? 255 : 770;
    for (let x = 220; x < 1790; x += 30) {
      const isExitBlock = x > 1180 && x < 1270;
      if (isExitBlock) {
        continue;
      }

      if (x % 420 < 65) {
        ctx.fillStyle = '#bdbdbd';
        ctx.fillRect(x, y - 18, 24, 48);
        ctx.strokeStyle = '#595959';
        ctx.strokeRect(x, y - 18, 24, 48);
      } else {
        const gradient = ctx.createLinearGradient(0, y, 0, y + 14);
        gradient.addColorStop(0, '#0f1114');
        gradient.addColorStop(1, '#1e2731');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, 12, 14);
      }
    }
  }

  ctx.fillStyle = '#10151b';
  ctx.fillRect(85, 245, 40, 12);
  ctx.fillRect(85, 765, 40, 12);

  // Emergency arrows
  ctx.fillStyle = '#111';
  for (const x of [1210, 1670]) {
    ctx.beginPath();
    ctx.moveTo(x, 315);
    ctx.lineTo(x + 20, 325);
    ctx.lineTo(x, 335);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, 690);
    ctx.lineTo(x + 20, 700);
    ctx.lineTo(x, 710);
    ctx.closePath();
    ctx.fill();
  }

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

  // Walkway markings
  ctx.fillStyle = 'rgba(30,30,30,0.34)';
  ctx.fillRect(260, 340, 500, 42);
  ctx.fillRect(240, 610, 520, 38);

  // Leading edge metal strip
  ctx.fillStyle = 'rgba(180,180,180,0.7)';
  ctx.fillRect(0, 120, canvas.width, 36);

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
    metalness: 0.42
  });
  const wingMat = new THREE.MeshStandardMaterial({
    map: wingTex,
    roughness: 0.28,
    metalness: 0.55
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x08121d,
    roughness: 0.02,
    metalness: 0.0,
    transmission: 0.7,
    thickness: 0.35,
    ior: 1.5,
    reflectivity: 0.9
  });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xb6b6b6, roughness: 0.26, metalness: 0.93 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x2e2e2e, roughness: 0.62, metalness: 0.35 });

  const fuselageGeo = new THREE.CylinderGeometry(2.2, 2.2, 34, 72, 1, false);
  fuselageGeo.rotateX(Math.PI / 2);
  fuselageGeo.rotateZ(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
  fuselage.castShadow = true;
  fuselage.receiveShadow = true;
  planeGroup.add(fuselage);

  const nosePoints = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    nosePoints.push(new THREE.Vector2(Math.sin((t * Math.PI) / 2) * 2.2, Math.cos((t * Math.PI) / 2) * 6.2));
  }
  const noseGeo = new THREE.LatheGeometry(nosePoints, 72);
  noseGeo.rotateX(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, fuselageMat);
  nose.position.z = -17.1;
  nose.castShadow = true;
  planeGroup.add(nose);

  const radomeRing = new THREE.Mesh(new THREE.TorusGeometry(2.18, 0.05, 10, 60), darkMetalMat);
  radomeRing.rotation.x = Math.PI / 2;
  radomeRing.position.z = -15.2;
  planeGroup.add(radomeRing);

  const cockpitGeo = new THREE.SphereGeometry(2.23, 40, 20, Math.PI * 0.3, Math.PI * 0.4, 0.35, 0.44);
  cockpitGeo.rotateX(Math.PI / 2);
  cockpitGeo.rotateZ(Math.PI / 2);
  const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
  cockpit.position.set(0, 0.4, -19.25);
  cockpit.rotation.x = -0.15;
  planeGroup.add(cockpit);

  const cockpitFrame = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.045, 8, 42, Math.PI * 1.35), darkMetalMat);
  cockpitFrame.rotation.set(Math.PI / 2, 0, Math.PI * 0.08);
  cockpitFrame.position.set(0, 0.44, -19.28);
  planeGroup.add(cockpitFrame);

  const tailPoints = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    tailPoints.push(new THREE.Vector2(Math.max(2.2 * (1 - Math.pow(t, 1.45)), 0.3), t * 8.4));
  }
  const tailGeo = new THREE.LatheGeometry(tailPoints, 72);
  tailGeo.rotateX(Math.PI / 2);
  const tailCone = new THREE.Mesh(tailGeo, fuselageMat);
  tailCone.position.z = 17;
  tailCone.castShadow = true;
  planeGroup.add(tailCone);

  const apuGeo = new THREE.CylinderGeometry(0.3, 0.14, 0.7, 22);
  apuGeo.rotateX(Math.PI / 2);
  const apu = new THREE.Mesh(apuGeo, metalMat);
  apu.position.z = 25.4;
  planeGroup.add(apu);

  // Belly fairing and static details
  const bellyGeo = new THREE.CylinderGeometry(2.65, 2.65, 14.5, 40);
  bellyGeo.rotateZ(Math.PI / 2);
  bellyGeo.scale(1, 0.34, 1.2);
  const belly = new THREE.Mesh(bellyGeo, fuselageMat);
  belly.position.set(0, -1.85, 1.6);
  belly.castShadow = true;
  planeGroup.add(belly);

  const satcomHump = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 3.8), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.35, metalness: 0.2 }));
  satcomHump.position.set(0, 2.28, 0.8);
  satcomHump.rotation.x = 0.04;
  planeGroup.add(satcomHump);

  const antennaTop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.42), darkMetalMat);
  antennaTop.position.set(0, 2.45, -5);
  planeGroup.add(antennaTop);

  const antennaBottom = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.34), darkMetalMat);
  antennaBottom.position.set(0, -2.55, 2);
  planeGroup.add(antennaBottom);

  // Passenger and cargo door geometry overlays
  function addDoorDetail(x, y, z, w, h) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), darkMetalMat);
    door.position.set(x, y, z);
    planeGroup.add(door);
  }

  [-12.1, 3.5, 11.8].forEach((z) => {
    addDoorDetail(-2.18, 0.65, z, 0.02, 1.9);
    addDoorDetail(2.18, 0.65, z, 0.02, 1.9);
  });
  addDoorDetail(-2.18, -0.45, 5.8, 0.02, 1.2);
  addDoorDetail(2.18, -0.45, 5.8, 0.02, 1.2);

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

  // Flap track fairings
  const fairingGeo = new THREE.CylinderGeometry(0.2, 0.04, 4.3, 16);
  fairingGeo.rotateX(Math.PI / 2);
  const fairingPos = fairingGeo.attributes.position;
  for (let i = 0; i < fairingPos.count; i++) {
    const fz = fairingPos.getZ(i);
    const fy = fairingPos.getY(i);
    if (fz < 0) {
      fairingPos.setY(i, fy * Math.max(0, 1.0 - Math.abs(fz) / 2.1));
    }
  }
  fairingGeo.computeVertexNormals();

  [-12.5, -9.1, -6.3, 6.3, 9.1, 12.5].forEach((fx) => {
    const fairing = new THREE.Mesh(fairingGeo, wingMat);
    const absX = Math.abs(fx);
    fairing.position.set(fx, absX * 0.1 - 0.42, 2.6 + absX * 0.66);
    wingGroup.add(fairing);
  });

  // Wing fences and pitot probes
  [-11.5, 11.5].forEach((fx) => {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.8), darkMetalMat);
    fence.position.set(fx, 0.85, 6.2 + Math.abs(fx) * 0.62);
    wingGroup.add(fence);
  });

  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.01, 0.85, 10), metalMat);
  pitot.rotation.z = Math.PI / 2;
  pitot.position.set(0.42, 0.62, -22.2);
  planeGroup.add(pitot);

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

  // Engine fan texture
  const fanCanvas = document.createElement('canvas');
  fanCanvas.width = 256;
  fanCanvas.height = 256;
  const fanCtx = fanCanvas.getContext('2d');
  fanCtx.fillStyle = '#090909';
  fanCtx.fillRect(0, 0, 256, 256);
  fanCtx.translate(128, 128);
  fanCtx.fillStyle = '#5a5a5a';
  for (let i = 0; i < 28; i++) {
    fanCtx.rotate((Math.PI * 2) / 28);
    fanCtx.beginPath();
    fanCtx.moveTo(0, 0);
    fanCtx.lineTo(20, -116);
    fanCtx.lineTo(-10, -120);
    fanCtx.fill();
  }
  fanCtx.fillStyle = '#d4d4d4';
  fanCtx.beginPath();
  fanCtx.arc(0, 0, 22, 0, Math.PI * 2);
  fanCtx.fill();

  const fanTex = new THREE.CanvasTexture(fanCanvas);
  const fanMat = new THREE.MeshStandardMaterial({ map: fanTex, roughness: 0.45, metalness: 0.62 });

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

    const intakeLip = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.15, 16, 40), metalMat);
    intakeLip.position.z = -2.95;
    engGroup.add(intakeLip);

    const fan = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), fanMat);
    fan.position.z = -1.95;
    engGroup.add(fan);
    engineFans.push(fan);

    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.9, 24), metalMat);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = -1.85;
    engGroup.add(spinner);

    // Stator vanes
    for (let i = 0; i < 10; i++) {
      const vane = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.3), darkMetalMat);
      const a = (i / 10) * Math.PI * 2;
      vane.position.set(Math.cos(a) * 0.9, Math.sin(a) * 0.9, -0.95);
      vane.rotation.z = a;
      engGroup.add(vane);
    }

    const coreGeo = new THREE.CylinderGeometry(0.85, 0.52, 2.25, 30);
    coreGeo.rotateX(Math.PI / 2);
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.55,
      metalness: 0.6,
      emissive: 0x000000,
      emissiveIntensity: 0.0
    });
    const core = new THREE.Mesh(coreGeo, new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.45, metalness: 0.72 }));
    core.position.z = 2.1;
    engGroup.add(core);

    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.48, 2.15, 30), exhaustMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.z = 3.55;
    engGroup.add(exhaust);
    engineExhausts.push(exhaustMat);

    const pylonRoot = new THREE.Mesh(new THREE.BoxGeometry(0.56, 2.25, 4.2), wingMat);
    pylonRoot.position.set(0, 1.62, -0.45);
    pylonRoot.rotation.x = 0.11;
    engGroup.add(pylonRoot);

    const pylonFairing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.65, 1.8), darkMetalMat);
    pylonFairing.position.set(0, 0.72, -0.9);
    pylonFairing.rotation.x = 0.18;
    engGroup.add(pylonFairing);

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

    const sideBrace = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4), strutMat);
    sideBrace.position.set(0.26, -1.55, 0.18);
    sideBrace.rotation.z = -0.4;
    g.add(sideBrace);

    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8), strutMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = -3.0;
    g.add(axle);

    const w1 = new THREE.Mesh(tireGeo, tireMat);
    w1.position.set(-0.4, -3.0, 0);
    const w2 = new THREE.Mesh(tireGeo, tireMat);
    w2.position.set(0.4, -3.0, 0);
    g.add(w1, w2);

    const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.45), wingMat);
    doorL.position.set(-0.42, -1.1, -0.1);
    doorL.rotation.z = 0.24;
    const doorR = doorL.clone();
    doorR.position.x = 0.42;
    doorR.rotation.z = -0.24;
    g.add(doorL, doorR);

    g.position.set(0, -0.5, -15);
    return g;
  }

  function createMainGear(x) {
    const g = new THREE.Group();

    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.5), strutMat);
    strut.position.y = -1.75;
    g.add(strut);

    const torqueLink = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.15), strutMat);
    torqueLink.position.set(0.12, -2.35, 0.15);
    torqueLink.rotation.z = 0.35;
    g.add(torqueLink);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 1.8), strutMat);
    beam.position.y = -3.5;
    g.add(beam);

    [[-0.4, -3.5, -0.6], [0.4, -3.5, -0.6], [-0.4, -3.5, 0.6], [0.4, -3.5, 0.6]].forEach((pos) => {
      const wheel = new THREE.Mesh(tireGeo, tireMat);
      wheel.position.set(...pos);
      g.add(wheel);
    });

    const fairing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 2.1), wingMat);
    fairing.position.set(0, -0.45, 0.1);
    fairing.rotation.x = 0.08;
    g.add(fairing);

    g.position.set(x, -0.5, 3);
    return g;
  }

  gearGroup.add(createNoseGear(), createMainGear(-4.5), createMainGear(4.5));

  // Wing root landing light housings
  const llHousingMat = new THREE.MeshStandardMaterial({ color: 0xd7d7d7, roughness: 0.35, metalness: 0.55 });
  const llHousingL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 1.0), llHousingMat);
  llHousingL.position.set(-3.0, -0.95, -5.0);
  const llHousingR = llHousingL.clone();
  llHousingR.position.x = 3.0;
  gearGroup.add(llHousingL, llHousingR);

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

    const lensCover = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshPhysicalMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      roughness: 0.08,
      transmission: 0.8
    }));
    light.add(lensCover);

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
