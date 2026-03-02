import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export function createRendererManager({ container, scene, camera }) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, logarithmicDepthBuffer: true });
    const BASELINE_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);

    renderer.setPixelRatio(BASELINE_PIXEL_RATIO);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    if (container) {
        container.appendChild(renderer.domElement);
    }

    const renderScene = new RenderPass(scene, camera);
    const pixelRatio = renderer.getPixelRatio();
    const smaaPass = new SMAAPass(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);

    bloomPass.threshold = 5.0;
    bloomPass.strength = 0.8;
    bloomPass.radius = 0.4;

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(smaaPass);
    composer.addPass(bloomPass);

    function handleResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);

        const pr = renderer.getPixelRatio();
        smaaPass.setSize(width * pr, height * pr);
        composer.setSize(width, height);
    }

    return {
        renderer,
        composer,
        smaaPass,
        bloomPass,
        handleResize
    };
}
