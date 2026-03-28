import type {
    EditorActiveVertex,
    EditorCommand,
    EditorCommandResult,
    EditorDocument,
    EditorEntityId,
    EditorWorldPoint
} from './types.js';

export function snapWorldPoint(
    worldPos: EditorWorldPoint,
    enabled: boolean,
    allowSnap?: boolean,
    document?: EditorDocument | null,
    ignoreEntityId?: EditorEntityId | null
): EditorWorldPoint;

export function applyEditorCommand(
    document: EditorDocument,
    command: EditorCommand,
    context?: Record<string, unknown>
): EditorCommandResult;

export function nudgeEntityCommand(
    document: EditorDocument,
    entityId: EditorEntityId,
    delta: EditorWorldPoint,
    activeVertex?: EditorActiveVertex | null
): EditorCommand | null;
