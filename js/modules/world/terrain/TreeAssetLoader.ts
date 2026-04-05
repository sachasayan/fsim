// @ts-check

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { buildOctahedralFrameDirections } from './TreeImpostorUtils.js';
import { createTreeBillboardTexture } from './TerrainTextures.js';

const DRACO_DECODER_PATH = '/node_modules/three/examples/jsm/libs/draco/gltf/';
const DEFAULT_TREE_MODEL_URL = '/world/assets/decimated/scenery/tree-1.glb';
const DEFAULT_TREE_IMPOSTOR_BASE_URL = '/world/impostors/tree-1';

/** @typedef {{ geometry: THREE.BufferGeometry, material: THREE.Material }} TreeMeshPart */
/** @typedef {{ width: number, height: number, depth: number }} TreeModelMetrics */
/**
 * @typedef {{
 *   version?: number,
 *   frameSize?: number,
 *   atlasWidth?: number,
 *   atlasHeight?: number,
 *   frameCount?: number,
 *   grid?: { cols?: number, rows?: number },
 *   directions?: Array<THREE.Vector3 | [number, number, number] | { x?: number, y?: number, z?: number }>,
 *   normalSpace?: 'frame-local' | 'object',
 *   depthEncoding?: 'orthographic-normalized' | string,
 *   depthRange?: { near?: number, far?: number },
 *   viewBlendMode?: 'grid-bilinear' | string
 * }} TreeImpostorMetadata
 */
/** @typedef {{ metadata: TreeImpostorMetadata, albedoTexture: THREE.Texture, normalTexture: THREE.Texture, depthTexture: THREE.Texture }} TreeImpostorTextures */
/** @typedef {{ meshParts: TreeMeshPart[], modelMetrics: TreeModelMetrics, impostor: TreeImpostorTextures }} TreeAssetBundle */

let cachedBundlePromise = null;

function getBrowserAssetBaseUrl() {
    const href = typeof window !== 'undefined' ? window.location?.href || '' : '';
    return /^https?:/i.test(href) ? href : null;
}

function createGltfLoader() {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    return { loader, dracoLoader };
}

function textureUrl(texture) {
    const source = texture?.source?.data || texture?.image || null;
    return source?.currentSrc || source?.src || texture?.name || '';
}

function materialMergeKey(material) {
    if (!material) return 'material:none';
    const color = material.color ? material.color.getHexString() : 'ffffff';
    return [
        material.type || 'Material',
        color,
        material.alphaTest || 0,
        material.transparent ? 't' : 'o',
        material.side || 0,
        textureUrl(material.map),
        textureUrl(material.normalMap),
        textureUrl(material.alphaMap)
    ].join('|');
}

function cloneTreeMaterial(material) {
    const cloned = material.clone();
    if (cloned.map) cloned.map.colorSpace = THREE.SRGBColorSpace;
    if (cloned.normalMap) cloned.normalMap.colorSpace = THREE.NoColorSpace;
    if (cloned.alphaMap) cloned.alphaMap.colorSpace = THREE.NoColorSpace;
    cloned.alphaTest = Math.max(0.2, Number(cloned.alphaTest) || 0);
    cloned.side = cloned.transparent || cloned.alphaTest > 0 ? THREE.DoubleSide : cloned.side;
    cloned.shadowSide = THREE.FrontSide;
    cloned.transparent = cloned.transparent || cloned.alphaTest > 0;
    cloned.needsUpdate = true;
    return cloned;
}

async function loadTexture(url, colorSpace = THREE.NoColorSpace) {
    const loader = new THREE.TextureLoader();
    const texture = await loader.loadAsync(url);
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}

