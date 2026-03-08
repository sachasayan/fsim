export function getTerrainEditBounds(edit) {
    if (edit?.bounds) return edit.bounds;
    if (Array.isArray(edit?.points) && edit.points.length > 0) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const [x, z] of edit.points) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
        return {
            minX: minX - edit.radius,
            maxX: maxX + edit.radius,
            minZ: minZ - edit.radius,
            maxZ: maxZ + edit.radius
        };
    }
    return {
        minX: edit.x - edit.radius,
        maxX: edit.x + edit.radius,
        minZ: edit.z - edit.radius,
        maxZ: edit.z + edit.radius
    };
}

export function refreshTerrainEditGeometry(edit) {
    if (Array.isArray(edit?.points) && edit.points.length > 0) {
        let sumX = 0;
        let sumZ = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const [x, z] of edit.points) {
            sumX += x;
            sumZ += z;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
        edit.x = Math.round(sumX / edit.points.length);
        edit.z = Math.round(sumZ / edit.points.length);
        edit.bounds = {
            minX: minX - edit.radius,
            maxX: maxX + edit.radius,
            minZ: minZ - edit.radius,
            maxZ: maxZ + edit.radius
        };
        return;
    }
    edit.bounds = {
        minX: edit.x - edit.radius,
        maxX: edit.x + edit.radius,
        minZ: edit.z - edit.radius,
        maxZ: edit.z + edit.radius
    };
}

export function invalidateTerrainEdit(edit, tileManager) {
    const bounds = getTerrainEditBounds(edit);
    tileManager.invalidateWorldRect(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
}

export function isTerrainStroke(edit, isTerrainEdit) {
    return isTerrainEdit(edit) && Array.isArray(edit.points) && edit.points.length > 0;
}

export function moveTerrainStrokePoint(edit, index, worldPos, deps) {
    const { isTerrainEdit, tileManager } = deps;
    if (!isTerrainStroke(edit, isTerrainEdit) || index < 0 || index >= edit.points.length) return;
    invalidateTerrainEdit(edit, tileManager);
    edit.points[index][0] = Math.round(worldPos.x);
    edit.points[index][1] = Math.round(worldPos.z);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit, tileManager);
}

export function insertTerrainStrokePoint(edit, insertIndex, worldPos, deps) {
    const { isTerrainEdit, tileManager } = deps;
    if (!isTerrainStroke(edit, isTerrainEdit)) return false;
    invalidateTerrainEdit(edit, tileManager);
    edit.points.splice(insertIndex, 0, [Math.round(worldPos.x), Math.round(worldPos.z)]);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit, tileManager);
    return true;
}

export function removeTerrainStrokePoint(edit, index, deps) {
    const { isTerrainEdit, tileManager } = deps;
    if (!isTerrainStroke(edit, isTerrainEdit) || edit.points.length <= 1 || index < 0 || index >= edit.points.length) return false;
    invalidateTerrainEdit(edit, tileManager);
    edit.points.splice(index, 1);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit, tileManager);
    return true;
}

export function createTerrainStroke(worldPos, deps) {
    const {
        currentTool,
        terrainBrush,
        sampleTerrainHeight,
        worldData,
        tileManager
    } = deps;
    const baseHeight = sampleTerrainHeight(worldPos.x, worldPos.z);
    const edit = {
        kind: currentTool.replace('terrain-', ''),
        x: Math.round(worldPos.x),
        z: Math.round(worldPos.z),
        radius: terrainBrush.radius,
        delta: terrainBrush.strength,
        points: [[Math.round(worldPos.x), Math.round(worldPos.z)]]
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

export function appendTerrainStrokePoint(edit, worldPos, deps) {
    const { tileManager } = deps;
    if (!Array.isArray(edit?.points) || edit.points.length === 0) return false;
    const nextPoint = [Math.round(worldPos.x), Math.round(worldPos.z)];
    const lastPoint = edit.points[edit.points.length - 1];
    const minSpacing = Math.max(10, edit.radius * 0.12);
    if (Math.hypot(nextPoint[0] - lastPoint[0], nextPoint[1] - lastPoint[1]) < minSpacing) return false;
    const prevBounds = getTerrainEditBounds(edit);
    tileManager.invalidateWorldRect(prevBounds.minX, prevBounds.minZ, prevBounds.maxX, prevBounds.maxZ);
    edit.points.push(nextPoint);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit, tileManager);
    return true;
}
