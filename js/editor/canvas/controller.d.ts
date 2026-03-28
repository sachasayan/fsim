import type { EditorDocument, EditorStore, EditorWorldPoint } from '../core/types.js';

export interface EditorCanvasController {
    init(): Promise<void>;
    destroy(): void;
    frameSelection(): void;
    frameTerrainHydrology(): void;
    reloadStaticWorld(): Promise<void>;
    resetView(): void;
    scheduleRender(): void;
}

export function clampViewportToWorld(
    viewport: { x?: number; z?: number; zoom?: number } | null | undefined,
    canvasSize: { width?: number; height?: number } | null | undefined,
    worldSize?: number
): { x: number; z: number; zoom: number };

export function shouldClearSelectionOnPointerRelease(
    state: {
        tools?: { currentTool?: string };
        document: EditorDocument;
        selection: { selectedId?: string | null };
    },
    pendingCanvasPan: unknown,
    isPanning: boolean
): boolean;

export function getTerrainEditBoundsById(document: EditorDocument): Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>;

export function invalidateChangedTerrainTiles(
    tileManager: { invalidateWorldRect(minX: number, minZ: number, maxX: number, maxZ: number): void },
    previousBoundsById: Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>,
    nextDocument: EditorDocument
): Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>;

export function reconcileTerrainTileInvalidation(args: {
    tileManager: { invalidateAll(): void; invalidateWorldRect(minX: number, minZ: number, maxX: number, maxZ: number): void };
    previousDocumentRef: EditorDocument;
    previousTerrainEditBoundsById: Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>;
    previousTerrainLabVersion: number;
    nextState: ReturnType<EditorStore['getState']>;
}): {
    previousDocumentRef: EditorDocument;
    previousTerrainEditBoundsById: Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>;
    previousTerrainLabVersion: number;
};

export function createEditorCanvasController(args: {
    canvas: HTMLCanvasElement;
    coordsElement: HTMLElement;
    store: EditorStore;
}): EditorCanvasController;
