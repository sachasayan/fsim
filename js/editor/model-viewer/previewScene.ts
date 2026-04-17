import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import {
    makeTreeOctahedralDepthMaterial,
    makeTreeOctahedralMaterial
} from '../../modules/world/terrain/TerrainMaterials.ts';
import { normalizeTreeImpostorMetadata } from '../../modules/world/terrain/TreeImpostorUtils.ts';
import { CAMERA_LIMITS, DEFAULT_CAMERA_STATE, clampCameraState, fitDistanceForRadius, normalizeYaw } from './cameraState';
import type { ModelViewerCameraState, ModelViewerPreviewState, WorldAssetDetail } from './types';

const DRACO_DECODER_PATH = '/node_modules/three/examples/jsm/libs/draco/gltf/';

type LoadedMeshAsset = {
    scene: THREE.Group;
    metrics: { width: number; height: number; depth: number };
};

type LoadedImpostorAsset = {
    mesh: THREE.InstancedMesh;
    metrics: { width: number; height: number; depth: number };
};

function degToRad(value: number) {
    return value * (Math.PI / 180);
}

function supportsWebGLContext() {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    return Boolean(
        canvas.getContext('webgl2')
        || canvas.getContext('webgl')
        || canvas.getContext('experimental-webgl')
    );
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined) {
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
        const maybeMapKeys = ['map', 'normalMap', 'alphaMap'];
        for (const key of maybeMapKeys) {
            const texture = entry[key as keyof THREE.Material] as THREE.Texture | undefined;
            if (texture && 'dispose' in texture) {
                texture.dispose();
            }
        }
        entry.dispose();
    }
}

function cloneAndNormalizeScene(root: THREE.Object3D) {
    const scene = root.clone(true) as THREE.Group;
    const bounds = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);
    const scale = 1 / Math.max(size.y, 1e-4);
    scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    scene.scale.setScalar(scale);
    return {
        scene,
        metrics: {
            width: size.x * scale,
            height: size.y * scale,
            depth: size.z * scale
        }
    };
}

async function loadMeshAsset(url: string): Promise<LoadedMeshAsset> {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    try {
        const gltf = await loader.loadAsync(url);
        return cloneAndNormalizeScene(gltf.scene);
    } finally {
        dracoLoader.dispose();
    }
}

async function loadTexture(url: string, colorSpace = THREE.NoColorSpace) {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}

async function loadImpostorAsset(detail: WorldAssetDetail, lightDirUniform: { value: THREE.Vector3 }, cameraPosUniform: { value: THREE.Vector3 }) {
    if (!detail.files.impostor?.metadata.urlPath || !detail.files.impostor.albedo.urlPath || !detail.files.impostor.normal.urlPath || !detail.files.impostor.depth.urlPath) {
        throw new Error(`Missing impostor files for ${detail.assetName}`);
    }
    const metadataResponse = await fetch(detail.files.impostor.metadata.urlPath);
    if (!metadataResponse.ok) {
        throw new Error(`Failed to load impostor metadata for ${detail.assetName}`);
    }
    const metadata = normalizeTreeImpostorMetadata(await metadataResponse.json());
    const [albedoTexture, normalTexture, depthTexture] = await Promise.all([
        loadTexture(detail.files.impostor.albedo.urlPath, THREE.SRGBColorSpace),
        loadTexture(detail.files.impostor.normal.urlPath, THREE.NoColorSpace),
        loadTexture(detail.files.impostor.depth.urlPath, THREE.NoColorSpace)
    ]);

    const plane = new THREE.PlaneGeometry(1, 1, 1, 1);
    plane.translate(0, 0.5, 0);
    const material = makeTreeOctahedralMaterial(
        albedoTexture,
        normalTexture,
        depthTexture,
        metadata,
        {
            lightDirUniform,
            lightColorUniform: { value: new THREE.Color(0xffffff) },
            lightIntensityUniform: { value: 2.2 },
            depthTexture
        }
    );
    const depthMaterial = makeTreeOctahedralDepthMaterial(
        albedoTexture,
        depthTexture,
        cameraPosUniform,
        lightDirUniform,
        metadata,
        { shadowFadeNear: 10000, shadowFadeFar: 12000 }
    );
    const mesh = new THREE.InstancedMesh(plane, material, 1);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.customDepthMaterial = depthMaterial;
    mesh.setColorAt(0, new THREE.Color(0xffffff));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const boundsMin = metadata?.boundsMin || [-0.5, 0, -0.5];
    const boundsMax = metadata?.boundsMax || [0.5, 1, 0.5];
    const width = Math.max(Math.abs((boundsMax[0] || 0) - (boundsMin[0] || 0)), Math.abs((boundsMax[2] || 0) - (boundsMin[2] || 0)), 0.2);
    const height = Math.max((boundsMax[1] || 1) - (boundsMin[1] || 0), 0.2);
    const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(width / height, 1, 1)
    );
    mesh.setMatrixAt(0, matrix);
    mesh.instanceMatrix.needsUpdate = true;

    return {
        mesh,
        metrics: { width, height, depth: width }
    } satisfies LoadedImpostorAsset;
}

