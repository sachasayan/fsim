export type EditorEntityId = string;

export type EditorGroupId =
    | 'districts'
    | 'roads'
    | 'terrainRegions'
    | 'airports'
    | 'objects'
    | 'terrain'
    | 'vantage';

export type EditorTool =
    | 'select'
    | 'add-airport'
    | 'add-district'
    | 'add-object'
    | 'add-road'
    | 'terrain-region'
    | 'edit-poly'
    | 'terrain-raise'
    | 'terrain-lower'
    | 'terrain-flatten';

export interface EditorWorldPoint {
    x: number;
    z: number;
}

export interface EditorBounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export type EditorPoint2 = [number, number];

export interface EditorEntityBase {
    __editorId?: EditorEntityId;
    [key: string]: unknown;
}

export interface EditorDistrict extends EditorEntityBase {
    district_type?: string;
    type?: string;
    center: EditorPoint2;
    points?: EditorPoint2[];
    turbine_density?: number;
    rotor_radius?: number;
    setback?: number;
}

export interface EditorRoad extends EditorEntityBase {
    kind?: string;
    surface: string;
    width: number;
    feather?: number;
    center?: EditorPoint2;
    points: EditorPoint2[];
}

export interface EditorTerrainGenerator {
    preset?: string;
    seed?: number;
    macro?: {
        baseOffset?: number;
        continentalAmplitude?: number;
        ridgeAmplitude?: number;
        foothillAmplitude?: number;
        valleyAmplitude?: number;
        warpAmplitude?: number;
        rangeCount?: number;
        rangeLength?: number;
        rangeWidth?: number;
        upliftStrength?: number;
        massifStrength?: number;
        escarpmentStrength?: number;
        plateauHeight?: number;
        summitSharpness?: number;
        [key: string]: unknown;
    };
    landforms?: {
        glacialValleyStrength?: number;
        canyonDepth?: number;
        canyonWidth?: number;
        basinDepth?: number;
        basinBreadth?: number;
        [key: string]: unknown;
    };
    hydrology?: {
        riverCount?: number;
        riverStrength?: number;
        lakeCount?: number;
        lakeStrength?: number;
        erosionStrength?: number;
        gorgeStrength?: number;
        incisionBias?: number;
        floodplainWidth?: number;
        [key: string]: unknown;
    };
    preview?: {
        overlay?: string;
        resolution?: number;
        showContours?: boolean;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface EditorTerrainRegion extends EditorEntityBase {
    tileX: number;
    tileZ: number;
    tileWidth: number;
    tileHeight: number;
    terrainGenerator: EditorTerrainGenerator;
    bounds?: EditorBounds;
    center?: EditorPoint2;
}

export interface EditorAirport extends EditorEntityBase {
    template?: string;
    x: number;
    z: number;
    yaw: number;
    bounds?: EditorBounds;
}

export interface EditorAuthoredObject extends EditorEntityBase {
    assetId: string;
    x: number;
    y?: number;
    z: number;
    yaw?: number;
    scale?: number;
    heightMode?: string;
}

export interface EditorTerrainEdit extends EditorEntityBase {
    kind: string;
    x: number;
    z: number;
    radius?: number;
    delta?: number;
    target_height?: number;
    opacity?: number;
    points?: EditorPoint2[];
    bounds?: EditorBounds;
}

export interface EditorVantageEntity extends EditorEntityBase {
    x: number;
    z: number;
    y?: number;
    tilt?: number;
    fog?: number;
    clouds?: number;
    lighting?: string;
}

export type EditorEntity =
    | EditorDistrict
    | EditorRoad
    | EditorTerrainRegion
    | EditorAirport
    | EditorAuthoredObject
    | EditorTerrainEdit
    | EditorVantageEntity;

export interface EditorWorldData {
    districts: EditorDistrict[];
    roads: EditorRoad[];
    terrainRegions: EditorTerrainRegion[];
    airports: EditorAirport[];
    authoredObjects: EditorAuthoredObject[];
    terrainEdits: EditorTerrainEdit[];
    terrainGenerator: EditorTerrainGenerator;
    [key: string]: unknown;
}

export type EditorVantageData = Record<string, EditorVantageEntity>;

export interface EditorDocumentIndex {
    entitiesById: Map<EditorEntityId, EditorEntity>;
    groupIds: Record<EditorGroupId, EditorEntityId[]>;
    stableKeyById: Map<EditorEntityId, string>;
    idByStableKey: Map<string, EditorEntityId>;
}

export interface EditorDocument {
    worldData: EditorWorldData;
    vantageData: EditorVantageData;
    nextEntityId: number;
    index: EditorDocumentIndex;
}

export interface EditorActiveVertex {
    entityId: EditorEntityId;
    index: number;
}

export interface EditorSelection {
    selectedId: EditorEntityId | null;
    hoverId: EditorEntityId | null;
    activeVertex: EditorActiveVertex | null;
}

export interface EditorViewport {
    x: number;
    z: number;
    zoom: number;
    hoverWorldPos: EditorWorldPoint | null;
}

export interface EditorHistorySnapshot {
    document: EditorDocument;
    selection: EditorSelection;
}

export interface EditorHistoryState {
    undoStack: EditorHistorySnapshot[];
    redoStack: EditorHistorySnapshot[];
    dirty: boolean;
    lastCoalesceKey: string | null;
}

export interface EditorUiProgress {
    step: number;
    total: number;
    label: string;
}

export interface EditorToast {
    message: string;
    tone: string;
    timestamp: number;
}

export type EditorTerrainPreviewOverlay =
    | 'height'
    | 'rivers'
    | 'lakes'
    | 'moisture'
    | 'flow'
    | 'erosion'
    | 'gorge'
    | 'cliff'
    | 'floodplain'
    | 'talus';

export interface EditorTerrainPreviewSnapshot {
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    bounds: EditorBounds;
    overlayKind?: EditorTerrainPreviewOverlay;
    __canvas?: HTMLCanvasElement;
}

export interface EditorTerrainHydrologyRiver {
    points: EditorPoint2[];
}

export interface EditorTerrainHydrologyLake {
    x: number;
    z: number;
    radius: number;
}

export interface EditorTerrainHydrologySummary {
    cliffCoverage?: number;
    gorgeCoverage?: number;
    peakRelief?: number;
    [key: string]: unknown;
}

export interface EditorTerrainLabMetadata {
    hydrology: {
        rivers: EditorTerrainHydrologyRiver[];
        lakes: EditorTerrainHydrologyLake[];
        riverCount?: number;
        lakeCount?: number;
        summary?: EditorTerrainHydrologySummary;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface EditorTerrainRegionTile {
    tileX: number;
    tileZ: number;
}

export interface EditorTerrainRegionHover extends EditorTerrainRegionTile {
    ownerId?: EditorEntityId | null;
}

export interface EditorTerrainRegionSelectionTile extends EditorTerrainRegionTile {
    blocked?: boolean;
}

export interface EditorTerrainRegionSelection {
    startTile?: EditorTerrainRegionTile;
    endTile?: EditorTerrainRegionTile;
    mode?: 'move';
    entityId?: EditorEntityId;
    tileX?: number;
    tileZ?: number;
    bounds: EditorBounds;
    valid?: boolean;
    tiles: EditorTerrainRegionSelectionTile[];
}

export interface EditorStoreState {
    document: EditorDocument;
    viewport: EditorViewport;
    selection: EditorSelection;
    tools: {
        currentTool: EditorTool;
        snappingEnabled: boolean;
        terrainBrush: {
            radius: number;
            strength: number;
        };
        objectPlacement: {
            assetId: string;
            heightMode: string;
            y: number;
            yaw: number;
            scale: number;
        };
        airportPlacement: {
            yaw: number;
        };
    };
    history: EditorHistoryState;
    layers: {
        groupVisibility: Record<string, boolean>;
        groupLocked: Record<string, boolean>;
        collapsed: Record<string, boolean>;
        itemVisibility: Record<string, boolean>;
        itemLocked: Record<string, boolean>;
        filterText: string;
    };
    ui: {
        saveState: string;
        saveError: string;
        saveProgress: EditorUiProgress | null;
        rebuildState: string;
        rebuildError: string;
        rebuildProgress: EditorUiProgress | null;
        rebuildJobId: string | null;
        rebuildRequestId: string | null;
        toast: EditorToast | null;
        showHelp: boolean;
        terrainLab: {
            draftConfig: EditorTerrainGenerator;
            configVersion: number;
            previewStatus: string;
            previewDirty: boolean;
            previewSnapshot: EditorTerrainPreviewSnapshot | null;
            previewKey: string | null;
            activeSubtool: string;
            selectedOverlay: string | undefined;
            pendingApply: boolean;
            lastMetadata: EditorTerrainLabMetadata | null;
        };
        terrainRegionHover: EditorTerrainRegionHover | null;
        terrainRegionSelection: EditorTerrainRegionSelection | null;
    };
}

export interface EditorAction {
    type: string;
    [key: string]: unknown;
}

export interface EditorCommandBase {
    selectionId?: EditorEntityId | null;
    entityId?: EditorEntityId | null;
}

export interface EditorCommandOptions {
    coalesceKey?: string | null;
    context?: Record<string, unknown>;
}

export interface EditorCommandResult {
    document: EditorDocument;
    selectionId?: EditorEntityId | null;
}

export interface EditorCreateDistrictCommand extends EditorCommandBase {
    type: 'create-district';
    districtType?: string;
    center: EditorWorldPoint;
}

export interface EditorCreateRoadCommand extends EditorCommandBase {
    type: 'create-road';
    kind?: string;
    surface?: string;
    center: EditorWorldPoint;
}

export interface EditorCreateTerrainRegionCommand extends EditorCommandBase {
    type: 'create-terrain-region';
    tileX: number;
    tileZ: number;
    tileWidth: number;
    tileHeight: number;
    terrainGenerator: EditorTerrainGenerator;
}

export interface EditorCreateAuthoredObjectCommand extends EditorCommandBase {
    type: 'create-authored-object';
    assetId: string;
    center: EditorWorldPoint;
    y?: number;
    yaw?: number;
    scale?: number;
    heightMode?: string;
}

export interface EditorCreateAirportCommand extends EditorCommandBase {
    type: 'create-airport';
    center: EditorWorldPoint;
    yaw?: number;
}

export interface EditorCreateTerrainStrokeCommand extends EditorCommandBase {
    type: 'create-terrain-stroke';
    tool: Extract<EditorTool, 'terrain-raise' | 'terrain-lower' | 'terrain-flatten'>;
    worldPos: EditorWorldPoint;
}

export interface EditorAppendTerrainPointCommand extends EditorCommandBase {
    type: 'append-terrain-point';
    entityId: EditorEntityId;
    worldPos: EditorWorldPoint;
}

export interface EditorDeleteEntityCommand extends EditorCommandBase {
    type: 'delete-entity';
    entityId: EditorEntityId;
}

export interface EditorDuplicateEntityCommand extends EditorCommandBase {
    type: 'duplicate-entity';
    entityId: EditorEntityId;
}

export interface EditorMoveEntityCommand extends EditorCommandBase {
    type: 'move-entity';
    entityId: EditorEntityId;
    nextCenter?: EditorPoint2;
    nextPoint?: EditorWorldPoint;
    nextTileX?: number;
    nextTileZ?: number;
}

export interface EditorMoveVertexCommand extends EditorCommandBase {
    type: 'move-vertex';
    entityId: EditorEntityId;
    vertexIndex: number;
    point: EditorWorldPoint;
}

export interface EditorInsertVertexCommand extends EditorCommandBase {
    type: 'insert-vertex';
    entityId: EditorEntityId;
    insertIndex: number;
    point: EditorWorldPoint;
}

export interface EditorRemoveVertexCommand extends EditorCommandBase {
    type: 'remove-vertex';
    entityId: EditorEntityId;
    vertexIndex: number;
    minPoints: number;
}

export interface EditorChangePropertyCommand extends EditorCommandBase {
    type: 'change-property';
    entityId: EditorEntityId;
    key: string;
    value: unknown;
}

export interface EditorReplaceDocumentCommand extends EditorCommandBase {
    type: 'replace-document';
    worldData: EditorWorldData;
    vantageData: EditorVantageData;
    selectedId?: EditorEntityId | null;
}

export type EditorCommand =
    | EditorCreateDistrictCommand
    | EditorCreateRoadCommand
    | EditorCreateTerrainRegionCommand
    | EditorCreateAuthoredObjectCommand
    | EditorCreateAirportCommand
    | EditorCreateTerrainStrokeCommand
    | EditorAppendTerrainPointCommand
    | EditorDeleteEntityCommand
    | EditorDuplicateEntityCommand
    | EditorMoveEntityCommand
    | EditorMoveVertexCommand
    | EditorInsertVertexCommand
    | EditorRemoveVertexCommand
    | EditorChangePropertyCommand
    | EditorReplaceDocumentCommand;

export interface EditorRunCommandAction {
    type: 'run-command';
    command: EditorCommand;
    options?: EditorCommandOptions;
}

export interface EditorSetToolAction {
    type: 'set-tool';
    tool: EditorTool;
}

export interface EditorSetHoverAction {
    type: 'set-hover';
    hoverId: EditorEntityId | null;
    hoverWorldPos: EditorWorldPoint | null;
}

export interface EditorSetSelectionAction {
    type: 'set-selection';
    selectedId: EditorEntityId | null;
    activeVertex?: EditorActiveVertex | null;
}

export interface EditorSetActiveVertexAction {
    type: 'set-active-vertex';
    activeVertex: EditorActiveVertex | null;
}

export interface EditorSetCameraAction {
    type: 'set-camera';
    viewport: Partial<EditorViewport>;
}

export interface EditorSetLayerFilterAction {
    type: 'set-layer-filter';
    value: string;
}

export interface EditorToggleGroupCollapseAction {
    type: 'toggle-group-collapse';
    groupId: string;
}

export interface EditorToggleGroupVisibleAction {
    type: 'toggle-group-visible';
    groupId: string;
}

export interface EditorToggleGroupLockAction {
    type: 'toggle-group-lock';
    groupId: string;
}

export interface EditorToggleItemVisibleAction {
    type: 'toggle-item-visible';
    itemId: EditorEntityId;
}

export interface EditorToggleItemLockAction {
    type: 'toggle-item-lock';
    itemId: EditorEntityId;
}

export interface EditorSetSnappingAction {
    type: 'set-snapping';
    value: boolean;
}

export interface EditorSetTerrainBrushAction {
    type: 'set-terrain-brush';
    patch: Partial<EditorStoreState['tools']['terrainBrush']>;
}

export interface EditorSetObjectPlacementAction {
    type: 'set-object-placement';
    patch: Partial<EditorStoreState['tools']['objectPlacement']>;
}

export interface EditorSetAirportPlacementAction {
    type: 'set-airport-placement';
    patch: Partial<EditorStoreState['tools']['airportPlacement']>;
}

export interface EditorSetSaveStateAction {
    type: 'set-save-state';
    value: string;
    error?: string;
    progress?: EditorUiProgress | null;
}

export interface EditorSetSaveProgressAction {
    type: 'set-save-progress';
    progress: EditorUiProgress | null;
}

export interface EditorTrackRebuildJobAction {
    type: 'track-rebuild-job';
    value?: string;
    error?: string;
    progress?: EditorUiProgress | null;
    jobId?: string | null;
    requestId?: string | null;
}

export interface EditorSetRebuildStateAction {
    type: 'set-rebuild-state';
    value: string;
    error?: string;
    progress?: EditorUiProgress | null;
    jobId?: string | null;
    requestId?: string | null;
}

export interface EditorSetRebuildProgressAction {
    type: 'set-rebuild-progress';
    progress: EditorUiProgress | null;
}

export interface EditorSetToastAction {
    type: 'set-toast';
    toast: EditorToast | null;
}

export interface EditorSetTerrainRegionHoverAction {
    type: 'set-terrain-region-hover';
    hover: EditorTerrainRegionHover | null;
}

export interface EditorSetTerrainRegionSelectionAction {
    type: 'set-terrain-region-selection';
    selection: EditorTerrainRegionSelection | null;
}

export interface EditorClearTerrainRegionSelectionAction {
    type: 'clear-terrain-region-selection';
}

export interface EditorToggleHelpAction {
    type: 'toggle-help';
    value?: boolean;
}

export interface EditorSetTerrainGeneratorConfigAction {
    type: 'set-terrain-generator-config';
    path: string[];
    value: unknown;
}

export interface EditorSetTerrainPreviewAction {
    type: 'set-terrain-preview';
    snapshot: EditorTerrainPreviewSnapshot | null;
    previewKey: string | null;
    status?: string;
    previewDirty?: boolean;
    metadata?: EditorTerrainLabMetadata | null;
}

export interface EditorSetTerrainPreviewStatusAction {
    type: 'set-terrain-preview-status';
    status: string;
}

export interface EditorMarkTerrainPreviewDirtyAction {
    type: 'mark-terrain-preview-dirty';
    status?: string;
}

export interface EditorApplyTerrainGeneratorAction {
    type: 'apply-terrain-generator';
}

export interface EditorResetTerrainGeneratorAction {
    type: 'reset-terrain-generator';
}

export interface EditorMarkSavedAction {
    type: 'mark-saved';
}

export interface EditorReplaceDocumentAction {
    type: 'replace-document';
    document: EditorDocument;
    selectedId?: EditorEntityId | null;
}

export interface EditorUndoAction {
    type: 'undo';
}

export interface EditorRedoAction {
    type: 'redo';
}

export type EditorStoreAction =
    | EditorRunCommandAction
    | EditorSetToolAction
    | EditorSetHoverAction
    | EditorSetSelectionAction
    | EditorSetActiveVertexAction
    | EditorSetCameraAction
    | EditorSetLayerFilterAction
    | EditorToggleGroupCollapseAction
    | EditorToggleGroupVisibleAction
    | EditorToggleGroupLockAction
    | EditorToggleItemVisibleAction
    | EditorToggleItemLockAction
    | EditorSetSnappingAction
    | EditorSetTerrainBrushAction
    | EditorSetObjectPlacementAction
    | EditorSetAirportPlacementAction
    | EditorSetSaveStateAction
    | EditorSetSaveProgressAction
    | EditorTrackRebuildJobAction
    | EditorSetRebuildStateAction
    | EditorSetRebuildProgressAction
    | EditorSetToastAction
    | EditorSetTerrainRegionHoverAction
    | EditorSetTerrainRegionSelectionAction
    | EditorClearTerrainRegionSelectionAction
    | EditorToggleHelpAction
    | EditorSetTerrainGeneratorConfigAction
    | EditorSetTerrainPreviewAction
    | EditorSetTerrainPreviewStatusAction
    | EditorMarkTerrainPreviewDirtyAction
    | EditorApplyTerrainGeneratorAction
    | EditorResetTerrainGeneratorAction
    | EditorMarkSavedAction
    | EditorReplaceDocumentAction
    | EditorUndoAction
    | EditorRedoAction;

export interface EditorStore {
    getState(): EditorStoreState;
    subscribe(listener: () => void): () => boolean;
    dispatch(action: EditorStoreAction): unknown;
    runCommand(command: EditorCommand, options?: EditorCommandOptions): EditorCommandResult;
    canUndo(): boolean;
    canRedo(): boolean;
    getSelectedEntity(): EditorEntity | null;
    serialize(): {
        mapPayload: unknown;
        vantagePayload: unknown;
    };
}

export interface EditorLayerListItem {
    id: EditorEntityId;
    label: string;
}

export interface EditorLayerGroup {
    id: EditorGroupId;
    label: string;
    items: EditorLayerListItem[];
}
