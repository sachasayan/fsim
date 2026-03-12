import { React } from '../../vendor/react-loader.js';
import { getDistrictType, DISTRICT_TYPES, ROAD_KINDS, ROAD_SURFACES } from '../../modules/world/MapDataUtils.js';
import { isCity, isDistrict, isRoad, isTerrainEdit } from '../../modules/editor/objectTypes.js';
import { getEntityById, getEntityLabel, listLayerGroups } from '../core/document.js';

const h = React.createElement;

function useStore(store, selector) {
    return React.useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}

function formatControlValue(value) {
    if (!Number.isFinite(value)) return '';
    if (Math.abs(value) >= 100 || Number.isInteger(value)) return String(Math.round(value));
    return value.toFixed(2).replace(/\.?0+$/, '');
}

function ToolButton({ active, id, label, shortcut, onClick, children }) {
    return h('button', {
        className: `tool-btn tool-icon${active ? ' active' : ''}`,
        id,
        type: 'button',
        onClick,
        title: `${label} (${shortcut})`,
        'aria-label': `${label} (${shortcut})`
    }, children, h('span', { className: 'tool-label' }, label));
}

function Icon({ path }) {
    return h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { d: path }));
}

function FieldRow({ label, children, value }) {
    return h('div', { className: 'property-row' }, [
        h('div', { className: 'field-label', key: 'label' }, [
            h('label', { key: 'text' }, label),
            value !== undefined ? h('span', { className: 'value-pill', key: 'value' }, value) : null
        ]),
        children
    ]);
}

function RangeNumberField({ label, value, min, max, step, disabled, onChange }) {
    return h(FieldRow, {
        label,
        value: formatControlValue(Number(value)),
        children: h('div', { className: 'control-stack' }, [
            h('input', {
                key: 'range',
                type: 'range',
                min,
                max,
                step,
                disabled,
                value: value ?? 0,
                onInput: event => onChange(Number(event.target.value))
            }),
            h('input', {
                key: 'number',
                type: 'number',
                min,
                max,
                step,
                disabled,
                value: value ?? 0,
                onChange: event => onChange(Number(event.target.value))
            })
        ])
    });
}

