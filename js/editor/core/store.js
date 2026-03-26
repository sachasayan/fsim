import { applyEditorCommand } from './commands.js';
import { createEditorDocument, getEntityById, serializeEditorDocument } from './document.js';

function cloneSnapshot(state) {
    return {
        document: structuredClone(state.document),
        selection: structuredClone(state.selection)
    };
}

function bumpVersion(version) {
    return (Number.isFinite(version) ? version : 0) + 1;
}

function createInitialState(document) {
    return {
        document,
        viewport: {
            x: 0,
            z: 0,
            zoom: 0.05,
            hoverWorldPos: null
        },
        selection: {
            selectedId: null,
            hoverId: null,
            activeVertex: null
        },
        tools: {
            currentTool: 'select',
            snappingEnabled: true,
            terrainBrush: { radius: 300, strength: 40 }
        },
        history: {
            undoStack: [],
            redoStack: [],
            dirty: false,
            lastCoalesceKey: null
        },
        layers: {
            groupVisibility: {},
            groupLocked: {},
            collapsed: {},
            itemVisibility: {},
            itemLocked: {},
            filterText: ''
        },
        ui: {
            saveState: 'idle',
            saveError: '',
            toast: null,
            showHelp: false,
            terrainLab: {
                draftConfig: structuredClone(document.worldData.terrainGenerator),
                configVersion: 1,
                previewStatus: 'idle',
                previewDirty: true,
                previewSnapshot: null,
                previewKey: null,
                activeSubtool: 'inspect',
                selectedOverlay: document.worldData.terrainGenerator.preview.overlay,
                pendingApply: false,
                lastMetadata: null
            }
        }
    };
}