export class ModelPreviewScene {
    container: HTMLDivElement;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    dirLight: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
    ambientLight: THREE.HemisphereLight;
    ground: THREE.Mesh;
    target = new THREE.Vector3(0, 0.8, 0);
    lightDirUniform = { value: new THREE.Vector3(0.25, 0.85, 0.45).normalize() };
    cameraPosUniform = { value: new THREE.Vector3() };
    slots = {
        mesh: new THREE.Group(),
        meshSecondary: new THREE.Group(),
        impostor: new THREE.Group()
    };
    cache = {
        meshes: new Map<string, Promise<LoadedMeshAsset>>(),
        impostors: new Map<string, Promise<LoadedImpostorAsset>>()
    };
    currentFitDistance = DEFAULT_CAMERA_STATE.cameraDistance;
    currentPreviewState: ModelViewerPreviewState = {
        representation: 'decimated',
        ...DEFAULT_CAMERA_STATE,
        sunYaw: -40,
        sunPitch: 34,
        showGround: true
    };
    onCameraChange: ((state: ModelViewerCameraState) => void) | null = null;
    suppressCameraChange = false;
    animationFrameId = 0;
    automationMode = false;

    constructor(container: HTMLDivElement, options: {
        onCameraChange?: (state: ModelViewerCameraState) => void;
        quality?: 'interactive' | 'test';
    } = {}) {
        if (!supportsWebGLContext()) {
            throw new Error('WebGL preview is unavailable in this browser context.');
        }
        this.container = container;
        this.onCameraChange = options.onCameraChange || null;
        this.automationMode = options.quality === 'test';
        this.renderer = new THREE.WebGLRenderer({
            antialias: !this.automationMode,
            powerPreference: this.automationMode ? 'low-power' : 'high-performance'
        });
        this.renderer.setPixelRatio(this.automationMode ? 1 : Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.shadowMap.enabled = !this.automationMode;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x10161d);
        this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.ambientLight = new THREE.HemisphereLight(0xdbe6f0, 0x22303b, 0.45);
        this.dirLight = new THREE.DirectionalLight(0xffffff, 2.4);
        this.fillLight = new THREE.DirectionalLight(0x9bb6d2, 0.28);
        this.ground = new THREE.Mesh(
            new THREE.CircleGeometry(12, 64),
            new THREE.MeshStandardMaterial({ color: 0x53606e, roughness: 0.98, metalness: 0.0 })
        );
        this.initializeScene();
    }

