import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export function createRendererManager({ container, scene, camera }) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, logarithmicDepthBuffer: true });
    const BASELINE_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);
    const MIN_PIXEL_RATIO = 0.7;
    const MAX_PIXEL_RATIO = BASELINE_PIXEL_RATIO;
    const DOWNSCALE_STEP = 0.1;
    const UPSCALE_STEP = 0.05;
    const ADAPT_INTERVAL_FRAMES = 18;
    const HIGH_FRAME_MS = 19.0;
    const LOW_FRAME_MS = 14.0;

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

    let adaptiveQualityEnabled = true;
    let frameTimeEmaMs = 16.67;
    let adaptCounter = 0;
    let currentPixelRatio = BASELINE_PIXEL_RATIO;
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;

    function applyRenderScale(pixelRatio) {
        const clamped = THREE.MathUtils.clamp(pixelRatio, MIN_PIXEL_RATIO, MAX_PIXEL_RATIO);
        if (Math.abs(clamped - currentPixelRatio) < 0.01) return;

        currentPixelRatio = clamped;
        renderer.setPixelRatio(currentPixelRatio);
        renderer.setSize(viewportWidth, viewportHeight, false);

        const pr = renderer.getPixelRatio();
        smaaPass.setSize(viewportWidth * pr, viewportHeight * pr);
        composer.setSize(viewportWidth, viewportHeight);
    }

    function updateAdaptiveQuality(dtSeconds) {
        if (!adaptiveQualityEnabled || !Number.isFinite(dtSeconds) || dtSeconds <= 0) {
            return;
        }

        const frameMs = Math.min(100, dtSeconds * 1000);
        frameTimeEmaMs = frameTimeEmaMs * 0.9 + frameMs * 0.1;
        adaptCounter++;

        if (adaptCounter >= ADAPT_INTERVAL_FRAMES) {
            adaptCounter = 0;
            if (frameTimeEmaMs > HIGH_FRAME_MS) {
                applyRenderScale(currentPixelRatio - DOWNSCALE_STEP);
            } else if (frameTimeEmaMs < LOW_FRAME_MS) {
                applyRenderScale(currentPixelRatio + UPSCALE_STEP);
            }
        }

        // At low internal resolution, SMAA cost/benefit drops.
        smaaPass.enabled = currentPixelRatio >= 0.95;
    }

    function setAdaptiveQualityEnabled(enabled) {
        adaptiveQualityEnabled = Boolean(enabled);
    }

    function handleResize() {
        viewportWidth = window.innerWidth;
        viewportHeight = window.innerHeight;

        camera.aspect = viewportWidth / viewportHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(viewportWidth, viewportHeight);

        const pr = renderer.getPixelRatio();
        smaaPass.setSize(viewportWidth * pr, viewportHeight * pr);
        composer.setSize(viewportWidth, viewportHeight);
    }

    return {
        renderer,
        composer,
        smaaPass,
        bloomPass,
        updateAdaptiveQuality,
        setAdaptiveQualityEnabled,
        handleResize
    };
}