async function loadTreeMeshParts(modelUrl) {
    const baseUrl = getBrowserAssetBaseUrl();
    if (!baseUrl) {
        return [];
    }
    const { loader, dracoLoader } = createGltfLoader();
    try {
        const gltf = await loader.loadAsync(new URL(modelUrl, baseUrl).toString());
        gltf.scene.updateMatrixWorld(true);
        const rootInverse = gltf.scene.matrixWorld.clone().invert();
        /** @type {Map<string, { geometries: THREE.BufferGeometry[], material: THREE.Material }>} */
        const grouped = new Map();

        gltf.scene.traverse((child) => {
            if (!child.isMesh || !child.geometry || !child.material) return;
            const material = Array.isArray(child.material) ? child.material[0] : child.material;
            if (!material) return;
            const geometry = child.geometry.clone();
            const localMatrix = new THREE.Matrix4().copy(rootInverse).multiply(child.matrixWorld);
            geometry.applyMatrix4(localMatrix);
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            const key = materialMergeKey(material);
            if (!grouped.has(key)) {
                grouped.set(key, {
                    geometries: [],
                    material: cloneTreeMaterial(material)
                });
            }
            grouped.get(key)?.geometries.push(geometry);
        });

        /** @type {TreeMeshPart[]} */
        const meshParts = [];
        for (const group of grouped.values()) {
            const mergedGeometry = mergeGeometries(group.geometries, false);
            if (!mergedGeometry) continue;
            mergedGeometry.computeVertexNormals();
            mergedGeometry.computeBoundingBox();
            mergedGeometry.computeBoundingSphere();
            meshParts.push({
                geometry: mergedGeometry,
                material: group.material
            });
        }
        const combinedBounds = new THREE.Box3();
        let hasBounds = false;
        for (const part of meshParts) {
            part.geometry.computeBoundingBox();
            const bounds = part.geometry.boundingBox;
            if (!bounds) continue;
            if (!hasBounds) {
                combinedBounds.copy(bounds);
                hasBounds = true;
            } else {
                combinedBounds.union(bounds);
            }
        }
        if (!hasBounds) {
            return {
                meshParts,
                modelMetrics: { width: 1, height: 1, depth: 1 }
            };
        }

        const size = new THREE.Vector3();
        combinedBounds.getSize(size);
        const center = new THREE.Vector3(
            (combinedBounds.min.x + combinedBounds.max.x) * 0.5,
            combinedBounds.min.y,
            (combinedBounds.min.z + combinedBounds.max.z) * 0.5
        );
        const normalizeScale = 1 / Math.max(size.y, 1e-4);

        for (const part of meshParts) {
            part.geometry.translate(-center.x, -center.y, -center.z);
            part.geometry.scale(normalizeScale, normalizeScale, normalizeScale);
            part.geometry.computeBoundingBox();
            part.geometry.computeBoundingSphere();
        }

        return {
            meshParts,
            modelMetrics: {
                width: size.x * normalizeScale,
                height: size.y * normalizeScale,
                depth: size.z * normalizeScale
            }
        };
    } finally {
        dracoLoader.dispose();
    }
}

async function loadTreeImpostorTextures(baseUrl) {
    const browserBaseUrl = getBrowserAssetBaseUrl();
    if (!browserBaseUrl) {
        return createFallbackTreeImpostorTextures();
    }
    try {
        const metadataUrl = new URL(`${baseUrl}/metadata.json`, browserBaseUrl).toString();
        const metadataResponse = await fetch(metadataUrl);
        if (!metadataResponse.ok) {
            throw new Error(`Failed to load tree impostor metadata from ${metadataUrl}`);
        }
        const metadata = await metadataResponse.json();
        if (!Array.isArray(metadata?.directions) || metadata.directions.length === 0) {
            const gridSize = Math.max(1, Number(metadata?.grid?.cols) || 4);
            metadata.directions = buildOctahedralFrameDirections(gridSize).map((direction) => direction.toArray());
        }
        metadata.directions = metadata.directions.map((direction) => {
            if (direction instanceof THREE.Vector3) return direction.clone();
            if (Array.isArray(direction)) return new THREE.Vector3(direction[0] || 0, direction[1] || 0, direction[2] || 0).normalize();
            return new THREE.Vector3(direction?.x || 0, direction?.y || 0, direction?.z || 0).normalize();
        });
        metadata.grid = {
            cols: Math.max(1, Number(metadata?.grid?.cols) || Math.round(Math.sqrt(metadata.directions.length)) || 1),
            rows: Math.max(1, Number(metadata?.grid?.rows) || Math.round(Math.sqrt(metadata.directions.length)) || 1)
        };
        metadata.frameCount = metadata.directions.length;
        metadata.normalSpace = metadata?.normalSpace === 'object' ? 'object' : 'frame-local';
        metadata.depthEncoding = metadata?.depthEncoding || 'orthographic-normalized';
        metadata.depthRange = {
            near: Number(metadata?.depthRange?.near) || 0,
            far: Number(metadata?.depthRange?.far) || 1
        };

        const [albedoTexture, normalTexture, depthTexture] = await Promise.all([
            loadTexture(new URL(`${baseUrl}/albedo.png`, browserBaseUrl).toString(), THREE.SRGBColorSpace),
            loadTexture(new URL(`${baseUrl}/normal.png`, browserBaseUrl).toString(), THREE.NoColorSpace),
            loadTexture(new URL(`${baseUrl}/depth.png`, browserBaseUrl).toString(), THREE.NoColorSpace)
        ]);

        return {
            metadata,
            albedoTexture,
            normalTexture,
            depthTexture
        };
    } catch (error) {
        console.warn(`[terrain] Falling back to generated impostor atlas because baked atlas load failed for ${baseUrl}:`, error);
        return createFallbackTreeImpostorTextures();
    }
}