    initializeScene() {
        this.renderer.setSize(this.container.clientWidth || 800, this.container.clientHeight || 600, false);
        this.renderer.domElement.setAttribute("role", "img");
        this.renderer.domElement.setAttribute("aria-label", "3D Model Preview");
        this.container.appendChild(this.renderer.domElement);
        this.controls.enablePan = false;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.rotateSpeed = 0.7;
        this.controls.zoomSpeed = 0.9;
        this.controls.minDistance = CAMERA_LIMITS.minDistance;
        this.controls.maxDistance = CAMERA_LIMITS.maxDistance;
        this.controls.minPolarAngle = degToRad(90 - CAMERA_LIMITS.maxPitch);
        this.controls.maxPolarAngle = degToRad(90 - CAMERA_LIMITS.minPitch);
        this.controls.target.copy(this.target);
        this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
        this.controls.touches.ONE = THREE.TOUCH.ROTATE;
        this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
        this.controls.addEventListener('change', () => {
            this.cameraPosUniform.value.copy(this.camera.position);
            this.emitCameraChange();
        });
        this.scene.add(this.ambientLight);
        this.dirLight.castShadow = !this.automationMode;
        this.dirLight.shadow.mapSize.set(this.automationMode ? 1024 : 2048, this.automationMode ? 1024 : 2048);
        this.dirLight.shadow.camera.near = 0.1;
        this.dirLight.shadow.camera.far = 40;
        this.dirLight.shadow.camera.left = -10;
        this.dirLight.shadow.camera.right = 10;
        this.dirLight.shadow.camera.top = 10;
        this.dirLight.shadow.camera.bottom = -10;
        this.scene.add(this.dirLight);
        this.scene.add(this.dirLight.target);
        this.scene.add(this.fillLight);
        this.scene.add(this.fillLight.target);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = -0.002;
        this.ground.receiveShadow = !this.automationMode;
        this.scene.add(this.ground);
        this.scene.add(this.slots.mesh);
        this.scene.add(this.slots.meshSecondary);
        this.scene.add(this.slots.impostor);
        this.startRenderLoop();
        this.resize();
    }

    resize() {
        const width = this.container.clientWidth || 1;
        const height = this.container.clientHeight || 1;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / Math.max(1, height);
        this.camera.updateProjectionMatrix();
        this.controls.update();
        this.render();
    }

    clearGroup(group: THREE.Group) {
        while (group.children.length > 0) {
            const child = group.children.pop();
            if (!child) continue;
            group.remove(child);
        }
    }

    async loadMesh(url: string) {
        if (!this.cache.meshes.has(url)) {
            this.cache.meshes.set(url, loadMeshAsset(url));
        }
        return this.cache.meshes.get(url);
    }

    async loadImpostor(detail: WorldAssetDetail) {
        const cacheKey = detail.assetName;
        if (!this.cache.impostors.has(cacheKey)) {
            this.cache.impostors.set(cacheKey, loadImpostorAsset(detail, this.lightDirUniform, this.cameraPosUniform));
        }
        return this.cache.impostors.get(cacheKey);
    }

    applyPreviewState(state: ModelViewerPreviewState) {
        this.currentPreviewState = state;
        const cameraState = clampCameraState(state);
        const spherical = new THREE.Spherical(
            cameraState.cameraDistance,
            Math.PI / 2 - degToRad(cameraState.cameraPitch),
            degToRad(cameraState.cameraYaw)
        );
        const cameraPosition = new THREE.Vector3().setFromSpherical(spherical).add(this.target);
        this.suppressCameraChange = true;
        this.camera.position.copy(cameraPosition);
        this.controls.target.copy(this.target);
        this.camera.lookAt(this.controls.target);
        this.camera.updateMatrixWorld(true);
        this.controls.update();
        this.suppressCameraChange = false;
        this.cameraPosUniform.value.copy(this.camera.position);

        const sunSpherical = new THREE.Spherical(
            9,
            Math.PI / 2 - degToRad(state.sunPitch),
            degToRad(state.sunYaw)
        );
        const sunPosition = new THREE.Vector3().setFromSpherical(sunSpherical).add(this.target);
        this.dirLight.position.copy(sunPosition);
        this.dirLight.target.position.copy(this.target);
        this.dirLight.target.updateMatrixWorld(true);
        this.fillLight.position.copy(sunPosition).multiplyScalar(-0.55);
        this.fillLight.position.y = Math.max(1.5, this.fillLight.position.y + 1.4);
        this.fillLight.target.position.copy(this.target);
        this.fillLight.target.updateMatrixWorld(true);
        this.lightDirUniform.value.copy(this.dirLight.position).sub(this.dirLight.target.position).normalize();
        this.ground.visible = state.showGround;
    }

