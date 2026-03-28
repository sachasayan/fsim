// @ts-check

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/**
 * @typedef {{
 *   lightAmbientBase?: number,
 *   lightDirectBase?: number,
 *   hemiSkyColor?: THREE.ColorRepresentation,
 *   hemiGroundColor?: THREE.ColorRepresentation,
 *   dirColor?: THREE.ColorRepresentation,
 *   skyTurbidity?: number,
 *   skyRayleigh?: number,
 *   skyMieCoefficient?: number,
 *   skyMieDirectionalG?: number,
 *   hazeColor?: THREE.ColorRepresentation,
 *   hazeOpacity?: number,
 *   starOpacity?: number,
 *   sunPhiDeg?: number,
 *   sunThetaDeg?: number
 * }} EnvironmentWeatherState
 */

/**
 * @typedef {{
 *   scene: THREE.Scene,
 *   renderer: THREE.WebGLRenderer,
 *   WEATHER?: EnvironmentWeatherState | null,
 *   shadowsEnabled?: boolean
 * }} CreateEnvironmentArgs
 */

/**
 * @param {CreateEnvironmentArgs} args
 */
export function createEnvironment({ scene, renderer, WEATHER, shadowsEnabled = true }) {
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
  dirLight.castShadow = shadowsEnabled;
  dirLight.shadow.camera.top = 280;
  dirLight.shadow.camera.bottom = -280;
  dirLight.shadow.camera.left = -280;
  dirLight.shadow.camera.right = 280;
  dirLight.shadow.camera.near = 40; // Matches the value set dynamically in the main loop
  dirLight.shadow.camera.far = 5000;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.bias = 0.0001;
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

  let environmentTexture = null;

  // Far horizon haze dome for depth layering
  const hazeGeo = new THREE.SphereGeometry(180000, 64, 48);
  const hazeMat = new THREE.MeshBasicMaterial({
    color: WEATHER?.hazeColor ?? 0x2f2736,
    transparent: true,
    opacity: (WEATHER?.hazeOpacity ?? 0.12) * 0.88,
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

  /**
   * @param {EnvironmentWeatherState | null | undefined} weather
   * @param {{ refreshEnvironmentMap?: boolean }} [options]
   */
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
    hazeMat.opacity = (weather?.hazeOpacity ?? 0.12) * 0.88;
    starsMat.opacity = weather?.starOpacity ?? 0.3;

    if (refreshEnvironmentMap) {
      if (environmentTexture) environmentTexture.dispose();
      // Create, use, and immediately dispose the generator — it holds
      // large render targets and is only needed for the brief bake.
      const gen = new THREE.PMREMGenerator(renderer);
      gen.compileEquirectangularShader();
      environmentTexture = gen.fromScene(sky).texture;
      gen.dispose();
      scene.environment = environmentTexture;
    }
  }

  applyEnvironmentFromWeather(WEATHER, { refreshEnvironmentMap: true });

  return { hemiLight, dirLight, applyEnvironmentFromWeather };
}
