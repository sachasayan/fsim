import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export function createEnvironment({ scene, renderer }) {
  const hemiLight = new THREE.HemisphereLight(0x444455, 0x111118, 0.25); // Dark dusk ambient
  hemiLight.position.set(0, 2000, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xff6633, 0.5); // Lowered intensity to prevent nuclear sky glare
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
  skyUniforms['turbidity'].value = 10.0; // Thicker dusk atmosphere
  skyUniforms['rayleigh'].value = 2.5;   // Deeper red/purple scattering

  // DIFFUSED SUN DISK: Scatters the light to prevent the hot-spot from causing nuclear bloom
  skyUniforms['mieCoefficient'].value = 0.05;
  skyUniforms['mieDirectionalG'].value = 0.4;

  const phi = THREE.MathUtils.degToRad(82.0); // Raised sun slightly higher above the horizon
  const theta = THREE.MathUtils.degToRad(150); // Sun azimuth
  sun.setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms['sunPosition'].value.copy(sun);
  dirLight.position.copy(sun).multiplyScalar(2000);

  // --- GLOBAL ENVIRONMENT REFLECTIONS (PMREM) ---
  // Captures the sky gradient and applies it to all shiny surfaces as a realistic reflection map
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  scene.environment = pmremGenerator.fromScene(sky).texture;

  return { hemiLight, dirLight };
}
