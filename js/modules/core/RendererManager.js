import * as THREE from 'three';
import { createPostProcessingStack } from './PostProcessingStack.js';

export function createRendererManager({ container, scene, camera }) {
    const urlParams = new URLSearchParams(window.location.search);
    const logarithmicDepthBufferEnabled = urlParams.get('logdepth') !== '0';
    const shadowsEnabled = urlParams.get('shadows') !== '0';
    const renderer = new THREE.WebGLRenderer({
        antialias: false,
        logarithmicDepthBuffer: logarithmicDepthBufferEnabled
    });
    const BASELINE_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);

    renderer.setPixelRatio(BASELINE_PIXEL_RATIO);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    if (container) {
        container.appendChild(renderer.domElement);
    }

    const postStack = createPostProcessingStack({
        renderer,
        scene,
        camera,
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: renderer.getPixelRatio()
    });
    const composer = postStack.composer;
    const smaaPass = postStack.getPass('smaa');
    const bloomPass = postStack.getPass('bloom');

    let frameTimeEmaMs = 16.67;
    let currentPixelRatio = BASELINE_PIXEL_RATIO;
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;

    function updateAdaptiveQuality(dtSeconds) {
        if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
            return;
        }

        const frameMs = Math.min(100, dtSeconds * 1000);
        frameTimeEmaMs = frameTimeEmaMs * 0.9 + frameMs * 0.1;

        postStack.update({ pixelRatio: currentPixelRatio, frameTimeEmaMs });
    }

    function setAdaptiveQualityEnabled(_enabled) {
        // Kept for API compatibility; render scale is fixed at the native baseline.
    }

    function getAdaptiveQualitySnapshot() {
        return {
            enabled: false,
            frameTimeEmaMs,
            pixelRatio: currentPixelRatio,
            viewportWidth,
            viewportHeight,
            shadowsEnabled,
            logarithmicDepthBufferEnabled
        };
    }

    function handleResize() {
        viewportWidth = window.innerWidth;
        viewportHeight = window.innerHeight;

        camera.aspect = viewportWidth / viewportHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(viewportWidth, viewportHeight);

        postStack.resize(viewportWidth, viewportHeight, renderer.getPixelRatio());
    }

    return {
        renderer,
        composer,
        smaaPass,
        bloomPass,
        renderFrame(dtSeconds) {
            postStack.render(dtSeconds);
        },
        getRenderPassTimings() {
            return postStack.getPassTimings();
        },
        shadowsEnabled,
        logarithmicDepthBufferEnabled,
        updateAdaptiveQuality,
        getAdaptiveQualitySnapshot,
        setAdaptiveQualityEnabled,
        handleResize
    };
}