    async showAsset(detail: WorldAssetDetail, state: ModelViewerPreviewState) {
        this.clearGroup(this.slots.mesh);
        this.clearGroup(this.slots.meshSecondary);
        this.clearGroup(this.slots.impostor);

        const addMeshToGroup = async (url: string, group: THREE.Group, offsetX = 0) => {
            const loaded = await this.loadMesh(url);
            const instance = loaded.scene.clone(true);
            instance.position.x = offsetX;
            instance.traverse((object) => {
                if ((object as THREE.Mesh).isMesh) {
                    const mesh = object as THREE.Mesh;
                    mesh.castShadow = !this.automationMode;
                    mesh.receiveShadow = false;
                    mesh.material = Array.isArray(mesh.material)
                        ? mesh.material.map((entry) => entry.clone())
                        : mesh.material.clone();
                }
            });
            group.add(instance);
            return loaded.metrics;
        };

        let fitRadius = 0.8;
        if (state.representation === 'source' && detail.files.source.urlPath) {
            const metrics = await addMeshToGroup(detail.files.source.urlPath, this.slots.mesh);
            fitRadius = this.computeFitRadius(metrics.width, metrics.height, metrics.depth);
        } else if (state.representation === 'decimated' && detail.files.decimated.urlPath) {
            const metrics = await addMeshToGroup(detail.files.decimated.urlPath, this.slots.mesh);
            fitRadius = this.computeFitRadius(metrics.width, metrics.height, metrics.depth);
        } else if (state.representation === 'gameReady' && detail.files.gameReady.urlPath) {
            const metrics = await addMeshToGroup(detail.files.gameReady.urlPath, this.slots.mesh);
            fitRadius = this.computeFitRadius(metrics.width, metrics.height, metrics.depth);
        } else if (state.representation === 'impostor' && detail.files.impostor?.metadata.urlPath) {
            const impostor = await this.loadImpostor(detail);
            this.slots.impostor.add(impostor.mesh.clone());
            fitRadius = this.computeFitRadius(impostor.metrics.width, impostor.metrics.height, impostor.metrics.depth);
        } else if (state.representation === 'sideBySide' && detail.files.impostor?.metadata.urlPath) {
            let meshMetrics = null;
            if (detail.files.decimated.urlPath) {
                meshMetrics = await addMeshToGroup(detail.files.decimated.urlPath, this.slots.mesh, -1.5);
            }
            const impostor = await this.loadImpostor(detail);
            const instance = impostor.mesh.clone();
            instance.position.x = 1.5;
            this.slots.impostor.add(instance);
            fitRadius = this.computeFitRadius(
                Math.max(meshMetrics?.width ?? 0.9, impostor.metrics.width) + 3,
                Math.max(meshMetrics?.height ?? 1, impostor.metrics.height),
                Math.max(meshMetrics?.depth ?? 0.9, impostor.metrics.depth)
            );
        }

        this.currentFitDistance = fitDistanceForRadius(fitRadius, this.camera.fov);
        this.applyPreviewState(state);
    }

    resetView() {
        this.applyPreviewState({
            ...this.currentPreviewState,
            ...DEFAULT_CAMERA_STATE,
            cameraDistance: Math.max(DEFAULT_CAMERA_STATE.cameraDistance, this.currentFitDistance)
        });
        this.emitCameraChange();
    }

    fitCurrentAsset() {
        this.applyPreviewState({
            ...this.currentPreviewState,
            ...this.getCameraState(),
            cameraDistance: this.currentFitDistance,
        });
        this.emitCameraChange();
    }

    getCameraState(): ModelViewerCameraState {
        const offset = this.camera.position.clone().sub(this.controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        return clampCameraState({
            cameraYaw: normalizeYaw(THREE.MathUtils.radToDeg(spherical.theta)),
            cameraPitch: 90 - THREE.MathUtils.radToDeg(spherical.phi),
            cameraDistance: spherical.radius
        });
    }

    computeFitRadius(width: number, height: number, depth: number) {
        return Math.max(0.5, Math.sqrt((width * width) + (height * height) + (depth * depth)) * 0.5);
    }

    emitCameraChange() {
        if (this.suppressCameraChange || !this.onCameraChange) return;
        this.onCameraChange(this.getCameraState());
    }

    startRenderLoop() {
        const tick = () => {
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
            this.animationFrameId = window.requestAnimationFrame(tick);
        };
        this.animationFrameId = window.requestAnimationFrame(tick);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.clearGroup(this.slots.mesh);
        this.clearGroup(this.slots.meshSecondary);
        this.clearGroup(this.slots.impostor);
        window.cancelAnimationFrame(this.animationFrameId);
        this.controls.dispose();
        this.ground.geometry.dispose();
        disposeMaterial(this.ground.material);
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