function createFlatAtlasTexture(size, rgb = [128, 255, 128, 255], colorSpace = THREE.NoColorSpace) {
    const data = new Uint8Array(size * size * 4);
    for (let index = 0; index < size * size; index += 1) {
        const offset = index * 4;
        data[offset + 0] = rgb[0];
        data[offset + 1] = rgb[1];
        data[offset + 2] = rgb[2];
        data[offset + 3] = rgb[3];
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}

function createFallbackTreeImpostorTextures() {
    const gridSize = 4;
    const frameSize = 256;
    const atlasSize = gridSize * frameSize;
    const metadata = {
        version: 0,
        frameSize,
        atlasWidth: atlasSize,
        atlasHeight: atlasSize,
        frameCount: gridSize * gridSize,
        grid: { cols: gridSize, rows: gridSize },
        directions: buildOctahedralFrameDirections(gridSize),
        normalSpace: 'frame-local',
        depthEncoding: 'orthographic-normalized',
        depthRange: { near: 0, far: 1 }
    };

    if (typeof document === 'undefined') {
        return {
            metadata,
            albedoTexture: createFlatAtlasTexture(atlasSize, [255, 255, 255, 255], THREE.SRGBColorSpace),
            normalTexture: createFlatAtlasTexture(atlasSize, [128, 255, 128, 255], THREE.NoColorSpace),
            depthTexture: createFlatAtlasTexture(atlasSize, [255, 255, 255, 255], THREE.NoColorSpace)
        };
    }

    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = atlasSize;
    albedoCanvas.height = atlasSize;
    const albedoCtx = albedoCanvas.getContext('2d');
    const sourceImage = createTreeBillboardTexture('broadleaf', { crownOnly: true }).image;
    for (let row = 0; row < gridSize; row += 1) {
        for (let col = 0; col < gridSize; col += 1) {
            albedoCtx.drawImage(sourceImage, col * frameSize, row * frameSize, frameSize, frameSize);
        }
    }
    const albedoTexture = new THREE.CanvasTexture(albedoCanvas);
    albedoTexture.colorSpace = THREE.SRGBColorSpace;
    albedoTexture.minFilter = THREE.LinearMipMapLinearFilter;
    albedoTexture.magFilter = THREE.LinearFilter;
    albedoTexture.generateMipmaps = true;

    return {
        metadata,
        albedoTexture,
        normalTexture: createFlatAtlasTexture(atlasSize, [128, 255, 128, 255], THREE.NoColorSpace),
        depthTexture: createFlatAtlasTexture(atlasSize, [255, 255, 255, 255], THREE.NoColorSpace)
    };
}

export function getTreeAssetBundle({
    modelUrl = DEFAULT_TREE_MODEL_URL,
    impostorBaseUrl = DEFAULT_TREE_IMPOSTOR_BASE_URL
} = {}) {
    if (!cachedBundlePromise) {
        cachedBundlePromise = Promise.allSettled([
            loadTreeMeshParts(modelUrl),
            loadTreeImpostorTextures(impostorBaseUrl)
        ]).then((results) => {
            const meshAsset = results[0].status === 'fulfilled'
                ? results[0].value
                : { meshParts: [], modelMetrics: { width: 1, height: 1, depth: 1 } };
            if (results[0].status !== 'fulfilled') {
                console.warn('[terrain] Failed to load tree-1 mesh parts:', results[0].reason);
            }

            const impostor = results[1].status === 'fulfilled'
                ? results[1].value
                : createFallbackTreeImpostorTextures();
            if (results[1].status !== 'fulfilled') {
                console.warn('[terrain] Failed to load tree-1 impostor resources, using generated fallback atlas:', results[1].reason);
            }

            return { meshParts: meshAsset.meshParts, modelMetrics: meshAsset.modelMetrics, impostor };
        });
    }
    return cachedBundlePromise;
}