function InspectorPanel({ store, controller }) {
    const state = useStore(store, value => value);
    const selected = getEntityById(state.document, state.selection.selectedId);

    if (!selected) {
        return h('div', { id: 'no-selection', className: 'property-panel muted-panel' },
            h('p', { className: 'empty-copy' }, 'Select an object to edit its properties.')
        );
    }

    const groupLocked = state.layers.groupLocked[
        isCity(selected) ? 'cities' : isDistrict(selected) ? 'districts' : isRoad(selected) ? 'roads' : isTerrainEdit(selected) ? 'terrain' : 'vantage'
    ] === true;
    const itemLocked = state.layers.itemLocked[state.selection.selectedId] === true;
    const locked = groupLocked || itemLocked;

    function updateProperty(key, value) {
        store.runCommand({ type: 'change-property', entityId: state.selection.selectedId, key, value });
    }

    function updateCenter(axis, value) {
        if (selected.center) {
            const next = [...selected.center];
            next[axis] = value;
            store.runCommand({ type: 'move-entity', entityId: state.selection.selectedId, nextCenter: next });
            return;
        }
        const point = { x: selected.x, z: selected.z };
        if (axis === 0) point.x = value;
        else point.z = value;
        store.runCommand({ type: 'move-entity', entityId: state.selection.selectedId, nextPoint: point });
    }

    return h('div', { id: 'selection-panel', className: 'property-panel' }, [
        h('div', { className: 'section-title', key: 'title' }, [
            'Selection Properties ',
            h('span', {
                id: 'prop-type-badge',
                className: 'status-badge',
                key: 'badge'
            }, isCity(selected) ? 'CITY' : isDistrict(selected) ? 'DISTRICT' : isRoad(selected) ? 'ROAD' : isTerrainEdit(selected) ? 'TERRAIN' : 'VANTAGE')
        ]),
        h('div', { className: 'property-group', key: 'group' }, [
            h(FieldRow, {
                key: 'id',
                label: 'ID',
                children: h('input', { type: 'text', readOnly: true, value: getEntityLabel(state.document, state.selection.selectedId) })
            }),
            h(FieldRow, {
                key: 'x',
                label: 'Coord X',
                children: h('input', {
                    type: 'number',
                    disabled: locked || (isTerrainEdit(selected) && Array.isArray(selected.points) && selected.points.length > 0),
                    value: selected.center ? selected.center[0] : selected.x,
                    onChange: event => updateCenter(0, Number(event.target.value))
                })
            }),
            h(FieldRow, {
                key: 'z',
                label: 'Coord Z',
                children: h('input', {
                    type: 'number',
                    disabled: locked || (isTerrainEdit(selected) && Array.isArray(selected.points) && selected.points.length > 0),
                    value: selected.center ? selected.center[1] : selected.z,
                    onChange: event => updateCenter(1, Number(event.target.value))
                })
            }),
            isDistrict(selected) ? h('div', { key: 'district' }, [
                h(FieldRow, {
                    label: 'District Type',
                    children: h('select', {
                        disabled: locked,
                        value: getDistrictType(selected),
                        onChange: event => updateProperty('district_type', event.target.value)
                    }, DISTRICT_TYPES.map(option => h('option', { key: option, value: option }, option)))
                })
            ]) : null,
            isRoad(selected) ? h('div', { key: 'road' }, [
                h(FieldRow, {
                    label: 'Road Kind',
                    children: h('select', {
                        disabled: locked,
                        value: selected.kind,
                        onChange: event => updateProperty('kind', event.target.value)
                    }, ROAD_KINDS.map(option => h('option', { key: option, value: option }, option)))
                }),
                h(FieldRow, {
                    label: 'Surface',
                    children: h('select', {
                        disabled: locked,
                        value: selected.surface,
                        onChange: event => updateProperty('surface', event.target.value)
                    }, ROAD_SURFACES.map(option => h('option', { key: option, value: option }, option)))
                }),
                h(RangeNumberField, {
                    label: 'Width',
                    value: selected.width,
                    min: 4,
                    max: 120,
                    step: 1,
                    disabled: locked,
                    onChange: value => updateProperty('width', value)
                }),
                h(RangeNumberField, {
                    label: 'Feather',
                    value: selected.feather,
                    min: 0,
                    max: 80,
                    step: 1,
                    disabled: locked,
                    onChange: value => updateProperty('feather', value)
                })
            ]) : null,
            isTerrainEdit(selected) ? h('div', { key: 'terrain' }, [
                h(FieldRow, {
                    label: 'Brush Kind',
                    children: h('input', { type: 'text', readOnly: true, value: selected.kind })
                }),
                h(RangeNumberField, {
                    label: 'Radius',
                    value: selected.radius,
                    min: 50,
                    max: 2000,
                    step: 10,
                    disabled: locked,
                    onChange: value => updateProperty('radius', value)
                }),
                selected.kind !== 'flatten'
                    ? h(RangeNumberField, {
                        label: 'Delta',
                        value: selected.delta,
                        min: 1,
                        max: 200,
                        step: 1,
                        disabled: locked,
                        onChange: value => updateProperty('delta', value)
                    })
                    : h('div', { key: 'flatten-controls' }, [
                        h(RangeNumberField, {
                            key: 'target',
                            label: 'Target H',
                            value: selected.target_height,
                            min: -200,
                            max: 1200,
                            step: 5,
                            disabled: locked,
                            onChange: value => updateProperty('target_height', value)
                        }),
                        h(RangeNumberField, {
                            key: 'opacity',
                            label: 'Opacity',
                            value: selected.opacity,
                            min: 0,
                            max: 1,
                            step: 0.05,
                            disabled: locked,
                            onChange: value => updateProperty('opacity', value)
                        })
                    ])
            ]) : null,
            !isCity(selected) && !isDistrict(selected) && !isRoad(selected) && !isTerrainEdit(selected) ? h('div', { key: 'vantage' }, [
                h(RangeNumberField, {
                    label: 'Altitude (m)',
                    value: selected.y || 0,
                    min: 0,
                    max: 3000,
                    step: 10,
                    disabled: locked,
                    onChange: value => updateProperty('y', value)
                }),
                h(RangeNumberField, {
                    label: 'Tilt (deg)',
                    value: selected.tilt || 45,
                    min: 5,
                    max: 85,
                    step: 1,
                    disabled: locked,
                    onChange: value => updateProperty('tilt', value)
                }),
                h('button', {
                    className: 'tool-btn accent-action',
                    type: 'button',
                    onClick: () => {
                        const url = `/fsim.html?x=${selected.x}&y=${selected.y || 0}&z=${selected.z}&tilt=${selected.tilt || 45}&fog=${selected.fog || 0}&clouds=${selected.clouds || 0}&lighting=${selected.lighting || 'noon'}`;
                        window.open(url, '_blank');
                    }
                }, 'Launch In Sim')
            ]) : null,
            h('div', { className: 'property-group inline-actions', key: 'actions' }, [
                h('button', {
                    className: 'tool-btn secondary-action',
                    type: 'button',
                    onClick: () => controller.frameSelection()
                }, 'Frame Selection'),
                h('button', {
                    className: 'tool-btn danger-action',
                    type: 'button',
                    disabled: locked,
                    onClick: () => store.runCommand({ type: 'delete-entity', entityId: state.selection.selectedId })
                }, 'Delete Selected')
            ])
        ])
    ]);
}

