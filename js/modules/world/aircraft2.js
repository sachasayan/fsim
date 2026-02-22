import * as THREE from 'three';

function makeTexture(renderer, width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  painter(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeFuselageTexture(renderer) {
  return makeTexture(renderer, 4096, 2048, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fafafa');
    g.addColorStop(0.55, '#f2f2f2');
    g.addColorStop(1, '#dddddd');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#003a8c';
    ctx.fillRect(0, Math.floor(h * 0.48), w, 70);
    ctx.fillStyle = '#d60034';
    ctx.fillRect(0, Math.floor(h * 0.515), w, 14);

    // Longitudinal panel lines
    ctx.strokeStyle = 'rgba(120,120,120,0.25)';
    ctx.lineWidth = 1;
    for (let y = 130; y < h - 130; y += 120) {
      ctx.beginPath();
      ctx.moveTo(140, y);
      ctx.lineTo(w - 140, y);
      ctx.stroke();
    }

    // Circumferential panel lines
    for (let x = 140; x < w - 120; x += 120) {
      ctx.strokeStyle = x % 480 === 0 ? 'rgba(70,70,70,0.27)' : 'rgba(120,120,120,0.16)';
      ctx.beginPath();
      ctx.moveTo(x, 120);
      ctx.lineTo(x, h - 120);
      ctx.stroke();
    }

    // Cabin windows both sides
    function row(y) {
      for (let x = 360; x < w - 350; x += 56) {
        if ((x > 2280 && x < 2460) || (x > 3170 && x < 3310)) continue;
        const winGrad = ctx.createLinearGradient(0, y, 0, y + 22);
        winGrad.addColorStop(0, '#0a0f16');
        winGrad.addColorStop(1, '#1d2734');
        ctx.fillStyle = winGrad;
        ctx.fillRect(x, y, 20, 22);
      }
    }
    row(505);
    row(1520);

    // Door outlines
    ctx.strokeStyle = 'rgba(40,40,40,0.55)';
    ctx.lineWidth = 2;
    [430, 1710, 2280, 3200].forEach((x) => {
      ctx.strokeRect(x, 422, 44, 130);
      ctx.strokeRect(x, 1450, 44, 130);
    });

    // Cargo doors
    ctx.strokeRect(2475, 700, 140, 92);
    ctx.strokeRect(2475, 1190, 140, 92);

    // Light dirt/weathering pass
    for (let i = 0; i < 7000; i++) {
      const alpha = Math.random() * 0.04;
      const c = 185 + Math.floor(Math.random() * 35);
      ctx.fillStyle = `rgba(${c},${c},${c},${alpha})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

function makeWingTexture(renderer) {
  return makeTexture(renderer, 2048, 2048, (ctx, w, h) => {
    ctx.fillStyle = '#d7d7d7';
    ctx.fillRect(0, 0, w, h);

    // Panels
    ctx.strokeStyle = 'rgba(70,70,70,0.35)';
    ctx.lineWidth = 2;
    for (let y = 160; y < h - 120; y += 150) {
      ctx.beginPath();
      ctx.moveTo(130, y);
      ctx.lineTo(w - 130, y - 24);
      ctx.stroke();
    }

    // Walkway and no-step zones
    ctx.fillStyle = 'rgba(20,20,20,0.32)';
    ctx.fillRect(380, 730, 920, 120);
    ctx.fillRect(430, 1020, 840, 95);
    ctx.fillStyle = 'rgba(255,220,0,0.9)';
    ctx.fillRect(360, 710, 960, 6);
    ctx.fillRect(360, 1136, 960, 6);

    // Leading edge strip
    ctx.fillStyle = 'rgba(185,185,185,0.65)';
    ctx.fillRect(0, 130, w, 52);
  });
}

function makeFanTexture(renderer) {
  return makeTexture(renderer, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#070707';
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 30; i++) {
      ctx.rotate((Math.PI * 2) / 30);
      ctx.fillStyle = i % 2 === 0 ? '#666' : '#4d4d4d';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(35, -220);
      ctx.lineTo(-15, -220);
      ctx.closePath();
      ctx.fill();
    }

    const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 70);
    grad.addColorStop(0, '#d5d5d5');
    grad.addColorStop(1, '#7a7a7a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 68, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function createAircraftSystem2({ scene, renderer }) {
  const planeGroup = new THREE.Group();
  scene.add(planeGroup);

  const engineFans = [];
  const engineExhausts = [];
  const movableSurfaces = { flaps: [], aileronsL: [], aileronsR: [], elevators: [], rudder: [], spoilers: [] };

  const fuselageTex = makeFuselageTexture(renderer);
  const wingTex = makeWingTexture(renderer);
  const fanTex = makeFanTexture(renderer);

  const fuselageMat = new THREE.MeshStandardMaterial({ map: fuselageTex, roughness: 0.17, metalness: 0.48 });
  const wingMat = new THREE.MeshStandardMaterial({ map: wingTex, roughness: 0.26, metalness: 0.58 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.25, metalness: 0.95 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.62, metalness: 0.4 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x09121b,
    roughness: 0.02,
    metalness: 0,
    transmission: 0.72,
    thickness: 0.3,
    ior: 1.5,
    reflectivity: 1.0
  });

  // Fuselage body
  const bodyGeo = new THREE.CylinderGeometry(2.2, 2.2, 34.4, 92, 1, false);
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.rotateZ(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, fuselageMat);
  body.castShadow = true;
  body.receiveShadow = true;
  planeGroup.add(body);

  // Nose
  const noseProfile = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const r = Math.sin((t * Math.PI) / 2) * 2.2;
    const z = Math.cos((t * Math.PI) / 2) * 6.4;
    noseProfile.push(new THREE.Vector2(r, z));
  }
  const noseGeo = new THREE.LatheGeometry(noseProfile, 90);
  noseGeo.rotateX(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, fuselageMat);
  nose.position.z = -17.25;
  nose.castShadow = true;
  planeGroup.add(nose);

  const radomeRing = new THREE.Mesh(new THREE.TorusGeometry(2.18, 0.05, 10, 72), darkMetalMat);
  radomeRing.position.z = -15.3;
  radomeRing.rotation.x = Math.PI / 2;
  planeGroup.add(radomeRing);

  // Cockpit glass and frames
  const cockpitGeo = new THREE.SphereGeometry(2.23, 44, 24, Math.PI * 0.3, Math.PI * 0.4, 0.3, 0.54);
  cockpitGeo.rotateX(Math.PI / 2);
  cockpitGeo.rotateZ(Math.PI / 2);
  const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
  cockpit.position.set(0, 0.42, -19.35);
  cockpit.rotation.x = -0.16;
  planeGroup.add(cockpit);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.45, metalness: 0.55 });
  const frameBars = new THREE.Group();
  for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.92, 0.04), frameMat);
    bar.position.set(x, 0.65, -19.2 + Math.abs(x) * 0.05);
    bar.rotation.x = -0.16;
    frameBars.add(bar);
  }
  planeGroup.add(frameBars);

  // Tail cone
  const tailProfile = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    tailProfile.push(new THREE.Vector2(Math.max(2.2 * (1 - Math.pow(t, 1.45)), 0.28), t * 8.8));
  }
  const tailGeo = new THREE.LatheGeometry(tailProfile, 90);
  tailGeo.rotateX(Math.PI / 2);
  const tailCone = new THREE.Mesh(tailGeo, fuselageMat);
  tailCone.position.z = 16.9;
  tailCone.castShadow = true;
  planeGroup.add(tailCone);

  const apu = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.14, 0.72, 24), metalMat);
  apu.rotation.x = Math.PI / 2;
  apu.position.z = 25.5;
  planeGroup.add(apu);

  // Belly fairing / antenna / satcom
  const bellyGeo = new THREE.CylinderGeometry(2.66, 2.66, 14.8, 40);
  bellyGeo.rotateZ(Math.PI / 2);
  bellyGeo.scale(1, 0.34, 1.23);
  const belly = new THREE.Mesh(bellyGeo, fuselageMat);
  belly.position.set(0, -1.9, 1.5);
  belly.castShadow = true;
  planeGroup.add(belly);

  const satcom = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.38, 4.0), new THREE.MeshStandardMaterial({ color: 0xefefef, roughness: 0.36, metalness: 0.2 }));
  satcom.position.set(0, 2.3, 1.1);
  satcom.rotation.x = 0.04;
  planeGroup.add(satcom);

  const topAntenna = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.45), darkMetalMat);
  topAntenna.position.set(0, 2.46, -4.8);
  planeGroup.add(topAntenna);

  const bottomAntenna = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.35), darkMetalMat);
  bottomAntenna.position.set(0, -2.56, 2.2);
  planeGroup.add(bottomAntenna);

  // Door overlays
  function addDoor(x, y, z, h, inset = 0.022) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(inset, h, 0.86), darkMetalMat);
    d.position.set(x, y, z);
    planeGroup.add(d);
  }
  [-12.1, 3.4, 11.9].forEach((z) => {
    addDoor(-2.19, 0.64, z, 1.82);
    addDoor(2.19, 0.64, z, 1.82);
  });
  addDoor(-2.19, -0.42, 5.7, 1.1, 0.02);
  addDoor(2.19, -0.42, 5.7, 1.1, 0.02);

  // Wing system and alignment helpers
  const wingGroup = new THREE.Group();

  const wingGeo = new THREE.BoxGeometry(42.2, 0.62, 7.6, 36, 1, 12);
  const wingPos = wingGeo.attributes.position;

  function wingTaper(x) {
    return 1.0 - (Math.abs(x) / 21.1) * 0.7;
  }

  function wingZAt(x, zLocal) {
    return Math.abs(x) * 0.67 + zLocal * wingTaper(x) - 0.5;
  }

  function wingTopAt(x, zLocal) {
    const zNorm = (zLocal + 3.8) / 7.6;
    const thickness = zNorm < 0.32 ? Math.sqrt(Math.max(0, zNorm / 0.32)) : 1.0 - (zNorm - 0.32) * 0.82;
    let y = 0.31 * thickness;
    y += Math.abs(x) * 0.1;
    y *= Math.max(0.31, wingTaper(x));
    return y;
  }

  for (let i = 0; i < wingPos.count; i++) {
    const x = wingPos.getX(i);
    let y = wingPos.getY(i);
    let z = wingPos.getZ(i);
    const zNorm = (z + 3.8) / 7.6;
    const thickness = zNorm < 0.32 ? Math.sqrt(Math.max(0, zNorm / 0.32)) : 1.0 - (zNorm - 0.32) * 0.82;
    y *= thickness;
    z += Math.abs(x) * 0.67;
    y += Math.abs(x) * 0.1;
    const t = wingTaper(x);
    z = (z - Math.abs(x) * 0.67) * t + Math.abs(x) * 0.67 - 0.5;
    y *= Math.max(0.31, t);
    wingPos.setXYZ(i, x, y, z);
  }
  wingGeo.computeVertexNormals();

  const wing = new THREE.Mesh(wingGeo, wingMat);
  wing.castShadow = true;
  wing.receiveShadow = true;
  wingGroup.add(wing);

  function addTrailingSurface(xStart, xEnd, zBase, chord, type) {
    const width = Math.abs(xEnd - xStart);
    const midX = (xStart + xEnd) / 2;

    const geo = new THREE.BoxGeometry(width - 0.08, 0.18, chord, Math.max(3, Math.floor(width / 1.6)), 1, 4);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      let vy = pos.getY(i);
      let vz = pos.getZ(i);
      const worldX = midX + vx;
      const t = wingTaper(worldX);
      vz *= t;
      vy *= t;
      vy *= 1 - ((vz + chord / 2) / chord) * 0.82;
      pos.setXYZ(i, vx, vy, vz);
    }
    geo.computeVertexNormals();
    geo.translate(0, 0, chord / 2);

    const surface = new THREE.Mesh(geo, wingMat);
    const tMid = wingTaper(midX);
    const hingeZ = wingZAt(midX, zBase) - chord * tMid + 0.04;
    const y = wingTopAt(midX, zBase - chord * 0.5) - 0.03;
    surface.position.set(midX, y, hingeZ);
    wingGroup.add(surface);
    movableSurfaces[type].push(surface);
  }

  addTrailingSurface(-14.0, -3.0, 3.8, 2.55, 'flaps');
  addTrailingSurface(-20.8, -14.2, 3.8, 1.85, 'aileronsL');
  addTrailingSurface(3.0, 14.0, 3.8, 2.55, 'flaps');
  addTrailingSurface(14.2, 20.8, 3.8, 1.85, 'aileronsR');

  function addSpoiler(xStart, xEnd, zBase, chord) {
    const width = Math.abs(xEnd - xStart);
    const midX = (xStart + xEnd) / 2;
    const geo = new THREE.BoxGeometry(width - 0.2, 0.05, chord);
    geo.translate(0, 0.025, chord / 2);
    const s = new THREE.Mesh(geo, wingMat);
    s.position.set(midX, wingTopAt(midX, zBase) + 0.01, wingZAt(midX, zBase));
    wingGroup.add(s);
    movableSurfaces.spoilers.push(s);
  }

  addSpoiler(-13.4, -3.5, 2.25, 1.2);
  addSpoiler(3.5, 13.4, 2.25, 1.2);

  // Flap track fairings
  const fairingGeo = new THREE.CylinderGeometry(0.2, 0.05, 4.4, 16);
  fairingGeo.rotateX(Math.PI / 2);
  const fp = fairingGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const z = fp.getZ(i);
    if (z < 0) fp.setY(i, fp.getY(i) * Math.max(0, 1 - Math.abs(z) / 2.2));
  }
  fairingGeo.computeVertexNormals();

  [-12.6, -9.2, -6.4, 6.4, 9.2, 12.6].forEach((x) => {
    const f = new THREE.Mesh(fairingGeo, wingMat);
    f.position.set(x, Math.abs(x) * 0.1 - 0.44, 2.65 + Math.abs(x) * 0.67);
    wingGroup.add(f);
  });

  // Wing fences
  [-11.4, 11.4].forEach((x) => {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.85), darkMetalMat);
    fence.position.set(x, 0.88, 6.2 + Math.abs(x) * 0.62);
    wingGroup.add(fence);
  });

  // Winglets
  const wingletGeo = new THREE.BoxGeometry(0.22, 3.8, 2.2);
  const wlp = wingletGeo.attributes.position;
  for (let i = 0; i < wlp.count; i++) {
    const y = wlp.getY(i);
    let z = wlp.getZ(i);
    if (y > 0) z += 1.75;
    const t = 1.0 - Math.abs(y / 1.9) * 0.5;
    wlp.setZ(i, (z - 1.6) * t + 1.6);
  }
  wingletGeo.computeVertexNormals();

  const wlL = new THREE.Mesh(wingletGeo, wingMat);
  wlL.position.set(-21.0, 2.08, 14.8);
  wlL.rotation.set(-0.2, 0, -0.3);
  wingGroup.add(wlL);

  const wlR = new THREE.Mesh(wingletGeo, wingMat);
  wlR.position.set(21.0, 2.08, 14.8);
  wlR.rotation.set(-0.2, 0, 0.3);
  wingGroup.add(wlR);

  wingGroup.position.set(0, -1.0, 1.0);
  planeGroup.add(wingGroup);

  // Pitot probes
  function addPitot(sign) {
    const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.01, 0.85, 10), metalMat);
    pitot.rotation.z = Math.PI / 2;
    pitot.position.set(0.42 * sign, 0.62, -22.25);
    planeGroup.add(pitot);
  }
  addPitot(1);
  addPitot(-1);

  // Empennage
  const empennage = new THREE.Group();

  const vtGeo = new THREE.BoxGeometry(0.56, 9.5, 5.4);
  const vtp = vtGeo.attributes.position;
  for (let i = 0; i < vtp.count; i++) {
    const y = vtp.getY(i);
    let z = vtp.getZ(i);
    if (y > 0) z += 5.4;
    const t = 1.0 - (Math.abs(y) / 4.75) * 0.6;
    vtp.setZ(i, (z - 2.7) * t + 2.7);
  }
  vtGeo.computeVertexNormals();
  const vt = new THREE.Mesh(vtGeo, wingMat);
  vt.position.set(0, 5.1, 20.1);
  empennage.add(vt);

  const rudGeo = new THREE.BoxGeometry(0.42, 8.9, 2.8);
  const rp = rudGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const y = rp.getY(i);
    let z = rp.getZ(i);
    if (y > 0) z += 4.8;
    const t = 1.0 - (Math.abs(y) / 4.45) * 0.6;
    rp.setXYZ(i, rp.getX(i) * t, y, (z - 1.4) * t + 1.4);
  }
  rudGeo.computeVertexNormals();
  rudGeo.translate(0, 0, 1.4);
  const rudder = new THREE.Mesh(rudGeo, wingMat);
  rudder.position.set(0, 5.25, 22.65);
  empennage.add(rudder);
  movableSurfaces.rudder.push(rudder);

  const htGeo = new THREE.BoxGeometry(16.4, 0.42, 3.6);
  const htp = htGeo.attributes.position;
  for (let i = 0; i < htp.count; i++) {
    const x = htp.getX(i);
    let y = htp.getY(i);
    let z = htp.getZ(i);
    const d = Math.abs(x);
    z += d * 0.62;
    y += d * 0.08;
    const t = 1.0 - (d / 8.2) * 0.6;
    htp.setXYZ(i, x, y * t, (z - 1.8) * t + 1.8);
  }
  htGeo.computeVertexNormals();
  const hTail = new THREE.Mesh(htGeo, wingMat);
  hTail.position.set(0, 1.2, 22.5);
  empennage.add(hTail);

  const elevGeo = new THREE.BoxGeometry(7.9, 0.2, 2.0);
  elevGeo.translate(0, 0, 1.0);
  function addElevator(xStart, xEnd) {
    const mid = (xStart + xEnd) / 2;
    const e = new THREE.Mesh(elevGeo, wingMat);
    const d = Math.abs(mid);
    const t = 1.0 - (d / 8.0) * 0.6;
    e.scale.set(1, t, t);
    e.position.set(mid, 1.2 + d * 0.08, 24.25 + d * 0.6);
    empennage.add(e);
    movableSurfaces.elevators.push(e);
  }
  addElevator(-7.9, -0.2);
  addElevator(0.2, 7.9);

  planeGroup.add(empennage);

  // Engines
  const fanMat = new THREE.MeshStandardMaterial({ map: fanTex, roughness: 0.45, metalness: 0.62 });

  function createEngine(x, z) {
    const g = new THREE.Group();

    const cowlGeo = new THREE.CylinderGeometry(1.62, 1.34, 6.0, 44);
    cowlGeo.rotateX(Math.PI / 2);
    const cp = cowlGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i);
      if (y < -1.0) cp.setY(i, -1.0 - (y + 1.0) * 0.24);
    }
    cowlGeo.computeVertexNormals();

    const cowl = new THREE.Mesh(cowlGeo, fuselageMat);
    cowl.castShadow = true;
    g.add(cowl);

    const intake = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.15, 16, 48), metalMat);
    intake.position.z = -2.98;
    g.add(intake);

    const fan = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), fanMat);
    fan.position.z = -1.95;
    g.add(fan);
    engineFans.push(fan);

    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.9, 24), metalMat);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = -1.84;
    g.add(spinner);

    for (let i = 0; i < 12; i++) {
      const vane = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.28), darkMetalMat);
      const a = (i / 12) * Math.PI * 2;
      vane.position.set(Math.cos(a) * 0.88, Math.sin(a) * 0.88, -0.95);
      vane.rotation.z = a;
      g.add(vane);
    }

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.86, 0.52, 2.2, 30),
      new THREE.MeshStandardMaterial({ color: 0x4c4c4c, roughness: 0.44, metalness: 0.72 })
    );
    core.rotation.x = Math.PI / 2;
    core.position.z = 2.1;
    g.add(core);

    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x232323,
      roughness: 0.56,
      metalness: 0.6,
      emissive: 0x000000,
      emissiveIntensity: 0
    });
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.48, 2.15, 30), exhaustMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.z = 3.6;
    g.add(exhaust);
    engineExhausts.push(exhaustMat);

    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.56, 2.25, 4.2), wingMat);
    pylon.position.set(0, 1.62, -0.45);
    pylon.rotation.x = 0.11;
    g.add(pylon);

    const pylonFairing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.65, 1.8), darkMetalMat);
    pylonFairing.position.set(0, 0.72, -0.9);
    pylonFairing.rotation.x = 0.18;
    g.add(pylonFairing);

    g.position.set(x, -2.2, z);
    return g;
  }

  planeGroup.add(createEngine(-7.5, 0));
  planeGroup.add(createEngine(7.5, 0));

  // Landing gear
  const gearGroup = new THREE.Group();
  const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0.15 });
  const strutMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.2, metalness: 0.88 });

  function createNoseGear() {
    const g = new THREE.Group();

    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.0), strutMat);
    strut.position.y = -1.5;
    g.add(strut);

    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4), strutMat);
    brace.position.set(0.26, -1.55, 0.18);
    brace.rotation.z = -0.4;
    g.add(brace);

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

    const link = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.15), strutMat);
    link.position.set(0.12, -2.35, 0.15);
    link.rotation.z = 0.35;
    g.add(link);

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

  // Landing lights
  const llHousingMat = new THREE.MeshStandardMaterial({ color: 0xd7d7d7, roughness: 0.35, metalness: 0.55 });
  const llHousingL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 1.0), llHousingMat);
  llHousingL.position.set(-3, -0.95, -5);
  const llHousingR = llHousingL.clone();
  llHousingR.position.x = 3;
  gearGroup.add(llHousingL, llHousingR);

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

  // Navigation lights
  const strobes = [];
  const beacons = [];
  const lightBulbGeo = new THREE.SphereGeometry(0.15, 10, 10);

  function addNavLight(color, x, y, z) {
    const light = new THREE.PointLight(color, 2, 20);
    light.position.set(x, y, z);

    const lens = new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 32 }));
    light.add(lens);

    const cover = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshPhysicalMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      roughness: 0.08,
      transmission: 0.8
    }));
    light.add(cover);

    planeGroup.add(light);
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

  const beaconBottom = new THREE.PointLight(0xff0000, 0, 50);
  beaconBottom.position.set(0, -2.5, 0);
  beaconBottom.add(new THREE.Mesh(lightBulbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0000, emissiveIntensity: 40 })));
  planeGroup.add(beaconBottom);
  beacons.push(beaconBottom);

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