export function createEditorStore(initialDocument) {
    let state = createInitialState(initialDocument);
    const listeners = new Set();

    function notify() {
        for (const listener of listeners) listener();
    }

    function setState(updater) {
        const nextState = typeof updater === 'function' ? updater(state) : updater;
        state = nextState;
        notify();
    }

    function runCommand(command, options = {}) {
        const snapshot = cloneSnapshot(state);
        const result = applyEditorCommand(state.document, command, options.context);
        if (result.document === state.document) return result;
        const coalesceKey = options.coalesceKey || null;
        setState(current => ({
            ...current,
            document: result.document,
            selection: {
                ...current.selection,
                selectedId: result.selectionId ?? current.selection.selectedId,
                activeVertex: command.type === 'move-vertex'
                    && current.selection.activeVertex?.entityId === command.entityId
                    && current.selection.activeVertex?.index === command.vertexIndex
                    ? current.selection.activeVertex
                    : null
            },
            history: {
                undoStack: coalesceKey && current.history.lastCoalesceKey === coalesceKey
                    ? current.history.undoStack
                    : [...current.history.undoStack, snapshot],
                redoStack: [],
                dirty: true,
                lastCoalesceKey: coalesceKey
            },
            ui: {
                ...current.ui,
                saveState: current.ui.saveState === 'saving' ? 'saving' : 'dirty'
            }
        }));
        return result;
    }

    return {
        getState() {
            return state;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispatch(action) {
            if (action.type === 'run-command') {
                return runCommand(action.command, action.options);
            }
            if (action.type === 'undo') {
                const previous = state.history.undoStack[state.history.undoStack.length - 1];
                if (!previous) return;
                const redoSnapshot = cloneSnapshot(state);
                setState(current => ({
                    ...current,
                    document: createEditorDocument(previous.document.worldData, previous.document.vantageData, previous.document),
                    selection: previous.selection,
                    history: {
                        ...current.history,
                        undoStack: current.history.undoStack.slice(0, -1),
                        redoStack: [...current.history.redoStack, redoSnapshot],
                        dirty: true,
                        lastCoalesceKey: null
                    }
                }));
                return;
            }
            if (action.type === 'redo') {
                const next = state.history.redoStack[state.history.redoStack.length - 1];
                if (!next) return;
                const undoSnapshot = cloneSnapshot(state);
                setState(current => ({
                    ...current,
                    document: createEditorDocument(next.document.worldData, next.document.vantageData, next.document),
                    selection: next.selection,
                    history: {
                        ...current.history,
                        undoStack: [...current.history.undoStack, undoSnapshot],
                        redoStack: current.history.redoStack.slice(0, -1),
                        dirty: true,
                        lastCoalesceKey: null
                    }
                }));
                return;
            }
            setState(current => {
                switch (action.type) {
                    case 'set-tool':
                        return { ...current, tools: { ...current.tools, currentTool: action.tool } };
                    case 'set-hover':
                        if (current.selection.hoverId === action.hoverId) {
                            const currentHoverWorldPos = current.viewport.hoverWorldPos;
                            const nextHoverWorldPos = action.hoverWorldPos;
                            const sameHoverWorldPos = (
                                currentHoverWorldPos === null && nextHoverWorldPos === null
                            ) || (
                                currentHoverWorldPos !== null
                                && nextHoverWorldPos !== null
                                && currentHoverWorldPos.x === nextHoverWorldPos.x
                                && currentHoverWorldPos.z === nextHoverWorldPos.z
                            );
                            if (sameHoverWorldPos) return current;
                        }
                        return { ...current, selection: { ...current.selection, hoverId: action.hoverId }, viewport: { ...current.viewport, hoverWorldPos: action.hoverWorldPos } };
                    case 'set-selection':
                        return { ...current, selection: { ...current.selection, selectedId: action.selectedId, activeVertex: action.activeVertex ?? null } };
                    case 'set-active-vertex':
                        return { ...current, selection: { ...current.selection, activeVertex: action.activeVertex } };
                    case 'set-camera':
                        return { ...current, viewport: { ...current.viewport, ...action.viewport } };
                    case 'set-layer-filter':
                        return { ...current, layers: { ...current.layers, filterText: action.value } };
                    case 'toggle-group-collapse':
                        return { ...current, layers: { ...current.layers, collapsed: { ...current.layers.collapsed, [action.groupId]: !current.layers.collapsed[action.groupId] } } };
                    case 'toggle-group-visible':
                        return { ...current, layers: { ...current.layers, groupVisibility: { ...current.layers.groupVisibility, [action.groupId]: current.layers.groupVisibility[action.groupId] === false ? true : false } } };
                    case 'toggle-group-lock':
                        return { ...current, layers: { ...current.layers, groupLocked: { ...current.layers.groupLocked, [action.groupId]: current.layers.groupLocked[action.groupId] === true ? false : true } } };
                    case 'toggle-item-visible':
                        return { ...current, layers: { ...current.layers, itemVisibility: { ...current.layers.itemVisibility, [action.itemId]: current.layers.itemVisibility[action.itemId] === false ? true : false } } };
                    case 'toggle-item-lock':
                        return { ...current, layers: { ...current.layers, itemLocked: { ...current.layers.itemLocked, [action.itemId]: current.layers.itemLocked[action.itemId] === true ? false : true } } };
                    case 'set-snapping':
                        return { ...current, tools: { ...current.tools, snappingEnabled: action.value } };
                    case 'set-terrain-brush':
                        return { ...current, tools: { ...current.tools, terrainBrush: { ...current.tools.terrainBrush, ...action.patch } } };
                    case 'set-save-state':
                        return { ...current, ui: { ...current.ui, saveState: action.value, saveError: action.error || '' } };
                    case 'set-toast':
                        return { ...current, ui: { ...current.ui, toast: action.toast } };
                    case 'toggle-help':
                        return { ...current, ui: { ...current.ui, showHelp: action.value ?? !current.ui.showHelp } };
                    case 'set-terrain-generator-config': {
                        const nextDraft = structuredClone(current.ui.terrainLab.draftConfig);
                        let target = nextDraft;
                        const path = Array.isArray(action.path) ? action.path : [];
                        for (let index = 0; index < path.length - 1; index += 1) {
                            const key = path[index];
                            target = target[key];
                        }
                        target[path[path.length - 1]] = action.value;
                        if (path[0] === 'preview' && path[1] === 'overlay') {
                            return {
                                ...current,
                                ui: {
                                    ...current.ui,
                                    terrainLab: {
                                        ...current.ui.terrainLab,
                                        draftConfig: nextDraft,
                                        configVersion: bumpVersion(current.ui.terrainLab.configVersion),
                                        selectedOverlay: action.value,
                                        previewDirty: true
                                    }
                                }
                            };
                        }
                        return {
                            ...current,
                            ui: {
                                ...current.ui,
                                terrainLab: {
                                    ...current.ui.terrainLab,
                                    draftConfig: nextDraft,
                                    configVersion: bumpVersion(current.ui.terrainLab.configVersion),
                                    previewDirty: true
                                }
                            }
                        };
                    }
                    case 'set-terrain-preview':
                        return {
                            ...current,
                            ui: {
                                ...current.ui,
                                terrainLab: {
                                    ...current.ui.terrainLab,
                                    previewSnapshot: action.snapshot,
                                    previewKey: action.previewKey,
                                    previewStatus: action.status || 'ready',
                                    previewDirty: action.previewDirty ?? false,
                                    lastMetadata: action.metadata ?? current.ui.terrainLab.lastMetadata
                                }
                            }
                        };
                    case 'set-terrain-preview-status':
                        return {
                            ...current,
                            ui: {
                                ...current.ui,
                                terrainLab: {
                                    ...current.ui.terrainLab,
                                    previewStatus: action.status
                                }
                            }
                        };
                    case 'mark-terrain-preview-dirty':
                        return {
                            ...current,
                            ui: {
                                ...current.ui,
                                terrainLab: {
                                    ...current.ui.terrainLab,
                                    previewDirty: true,
                                    previewStatus: action.status || current.ui.terrainLab.previewStatus
                                }
                            }
                        };
                    case 'apply-terrain-generator': {
                        const nextDocument = createEditorDocument({
                            ...current.document.worldData,
                            terrainGenerator: structuredClone(current.ui.terrainLab.draftConfig)
                        }, current.document.vantageData, current.document);
                        const snapshot = cloneSnapshot(current);
                        return {
                            ...current,
                            document: nextDocument,
                            history: {
                                undoStack: [...current.history.undoStack, snapshot],
                                redoStack: [],
                                dirty: true,
                                lastCoalesceKey: null
                            },
                            ui: {
                                ...current.ui,
                                saveState: current.ui.saveState === 'saving' ? 'saving' : 'dirty',
                                terrainLab: {
                                    ...current.ui.terrainLab,
                                    draftConfig: structuredClone(nextDocument.worldData.terrainGenerator),
                                    configVersion: bumpVersion(current.ui.terrainLab.configVersion),
                                    pendingApply: false,
                                    previewDirty: true
                                }
                            }
                        };
                    }
                    case 'reset-terrain-generator':
                        return {
                            ...current,
                            ui: {
                                ...current.ui,
                                terrainLab: {
                                    ...current.ui.terrainLab,
                                    draftConfig: structuredClone(current.document.worldData.terrainGenerator),
                                    configVersion: bumpVersion(current.ui.terrainLab.configVersion),
                                    selectedOverlay: current.document.worldData.terrainGenerator.preview.overlay,
                                    previewDirty: true
                                }
                            }
                        };
                    case 'mark-saved':
                        return { ...current, history: { ...current.history, dirty: false, lastCoalesceKey: null }, ui: { ...current.ui, saveState: 'saved', saveError: '' } };
                    case 'replace-document':
                        return {
                            ...current,
                            document: action.document,
                            selection: {
                                ...current.selection,
                                selectedId: action.selectedId ?? current.selection.selectedId,
                                activeVertex: null
                            },
                            ui: {
                                ...current.ui,
                                terrainLab: {
                                    ...current.ui.terrainLab,
                                    draftConfig: structuredClone(action.document.worldData.terrainGenerator),
                                    configVersion: bumpVersion(current.ui.terrainLab.configVersion),
                                    previewStatus: 'idle',
                                    previewDirty: true,
                                    previewSnapshot: null,
                                    previewKey: null,
                                    selectedOverlay: action.document.worldData.terrainGenerator.preview.overlay,
                                    pendingApply: false,
                                    lastMetadata: null
                                }
                            }
                        };
                    default:
                        return current;
                }
            });
        },
        runCommand,
        canUndo() {
            return state.history.undoStack.length > 0;
        },
        canRedo() {
            return state.history.redoStack.length > 0;
        },
        getSelectedEntity() {
            return getEntityById(state.document, state.selection.selectedId);
        },
        serialize() {
            return serializeEditorDocument(state.document);
        }
    };
}