function LayersPanel({ store }) {
    const state = useStore(store, value => value);
    const groups = listLayerGroups(state.document).map(group => ({
        ...group,
        items: group.items.filter(item => {
            const query = state.layers.filterText.trim().toLowerCase();
            if (!query) return true;
            return item.label.toLowerCase().includes(query) || item.id.toLowerCase().includes(query);
        })
    }));

    return h('div', { className: 'property-panel', id: 'layers-panel' }, [
        h('div', { className: 'section-title', key: 'title' }, 'Layers'),
        h('input', {
            key: 'filter',
            type: 'search',
            placeholder: 'Filter layers',
            value: state.layers.filterText,
            onChange: event => store.dispatch({ type: 'set-layer-filter', value: event.target.value })
        }),
        h('div', { id: 'layers-groups', key: 'groups' }, groups.map(group => {
            const collapsed = state.layers.collapsed[group.id] === true;
            const visible = state.layers.groupVisibility[group.id] !== false;
            const locked = state.layers.groupLocked[group.id] === true;
            return h('div', { className: 'layers-group', key: group.id }, [
                h('div', { className: 'layers-group-header', key: 'header' }, [
                    h('button', {
                        key: 'collapse',
                        className: 'layer-toggle',
                        type: 'button',
                        onClick: () => store.dispatch({ type: 'toggle-group-collapse', groupId: group.id })
                    }, collapsed ? '+' : '-'),
                    h('button', {
                        key: 'name',
                        className: 'layer-group-name',
                        type: 'button',
                        onClick: () => store.dispatch({ type: 'toggle-group-collapse', groupId: group.id })
                    }, group.label),
                    h('span', { className: 'layer-count', key: 'count' }, String(group.items.length)),
                    h('span', { className: 'layer-controls', key: 'controls' }, [
                        h('button', {
                            key: 'visible',
                            className: 'layer-toggle',
                            type: 'button',
                            onClick: () => store.dispatch({ type: 'toggle-group-visible', groupId: group.id }),
                            title: visible ? 'Hide group' : 'Show group'
                        }, visible ? 'Show' : 'Hide'),
                        h('button', {
                            key: 'lock',
                            className: 'layer-toggle',
                            type: 'button',
                            onClick: () => store.dispatch({ type: 'toggle-group-lock', groupId: group.id }),
                            title: locked ? 'Unlock group' : 'Lock group'
                        }, locked ? 'Unlock' : 'Lock')
                    ])
                ]),
                collapsed ? null : h('div', { className: 'layers-items', key: 'items' }, group.items.map(item => {
                    const itemVisible = state.layers.itemVisibility[item.id] !== false;
                    const itemLocked = state.layers.itemLocked[item.id] === true;
                    return h('div', { className: `layer-item${state.selection.selectedId === item.id ? ' selected' : ''}`, key: item.id }, [
                        h('button', {
                            className: 'layer-toggle',
                            type: 'button',
                            onClick: () => store.dispatch({ type: 'toggle-item-visible', itemId: item.id })
                        }, itemVisible ? 'Show' : 'Hide'),
                        h('button', {
                            className: 'layer-toggle',
                            type: 'button',
                            onClick: () => store.dispatch({ type: 'toggle-item-lock', itemId: item.id })
                        }, itemLocked ? 'Unlock' : 'Lock'),
                        h('button', {
                            className: 'layer-item-select',
                            type: 'button',
                            onClick: () => store.dispatch({ type: 'set-selection', selectedId: item.id })
                        }, h('span', { className: 'layer-item-name' }, item.label))
                    ]);
                }))
            ]);
        }))
    ]);
}

