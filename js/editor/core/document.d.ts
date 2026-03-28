import type {
    EditorBounds,
    EditorDocument,
    EditorEntity,
    EditorEntityId,
    EditorGroupId,
    EditorLayerGroup,
    EditorVantageData,
    EditorWorldData
} from './types.js';

export function createEditorDocument(
    worldData: EditorWorldData,
    vantageData: EditorVantageData,
    prevDocument?: EditorDocument | null
): EditorDocument;

export function cloneDocument(document: EditorDocument): EditorDocument;

export function getEntityById(document: EditorDocument, entityId: EditorEntityId | null | undefined): EditorEntity | null;

export function findEntityGroup(document: EditorDocument, entityId: EditorEntityId | null | undefined): EditorGroupId | null;

export function getGroupEntityIds(document: EditorDocument, groupId: EditorGroupId): EditorEntityId[];

export function getEntityLabel(document: EditorDocument, entityId: EditorEntityId | null | undefined): string;

export function stripEditorMetadata<T>(value: T): T;

export function serializeEditorDocument(document: EditorDocument): {
    mapPayload: unknown;
    vantagePayload: unknown;
};

export function resolveSelectionAfterReload(
    prevDocument: EditorDocument,
    nextDocument: EditorDocument,
    selectedId: EditorEntityId | null | undefined
): EditorEntityId | null;

export function getEntityBounds(document: EditorDocument, entityId: EditorEntityId | null | undefined): EditorBounds | null;

export function listLayerGroups(document: EditorDocument): EditorLayerGroup[];
