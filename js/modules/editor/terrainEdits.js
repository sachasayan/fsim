// @ts-check

/**
 * @typedef {[number, number]} Point2
 * @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number }} Bounds
 * @typedef {{ x: number, z: number, radius?: number, kind: string, bounds?: Bounds, points?: Point2[] | number[][], delta?: number, opacity?: number, target_height?: number }} TerrainEditLike
 * @typedef {{ x: number, z: number }} WorldPointLike
 * @typedef {{ invalidateWorldRect: (minX: number, minZ: number, maxX: number, maxZ: number) => void }} TileManagerLike
 */

/**
 * @param {unknown} point
 * @returns {point is Point2}
 */
function isPoint2(point) {
    return Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

/**
 * @param {unknown} value
 * @returns {value is TerrainEditLike}
 */
function isTerrainEditRecord(value) {
    return !!value && typeof value === 'object';
}

/**
 * @param {TerrainEditLike} edit
 * @returns {Bounds}
 */
export function getTerrainEditBounds(edit) {
    if (edit?.bounds) return edit.bounds;
    if (Array.isArray(edit?.points) && edit.points.length > 0) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const point of edit.points) {
            if (!isPoint2(point)) continue;
            const [x, z] = point;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
        const radius = Number.isFinite(edit.radius) ? edit.radius : 0;
        return {
            minX: minX - radius,
            maxX: maxX + radius,
            minZ: minZ - radius,
            maxZ: maxZ + radius
        };
    }
    const radius = Number.isFinite(edit.radius) ? edit.radius : 0;
    return {
        minX: edit.x - radius,
        maxX: edit.x + radius,
        minZ: edit.z - radius,
        maxZ: edit.z + radius
    };
}

/**
 * @param {TerrainEditLike} edit
 * @returns {void}
 */
export function refreshTerrainEditGeometry(edit) {
    if (Array.isArray(edit?.points) && edit.points.length > 0) {
        let sumX = 0;
        let sumZ = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        let pointCount = 0;
        for (const point of edit.points) {
            if (!isPoint2(point)) continue;
            const [x, z] = point;
            sumX += x;
            sumZ += z;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
            pointCount += 1;
        }
        if (pointCount <= 0) return;
        const radius = Number.isFinite(edit.radius) ? edit.radius : 0;
        edit.x = Math.round(sumX / pointCount);
        edit.z = Math.round(sumZ / pointCount);
        edit.bounds = {
            minX: minX - radius,
            maxX: maxX + radius,
            minZ: minZ - radius,
            maxZ: maxZ + radius
        };
        return;
    }
    const radius = Number.isFinite(edit.radius) ? edit.radius : 0;
    edit.bounds = {
        minX: edit.x - radius,
        maxX: edit.x + radius,
        minZ: edit.z - radius,
        maxZ: edit.z + radius
    };
}

/**
 * @param {TerrainEditLike} edit
 * @param {TileManagerLike} tileManager
 * @returns {void}
 */
export function invalidateTerrainEdit(edit, tileManager) {
    const bounds = getTerrainEditBounds(edit);
    tileManager.invalidateWorldRect(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
}

/**
 * @param {unknown} edit
 * @param {(value: unknown) => boolean} isTerrainEdit
 * @returns {edit is TerrainEditLike}
 */
export function isTerrainStroke(edit, isTerrainEdit) {
    return isTerrainEdit(edit) && isTerrainEditRecord(edit) && Array.isArray(edit.points) && edit.points.length > 0;
}

/**
 * @param {unknown} edit
 * @param {number} index
 * @param {WorldPointLike} worldPos
 * @param {{ isTerrainEdit: (value: unknown) => boolean, tileManager: TileManagerLike }} deps
 * @returns {void}
 */
export function moveTerrainStrokePoint(edit, index, worldPos, deps) {
    const { isTerrainEdit, tileManager } = deps;
    if (!isTerrainStroke(edit, isTerrainEdit) || index < 0 || index >= edit.points.length) return;
    invalidateTerrainEdit(edit, tileManager);
    edit.points[index][0] = Math.round(worldPos.x);
    edit.points[index][1] = Math.round(worldPos.z);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit, tileManager);
}