function TerrainBrushPanel({ store }) {
    const brush = useStore(store, state => state.tools.terrainBrush);
    return h('div', { className: 'property-panel' }, [
        h('div', { className: 'section-title', key: 'title' }, 'Terrain Brush'),
        h('div', { className: 'property-group', key: 'group' }, [
            h(RangeNumberField, {
                label: 'Radius',
                value: brush.radius,
                min: 50,
                max: 2000,
                step: 10,
                onChange: value => store.dispatch({ type: 'set-terrain-brush', patch: { radius: value } })
            }),
            h(RangeNumberField, {
                label: 'Strength',
                value: brush.strength,
                min: 0,
                max: 200,
                step: 1,
                onChange: value => store.dispatch({ type: 'set-terrain-brush', patch: { strength: value } })
            })
        ])
    ]);
}

function FooterPanel({ store, controller, onSave }) {
    const state = useStore(store, value => value);
    const saveLabel = state.ui.saveState === 'saving'
        ? 'Saving...'
        : state.ui.saveState === 'saved'
            ? 'Saved'
            : state.history.dirty
                ? 'Save Changes'
                : 'Saved';
    return h('div', { className: 'property-panel footer-panel' }, [
        h('div', { className: 'status-row', key: 'status' }, [
            h('span', { className: `status-chip ${state.history.dirty ? 'dirty' : 'clean'}` }, state.history.dirty ? 'Unsaved changes' : 'Up to date'),
            h('span', { className: 'status-chip' }, state.tools.snappingEnabled ? 'Grid snap on' : 'Grid snap off'),
            h('span', { className: 'status-chip' }, `Undo ${state.history.undoStack.length}`)
        ]),
        state.ui.saveError ? h('div', { className: 'hint-card error-card', key: 'error' }, state.ui.saveError) : null,
        h('div', { className: 'property-group inline-actions', key: 'actions' }, [
            h('button', { className: 'tool-btn secondary-action', type: 'button', onClick: () => store.dispatch({ type: 'undo' }) }, 'Undo'),
            h('button', { className: 'tool-btn secondary-action', type: 'button', onClick: () => store.dispatch({ type: 'redo' }) }, 'Redo'),
            h('button', { className: 'tool-btn secondary-action', type: 'button', onClick: () => controller.resetView() }, 'Reset View'),
            h('button', { className: 'save-btn', type: 'button', onClick: onSave }, saveLabel)
        ])
    ]);
}

