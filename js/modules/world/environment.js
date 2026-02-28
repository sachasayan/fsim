import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export function createEnvironment({ scene, renderer, WEATHER }) {
  const hemiBase = WEATHER?.lightAmbientBase ?? 0.25;
  const dirBase = WEATHER?.lightDirectBase ?? 1.0;

  const hemiLight = new THREE.HemisphereLight(
    WEATHER?.hemiSkyColor ?? 0x444455,
    WEATHER?.hemiGroundColor ?? 0x111118,
    hemiBase
  );
  hemiLight.position.set(0, 2000, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(WEATHER?.dirColor ?? 0xff9a66, dirBase);
  dirLight.position.set(-1000, 2000, 1000);
  dirLight.castShadow = true;
  dirLight.shadow.camera.top = 200;
  dirLight.shadow.camera.bottom = -200;
  dirLight.shadow.camera.left = -200;
  dirLight.shadow.camera.right = 200;
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = 5000;
  dirLight.shadow.mapSize.width = 4096;
  dirLight.shadow.mapSize.height = 4096;
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);

  // Physical Sky Model
  const sky = new Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);
  const sun = new THREE.Vector3();
  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = WEATHER?.skyTurbidity ?? 10.0;
  skyUniforms['rayleigh'].value = WEATHER?.skyRayleigh ?? 2.5;

  skyUniforms['mieCoefficient'].value = WEATHER?.skyMieCoefficient ?? 0.05;
  skyUniforms['mieDirectionalG'].value = WEATHER?.skyMieDirectionalG ?? 0.4;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  let environmentTexture = null;

  // Far horizon haze dome for depth layering
  const hazeGeo = new THREE.SphereGeometry(180000, 24, 24);
  const hazeMat = new THREE.MeshBasicMaterial({
    color: WEATHER?.hazeColor ?? 0x2f2736,
    transparent: true,
    opacity: WEATHER?.hazeOpacity ?? 0.12,
    side: THREE.BackSide,
    depthWrite: false
  });
  const hazeDome = new THREE.Mesh(hazeGeo, hazeMat);
  scene.add(hazeDome);

  // Sparse starfield points for twilight ambiance
  const starCount = 1800;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 150000 + Math.random() * 180000;
    const theta = Math.random() * Math.PI * 2;
    const phiStar = Math.random() * Math.PI * 0.7;
    starPositions[i * 3] = Math.cos(theta) * Math.sin(phiStar) * r;
    starPositions[i * 3 + 1] = Math.cos(phiStar) * r;
    starPositions[i * 3 + 2] = Math.sin(theta) * Math.sin(phiStar) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starsMat = new THREE.PointsMaterial({
    color: 0xcad8ff,
    size: 140,
    transparent: true,
    opacity: WEATHER?.starOpacity ?? 0.3,
    depthWrite: false
  });
  const stars = new THREE.Points(
    starGeo,
    starsMat
  );
  scene.add(stars);

  function applyEnvironmentFromWeather(weather, options = {}) {
    const { refreshEnvironmentMap = false } = options;
    hemiLight.color.setHex(weather?.hemiSkyColor ?? 0x444455);
    hemiLight.groundColor.setHex(weather?.hemiGroundColor ?? 0x111118);
    dirLight.color.setHex(weather?.dirColor ?? 0xff9a66);
    skyUniforms.turbidity.value = weather?.skyTurbidity ?? 10.0;
    skyUniforms.rayleigh.value = weather?.skyRayleigh ?? 2.5;
    skyUniforms.mieCoefficient.value = weather?.skyMieCoefficient ?? 0.05;
    skyUniforms.mieDirectionalG.value = weather?.skyMieDirectionalG ?? 0.4;

    const phi = THREE.MathUtils.degToRad(weather?.sunPhiDeg ?? 82.0);
    const theta = THREE.MathUtils.degToRad(weather?.sunThetaDeg ?? 150.0);
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms.sunPosition.value.copy(sun);
    dirLight.position.copy(sun).multiplyScalar(2000);

    hazeMat.color.setHex(weather?.hazeColor ?? 0x2f2736);
    hazeMat.opacity = weather?.hazeOpacity ?? 0.12;
    starsMat.opacity = weather?.starOpacity ?? 0.3;

    if (refreshEnvironmentMap) {
      if (environmentTexture) environmentTexture.dispose();
      environmentTexture = pmremGenerator.fromScene(sky).texture;
      scene.environment = environmentTexture;
    }
  }

  applyEnvironmentFromWeather(WEATHER, { refreshEnvironmentMap: true });

  return { hemiLight, dirLight, applyEnvironmentFromWeather };
}