/**
 * @param {unknown} edit
 * @param {number} insertIndex
 * @param {WorldPointLike} worldPos
 * @param {{ isTerrainEdit: (value: unknown) => boolean, tileManager: TileManagerLike }} deps
 * @returns {boolean}
 */
export function insertTerrainStrokePoint(edit, insertIndex, worldPos, deps) {
    const { isTerrainEdit, tileManager } = deps;
    if (!isTerrainStroke(edit, isTerrainEdit)) return false;
    invalidateTerrainEdit(edit, tileManager);
    edit.points.splice(insertIndex, 0, [Math.round(worldPos.x), Math.round(worldPos.z)]);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit, tileManager);
    return true;
}

/**
 * @param {unknown} edit
 * @param {number} index
 * @param {{ isTerrainEdit: (value: unknown) => boolean, tileManager: TileManagerLike }} deps
 * @returns {boolean}
 */
export function removeTerrainStrokePoint(edit, index, deps) {
    const { isTerrainEdit, tileManager } = deps;
    if (!isTerrainStroke(edit, isTerrainEdit) || edit.points.length <= 1 || index < 0 || index >= edit.points.length) return false;
    invalidateTerrainEdit(edit, tileManager);
    edit.points.splice(index, 1);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit, tileManager);
    return true;
}

/**
 * @param {WorldPointLike} worldPos
 * @param {{
 *   currentTool: string,
 *   terrainBrush?: { radius: number, strength: number },
 *   sampleTerrainHeight?: (x: number, z: number) => number,
 *   worldData: { terrainEdits: TerrainEditLike[] },
 *   tileManager?: TileManagerLike
 * }} deps
 * @returns {TerrainEditLike}
 */
export function createTerrainStroke(worldPos, deps) {
    const {
        currentTool,
        terrainBrush = { radius: 0, strength: 0 },
        sampleTerrainHeight = () => 0,
        worldData,
        tileManager = { invalidateWorldRect() {} }
    } = deps;
    const baseHeight = sampleTerrainHeight(worldPos.x, worldPos.z);
    /** @type {TerrainEditLike} */
    const edit = {
        kind: currentTool.replace('terrain-', ''),
        x: Math.round(worldPos.x),
        z: Math.round(worldPos.z),
        radius: terrainBrush.radius,
        delta: terrainBrush.strength,
        points: [/** @type {Point2} */ ([Math.round(worldPos.x), Math.round(worldPos.z)])]
    };
    if (edit.kind === 'flatten') {
        edit.opacity = Math.max(0, Math.min(1, terrainBrush.strength));
        edit.target_height = Math.round(baseHeight);
        delete edit.delta;
    }
    refreshTerrainEditGeometry(edit);
    worldData.terrainEdits.push(edit);
    invalidateTerrainEdit(edit, tileManager);
    return edit;
}

/**
 * @param {unknown} edit
 * @param {WorldPointLike} worldPos
 * @param {{ tileManager: TileManagerLike }} deps
 * @returns {boolean}
 */
export function appendTerrainStrokePoint(edit, worldPos, deps) {
    const { tileManager } = deps;
    if (!isTerrainEditRecord(edit) || !Array.isArray(edit.points) || edit.points.length === 0) return false;
    /** @type {Point2} */
    const nextPoint = [Math.round(worldPos.x), Math.round(worldPos.z)];
    const lastPoint = edit.points[edit.points.length - 1];
    if (!isPoint2(lastPoint)) return false;
    const minSpacing = Math.max(10, (Number.isFinite(edit.radius) ? edit.radius : 0) * 0.12);
    if (Math.hypot(nextPoint[0] - lastPoint[0], nextPoint[1] - lastPoint[1]) < minSpacing) return false;
    const prevBounds = getTerrainEditBounds(edit);
    tileManager.invalidateWorldRect(prevBounds.minX, prevBounds.minZ, prevBounds.maxX, prevBounds.maxZ);
    edit.points.push(nextPoint);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit, tileManager);
    return true;
}