function HelpPanel({ store }) {
    const showHelp = useStore(store, state => state.ui.showHelp);
    return h('div', { className: 'property-panel' }, [
        h('div', { className: 'section-title', key: 'title' }, 'Shortcut Help'),
        h('button', {
            className: 'tool-btn secondary-action',
            type: 'button',
            onClick: () => store.dispatch({ type: 'toggle-help', value: !showHelp })
        }, showHelp ? 'Hide Shortcuts' : 'Show Shortcuts'),
        showHelp ? h('div', { className: 'hint-card help-card', key: 'content' }, [
            h('p', { key: 'tools' }, 'Tools: V Select, C City, D District, W Road, E Poly Edit, R Raise, L Lower, F Flatten.'),
            h('p', { key: 'history' }, 'History: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y redo.'),
            h('p', { key: 'nav' }, 'Navigation: middle mouse pan, wheel zoom, F frame selection, 0 reset view, G toggle grid snap.'),
            h('p', { key: 'edit' }, 'Editing: arrows nudge, Shift arrows coarse nudge, Alt arrows fine nudge, Delete removes, Cmd/Ctrl+D duplicates.')
        ]) : null
    ]);
}

function Toast({ store }) {
    const toast = useStore(store, state => state.ui.toast);
    if (!toast) return null;
    return h('div', { className: `toast toast-${toast.tone || 'info'}` }, toast.message);
}

export function EditorApp({ store, controller, canvasRef, coordsRef, onSave }) {
    const state = useStore(store, value => value);
    const currentTool = state.tools.currentTool;

    const toolDefs = [
        ['select', 'Select', 'V', 'M5 3v18l5-6 4 6 5-2-4-6 6-4z'],
        ['add-city', 'City', 'C', 'M4 20V9l4 2V7l4 2V5l4 2v13z'],
        ['add-district', 'District', 'D', 'M4 6h16v12H4z'],
        ['add-road', 'Road', 'W', 'M8 3l2 7-2 11M16 3l-2 7 2 11'],
        ['edit-poly', 'Edit', 'E', 'M5 6l7-3 7 4v9l-7 5-7-4z'],
        ['terrain-raise', 'Raise', 'R', 'M4 18h16M12 6v8M9 9l3-3 3 3'],
        ['terrain-lower', 'Lower', 'L', 'M4 18h16M12 6v8M9 11l3 3 3-3'],
        ['terrain-flatten', 'Flatten', 'F', 'M4 16h16M4 11h16M4 8h16']
    ];

    return h(React.Fragment, null, [
        h('div', { id: 'editor-container', key: 'layout' }, [
            h('div', { id: 'canvas-container', className: `tool-${currentTool}`, key: 'canvas-area' }, [
                h('canvas', { id: 'map-canvas', ref: canvasRef, key: 'canvas' }),
                h('div', { className: 'toolbar', key: 'toolbar' }, toolDefs.map(([tool, label, shortcut, path]) => (
                    h(ToolButton, {
                        key: tool,
                        id: `tool-${tool}`,
                        label,
                        shortcut,
                        active: currentTool === tool,
                        onClick: () => store.dispatch({ type: 'set-tool', tool })
                    }, h(Icon, { path }))
                ))),
                h('div', { id: 'coords', ref: coordsRef, key: 'coords' }, 'X: 0, Z: 0')
            ]),
            h('aside', { id: 'sidebar', key: 'sidebar' }, [
                h('h2', { key: 'heading' }, ['WORLD EDITOR ', h('span', { className: 'status-badge', key: 'badge' }, 'v2.0')]),
                h(LayersPanel, { store, key: 'layers' }),
                h(InspectorPanel, { store, controller, key: 'inspector' }),
                h(TerrainBrushPanel, { store, key: 'terrain' }),
                h(HelpPanel, { store, key: 'help' }),
                h(FooterPanel, { store, controller, onSave, key: 'footer' })
            ])
        ]),
        h(Toast, { store, key: 'toast' })
    ]);
}
