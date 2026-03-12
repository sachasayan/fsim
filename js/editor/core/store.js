import { applyEditorCommand } from './commands.js';
import { createEditorDocument, getEntityById, serializeEditorDocument } from './document.js';

function cloneSnapshot(state) {
    return {
        document: structuredClone(state.document),
        selection: structuredClone(state.selection)
    };
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
            showHelp: false
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
                activeVertex: null
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
                                ...current.ui
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
