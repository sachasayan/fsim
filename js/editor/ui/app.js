import { React } from '../../vendor/react-loader.js';
import { getDistrictType, DISTRICT_TYPES, ROAD_KINDS, ROAD_SURFACES } from '../../modules/world/MapDataUtils.js';
import { TERRAIN_GENERATOR_PRESETS, TERRAIN_PREVIEW_OVERLAYS, applyTerrainGeneratorPreset } from '../../modules/world/terrain/TerrainSynthesis.js';
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
        'aria-label': `${label} (${shortcut})`,
        'data-testid': id
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

function numberFieldTestId(label) {
    return `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function NumberInputField({ label, value, disabled, onChange }) {
    return h(FieldRow, {
        label,
        children: h('input', {
            type: 'number',
            disabled,
            value,
            onChange,
            'data-testid': numberFieldTestId(label)
        })
    });
}

function SelectField({ label, value, options, onChange }) {
    return h(FieldRow, {
        label,
        children: h('select', {
            value,
            onChange: event => onChange(event.target.value)
        }, options.map(option => h('option', { key: option.value, value: option.value }, option.label)))
    });
}

function InspectorPanel({ store, controller }) {
    const state = useStore(store, value => value);
    const selected = getEntityById(state.document, state.selection.selectedId);

    if (!selected) {
        return h('div', { id: 'no-selection', className: 'property-panel muted-panel', 'data-testid': 'inspector-empty' },
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

    return h('div', { id: 'selection-panel', className: 'property-panel', 'data-testid': 'inspector-panel' }, [
        h('div', { className: 'section-title', key: 'title' }, [
            'Selection Properties ',
            h('span', {
                id: 'prop-type-badge',
                className: 'status-badge',
                key: 'badge',
                'data-testid': 'inspector-type-badge'
            }, isCity(selected) ? 'CITY' : isDistrict(selected) ? 'DISTRICT' : isRoad(selected) ? 'ROAD' : isTerrainEdit(selected) ? 'TERRAIN' : 'VANTAGE')
        ]),
        h('div', { className: 'property-group', key: 'group' }, [
            h(FieldRow, {
                key: 'id',
                label: 'ID',
                children: h('input', { type: 'text', readOnly: true, value: getEntityLabel(state.document, state.selection.selectedId), 'data-testid': 'field-id' })
            }),
            h(NumberInputField, {
                key: 'x',
                label: 'Coord X',
                disabled: locked || (isTerrainEdit(selected) && Array.isArray(selected.points) && selected.points.length > 0),
                value: selected.center ? selected.center[0] : selected.x,
                onChange: event => updateCenter(0, Number(event.target.value))
            }),
            h(NumberInputField, {
                key: 'z',
                label: 'Coord Z',
                disabled: locked || (isTerrainEdit(selected) && Array.isArray(selected.points) && selected.points.length > 0),
                value: selected.center ? selected.center[1] : selected.z,
                onChange: event => updateCenter(1, Number(event.target.value))
            }),
            isDistrict(selected) ? h('div', { key: 'district' }, [
                h(FieldRow, {
                    label: 'District Type',
                    children: h('select', {
                        disabled: locked,
                        value: getDistrictType(selected),
                        onChange: event => updateProperty('district_type', event.target.value),
                        'data-testid': 'field-district-type'
                    }, DISTRICT_TYPES.map(option => h('option', { key: option, value: option }, option)))
                }),
                getDistrictType(selected) === 'windmill_farm' ? h('div', { key: 'windmill-controls' }, [
                    h(RangeNumberField, {
                        key: 'turbine-density',
                        label: 'Turbine Density',
                        value: selected.turbine_density,
                        min: 0.05,
                        max: 1,
                        step: 0.05,
                        disabled: locked,
                        onChange: value => updateProperty('turbine_density', value)
                    }),
                    h(RangeNumberField, {
                        key: 'rotor-radius',
                        label: 'Rotor Radius',
                        value: selected.rotor_radius,
                        min: 8,
                        max: 80,
                        step: 1,
                        disabled: locked,
                        onChange: value => updateProperty('rotor_radius', value)
                    }),
                    h(RangeNumberField, {
                        key: 'setback',
                        label: 'Setback',
                        value: selected.setback,
                        min: 20,
                        max: 240,
                        step: 5,
                        disabled: locked,
                        onChange: value => updateProperty('setback', value)
                    })
                ]) : null
            ]) : null,
            isRoad(selected) ? h('div', { key: 'road' }, [
                h(FieldRow, {
                    label: 'Road Kind',
                    children: h('select', {
                        disabled: locked,
                        value: selected.kind,
                        onChange: event => updateProperty('kind', event.target.value),
                        'data-testid': 'field-road-kind'
                    }, ROAD_KINDS.map(option => h('option', { key: option, value: option }, option)))
                }),
                h(FieldRow, {
                    label: 'Surface',
                    children: h('select', {
                        disabled: locked,
                        value: selected.surface,
                        onChange: event => updateProperty('surface', event.target.value),
                        'data-testid': 'field-road-surface'
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

    return h('div', { className: 'property-panel', id: 'layers-panel', 'data-testid': 'layers-panel' }, [
        h('div', { className: 'section-title', key: 'title' }, 'Layers'),
        h('input', {
            key: 'filter',
            type: 'search',
            placeholder: 'Filter layers',
            value: state.layers.filterText,
            onChange: event => store.dispatch({ type: 'set-layer-filter', value: event.target.value }),
            'data-testid': 'layers-filter'
        }),
        h('div', { id: 'layers-groups', key: 'groups', 'data-testid': 'layers-groups' }, groups.map(group => {
            const collapsed = state.layers.collapsed[group.id] === true;
            const visible = state.layers.groupVisibility[group.id] !== false;
            const locked = state.layers.groupLocked[group.id] === true;
            return h('div', { className: 'layers-group', key: group.id, 'data-testid': `layer-group-${group.id}` }, [
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
                    return h('div', { className: `layer-item${state.selection.selectedId === item.id ? ' selected' : ''}`, key: item.id, 'data-testid': `layer-item-${item.id}` }, [
                        h('button', {
                            key: 'visible',
                            className: 'layer-toggle',
                            type: 'button',
                            onClick: () => store.dispatch({ type: 'toggle-item-visible', itemId: item.id })
                        }, itemVisible ? 'Show' : 'Hide'),
                        h('button', {
                            key: 'lock',
                            className: 'layer-toggle',
                            type: 'button',
                            onClick: () => store.dispatch({ type: 'toggle-item-lock', itemId: item.id })
                        }, itemLocked ? 'Unlock' : 'Lock'),
                        h('button', {
                            key: 'select',
                            className: 'layer-item-select',
                            type: 'button',
                            onClick: () => store.dispatch({ type: 'set-selection', selectedId: item.id }),
                            'data-testid': `layer-select-${item.id}`
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

function TerrainLabPanel({ store, controller }) {
    const terrainLab = useStore(store, state => state.ui.terrainLab);
    const config = terrainLab.draftConfig;
    const metrics = terrainLab.lastMetadata?.hydrology || { riverCount: 0, lakeCount: 0, summary: { cliffCoverage: 0, gorgeCoverage: 0, peakRelief: 0 } };
    const mountainDiagnosis = [];

    if (config.macro.continentalAmplitude <= 80 && config.macro.ridgeAmplitude >= 1000) {
        mountainDiagnosis.push('Land Lift is very low for the current Mountain Height, so peaks will read as isolated bumps instead of full mountain ranges.');
    }
    if (config.macro.valleyAmplitude <= 10) {
        mountainDiagnosis.push('Valley Cut is near zero, which effectively disables most large valley carving.');
    }
    if (config.macro.foothillAmplitude < 80 && config.macro.ridgeAmplitude > 900) {
        mountainDiagnosis.push('Mountain Spread is low, so ridges stay narrow and the terrain can feel less dramatic at a distance.');
    }
    if (config.landforms.canyonDepth > 0.72 && config.hydrology.gorgeStrength < 0.45) {
        mountainDiagnosis.push('Canyon Depth is high, but Gorge Strength is low, so channels may read wide without carving hard enough.');
    }
    if (config.macro.plateauHeight > 250 && config.macro.escarpmentStrength < 0.35) {
        mountainDiagnosis.push('Plateau Height is high while Escarpment Strength is low, so shelves may feel soft instead of cliffy.');
    }
    if (config.macro.summitSharpness > 0.7 && config.macro.massifStrength < 0.35) {
        mountainDiagnosis.push('Peak Sharpness is very high, but Massif Strength is low, so you may get pointy ridges without enough heroic summits.');
    }

    function setConfig(path, value) {
        store.dispatch({ type: 'set-terrain-generator-config', path, value });
    }

    function applyPreset(presetName) {
        const nextConfig = applyTerrainGeneratorPreset(config, presetName);
        store.dispatch({ type: 'set-terrain-preview-status', status: 'idle' });
        store.dispatch({ type: 'set-terrain-preview', status: 'idle', snapshot: null, previewKey: null, previewDirty: true, metadata: null });
        Object.entries(nextConfig).forEach(([key, value]) => {
            if (key === 'macro' || key === 'hydrology' || key === 'preview') {
                Object.entries(value).forEach(([childKey, childValue]) => {
                    store.dispatch({ type: 'set-terrain-generator-config', path: [key, childKey], value: childValue });
                });
                return;
            }
            store.dispatch({ type: 'set-terrain-generator-config', path: [key], value });
        });
    }

    function markDirty() {
        store.dispatch({ type: 'mark-terrain-preview-dirty', status: 'idle' });
    }

    const previewBadge = terrainLab.previewStatus === 'generating'
        ? 'PREVIEWING'
        : terrainLab.previewDirty
            ? 'STALE'
            : 'READY';

    return h('div', { className: 'property-panel', 'data-testid': 'terrain-lab-panel' }, [
        h('div', { className: 'section-title', key: 'title' }, [
            'Terrain Lab ',
            h('span', { className: 'status-badge', key: 'badge' }, previewBadge)
        ]),
        h('div', { className: 'property-group', key: 'presets' }, [
            h(SelectField, {
                key: 'preset',
                label: 'Preset',
                value: config.preset,
                options: [
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'alpine', label: 'Alpine' },
                    { value: 'coastal', label: 'Coastal' },
                    { value: 'cinematic', label: 'Cinematic' }
                ],
                onChange: value => applyPreset(value)
            }),
            h(RangeNumberField, {
                key: 'seed',
                label: 'Seed',
                value: config.seed,
                min: 1,
                max: 999999,
                step: 1,
                onChange: value => setConfig(['seed'], Math.round(value))
            })
        ]),
        h('div', { className: 'property-group', key: 'macro' }, [
            h(RangeNumberField, { label: 'Sea/Land Bias', value: config.macro.baseOffset, min: -200, max: 200, step: 5, onChange: value => setConfig(['macro', 'baseOffset'], value) }),
            h(RangeNumberField, { label: 'Land Lift', value: config.macro.continentalAmplitude, min: 40, max: 320, step: 5, onChange: value => setConfig(['macro', 'continentalAmplitude'], value) }),
            h(RangeNumberField, { label: 'Mountain Height', value: config.macro.ridgeAmplitude, min: 120, max: 1400, step: 10, onChange: value => setConfig(['macro', 'ridgeAmplitude'], value) }),
            h(RangeNumberField, { label: 'Mountain Spread', value: config.macro.foothillAmplitude, min: 0, max: 300, step: 5, onChange: value => setConfig(['macro', 'foothillAmplitude'], value) }),
            h(RangeNumberField, { label: 'Valley Cut', value: config.macro.valleyAmplitude, min: 0, max: 220, step: 5, onChange: value => setConfig(['macro', 'valleyAmplitude'], value) }),
            h(RangeNumberField, { label: 'Range Twist', value: config.macro.warpAmplitude, min: 0, max: 5000, step: 50, onChange: value => setConfig(['macro', 'warpAmplitude'], value) }),
            h(RangeNumberField, { label: 'Range Count', value: config.macro.rangeCount, min: 1, max: 10, step: 1, onChange: value => setConfig(['macro', 'rangeCount'], Math.round(value)) }),
            h(RangeNumberField, { label: 'Range Length', value: config.macro.rangeLength, min: 0.15, max: 1, step: 0.01, onChange: value => setConfig(['macro', 'rangeLength'], value) }),
            h(RangeNumberField, { label: 'Range Width', value: config.macro.rangeWidth, min: 0.15, max: 1, step: 0.01, onChange: value => setConfig(['macro', 'rangeWidth'], value) }),
            h(RangeNumberField, { label: 'Uplift Strength', value: config.macro.upliftStrength, min: 0, max: 1.2, step: 0.02, onChange: value => setConfig(['macro', 'upliftStrength'], value) }),
            h(RangeNumberField, { label: 'Massif Strength', value: config.macro.massifStrength, min: 0, max: 1.2, step: 0.02, onChange: value => setConfig(['macro', 'massifStrength'], value) }),
            h(RangeNumberField, { label: 'Escarpment Strength', value: config.macro.escarpmentStrength, min: 0, max: 1.2, step: 0.02, onChange: value => setConfig(['macro', 'escarpmentStrength'], value) }),
            h(RangeNumberField, { label: 'Plateau Height', value: config.macro.plateauHeight, min: 0, max: 420, step: 5, onChange: value => setConfig(['macro', 'plateauHeight'], value) }),
            h(RangeNumberField, { label: 'Summit Sharpness', value: config.macro.summitSharpness, min: 0, max: 1, step: 0.02, onChange: value => setConfig(['macro', 'summitSharpness'], value) }),
            h('div', { className: 'hint-card help-card', key: 'mountain-help' }, [
                h('p', { key: 'tip-1' }, 'For taller mountain ranges, raise Mountain Height and Land Lift together.'),
                h('p', { key: 'tip-2' }, 'For deeper carving, raise Valley Cut. Lowering it makes the terrain smoother.'),
                h('p', { key: 'tip-3' }, 'For broader ranges, raise Mountain Spread, Range Length, and Range Width together.'),
                h('p', { key: 'tip-4' }, `Current preset: ${(TERRAIN_GENERATOR_PRESETS[config.preset] || TERRAIN_GENERATOR_PRESETS.balanced).preset}`)
            ]),
            mountainDiagnosis.length > 0 ? h('div', { className: 'hint-card error-card', key: 'mountain-diagnosis' }, mountainDiagnosis.map((message, index) => (
                h('p', { key: `diag-${index}` }, message)
            ))) : null
        ]),
        h('div', { className: 'property-group', key: 'landforms' }, [
            h(RangeNumberField, { label: 'Glacial Valleys', value: config.landforms.glacialValleyStrength, min: 0, max: 1, step: 0.02, onChange: value => setConfig(['landforms', 'glacialValleyStrength'], value) }),
            h(RangeNumberField, { label: 'Canyon Depth', value: config.landforms.canyonDepth, min: 0, max: 1, step: 0.02, onChange: value => setConfig(['landforms', 'canyonDepth'], value) }),
            h(RangeNumberField, { label: 'Canyon Width', value: config.landforms.canyonWidth, min: 0.15, max: 1, step: 0.02, onChange: value => setConfig(['landforms', 'canyonWidth'], value) }),
            h(RangeNumberField, { label: 'Basin Depth', value: config.landforms.basinDepth, min: 0, max: 1, step: 0.02, onChange: value => setConfig(['landforms', 'basinDepth'], value) }),
            h(RangeNumberField, { label: 'Basin Breadth', value: config.landforms.basinBreadth, min: 0.15, max: 1, step: 0.02, onChange: value => setConfig(['landforms', 'basinBreadth'], value) })
        ]),
        h('div', { className: 'property-group', key: 'hydrology' }, [
            h(RangeNumberField, { label: 'River Count', value: config.hydrology.riverCount, min: 0, max: 32, step: 1, onChange: value => setConfig(['hydrology', 'riverCount'], Math.round(value)) }),
            h(RangeNumberField, { label: 'River Strength', value: config.hydrology.riverStrength, min: 0, max: 2.5, step: 0.05, onChange: value => setConfig(['hydrology', 'riverStrength'], value) }),
            h(RangeNumberField, { label: 'Lake Count', value: config.hydrology.lakeCount, min: 0, max: 16, step: 1, onChange: value => setConfig(['hydrology', 'lakeCount'], Math.round(value)) }),
            h(RangeNumberField, { label: 'Lake Strength', value: config.hydrology.lakeStrength, min: 0, max: 2, step: 0.05, onChange: value => setConfig(['hydrology', 'lakeStrength'], value) }),
            h(RangeNumberField, { label: 'Erosion', value: config.hydrology.erosionStrength, min: 0, max: 2, step: 0.05, onChange: value => setConfig(['hydrology', 'erosionStrength'], value) }),
            h(RangeNumberField, { label: 'Gorge Strength', value: config.hydrology.gorgeStrength, min: 0, max: 1.2, step: 0.02, onChange: value => setConfig(['hydrology', 'gorgeStrength'], value) }),
            h(RangeNumberField, { label: 'Incision Bias', value: config.hydrology.incisionBias, min: 0, max: 1, step: 0.02, onChange: value => setConfig(['hydrology', 'incisionBias'], value) }),
            h(RangeNumberField, { label: 'Floodplain Width', value: config.hydrology.floodplainWidth, min: 0, max: 1, step: 0.02, onChange: value => setConfig(['hydrology', 'floodplainWidth'], value) })
        ]),
        h('div', { className: 'property-group', key: 'preview' }, [
            h(SelectField, {
                key: 'overlay',
                label: 'Overlay',
                value: terrainLab.selectedOverlay,
                options: TERRAIN_PREVIEW_OVERLAYS.map(value => ({
                    value,
                    label: value === 'height' ? 'Height Tint' : value[0].toUpperCase() + value.slice(1)
                })),
                onChange: value => {
                    setConfig(['preview', 'overlay'], value);
                    markDirty();
                }
            }),
            h(RangeNumberField, { label: 'Opacity', value: config.preview.opacity, min: 0, max: 1, step: 0.05, onChange: value => setConfig(['preview', 'opacity'], value) }),
            h(RangeNumberField, { label: 'Resolution', value: config.preview.resolution, min: 32, max: 192, step: 8, onChange: value => setConfig(['preview', 'resolution'], Math.round(value)) }),
            h(FieldRow, {
                key: 'contours',
                label: 'Contours',
                children: h('input', {
                    type: 'checkbox',
                    checked: config.preview.showContours === true,
                    onChange: event => setConfig(['preview', 'showContours'], event.target.checked)
                })
            }),
            h('div', { className: 'hint-card help-card', key: 'stats' }, [
                h('p', { key: 'rivers' }, `Rivers: ${metrics.riverCount}`),
                h('p', { key: 'lakes' }, `Lakes: ${metrics.lakeCount}`),
                h('p', { key: 'relief' }, `Peak relief: ${Math.round(metrics.summary?.peakRelief || 0)}m`),
                h('p', { key: 'cliffs' }, `Cliff coverage: ${Math.round((metrics.summary?.cliffCoverage || 0) * 100)}%`),
                h('p', { key: 'gorges' }, `Gorge coverage: ${Math.round((metrics.summary?.gorgeCoverage || 0) * 100)}%`)
            ])
        ]),
        h('div', { className: 'property-group inline-actions', key: 'actions' }, [
            h('button', { className: 'tool-btn secondary-action', type: 'button', onClick: () => markDirty(), 'data-testid': 'terrain-lab-regenerate' }, 'Regenerate Preview'),
            h('button', {
                className: 'tool-btn accent-action',
                type: 'button',
                onClick: () => {
                    store.dispatch({ type: 'apply-terrain-generator' });
                    store.dispatch({ type: 'set-toast', toast: { message: 'Terrain generator applied. Save to persist and rebuild world for the offline bake.', tone: 'success', timestamp: Date.now() } });
                },
                'data-testid': 'terrain-lab-apply'
            }, 'Apply to Bake'),
            h('button', { className: 'tool-btn secondary-action', type: 'button', onClick: () => store.dispatch({ type: 'reset-terrain-generator' }), 'data-testid': 'terrain-lab-reset' }, 'Reset to Saved'),
            h('button', { className: 'tool-btn secondary-action', type: 'button', onClick: () => controller.frameTerrainHydrology(), 'data-testid': 'terrain-lab-frame' }, 'Frame Rivers/Lakes')
        ])
    ]);
}

function FooterPanel({ store, controller, onSave, onRebuild }) {
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
            h('span', { className: `status-chip ${state.history.dirty ? 'dirty' : 'clean'}`, 'data-testid': 'dirty-state-chip' }, state.history.dirty ? 'Unsaved changes' : 'Up to date'),
            h('span', { className: 'status-chip', 'data-testid': 'grid-snap-chip' }, state.tools.snappingEnabled ? 'Grid snap on' : 'Grid snap off'),
            h('span', { className: 'status-chip', 'data-testid': 'undo-count-chip' }, `Undo ${state.history.undoStack.length}`)
        ]),
        state.ui.saveError ? h('div', { className: 'hint-card error-card', key: 'error' }, state.ui.saveError) : null,
        h('div', { className: 'property-group inline-actions', key: 'actions' }, [
            h('button', { className: 'tool-btn secondary-action', type: 'button', onClick: () => store.dispatch({ type: 'undo' }), 'data-testid': 'undo-button' }, 'Undo'),
            h('button', { className: 'tool-btn secondary-action', type: 'button', onClick: () => store.dispatch({ type: 'redo' }), 'data-testid': 'redo-button' }, 'Redo'),
            h('button', { className: 'tool-btn secondary-action', type: 'button', onClick: () => controller.resetView(), 'data-testid': 'reset-view-button' }, 'Reset View'),
            h('button', { className: 'tool-btn secondary-action', type: 'button', onClick: onRebuild, 'data-testid': 'rebuild-world-button' }, 'Rebuild World'),
            h('button', { className: 'save-btn', type: 'button', onClick: onSave, 'data-testid': 'save-button' }, saveLabel)
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
    return h('div', { className: `toast toast-${toast.tone || 'info'}`, 'data-testid': 'toast' }, toast.message);
}

export function EditorApp({ store, controller, canvasRef, coordsRef, onSave, onRebuild }) {
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
                h('canvas', { id: 'map-canvas', ref: canvasRef, key: 'canvas', 'data-testid': 'map-canvas' }),
                h('div', { className: 'toolbar', key: 'toolbar', 'data-testid': 'toolbar' }, toolDefs.map(([tool, label, shortcut, path]) => (
                    h(ToolButton, {
                        key: tool,
                        id: `tool-${tool}`,
                        label,
                        shortcut,
                        active: currentTool === tool,
                        onClick: () => store.dispatch({ type: 'set-tool', tool })
                    }, h(Icon, { path }))
                ))),
                h('div', { id: 'coords', ref: coordsRef, key: 'coords', 'data-testid': 'coords-readout' }, 'X: 0, Z: 0')
            ]),
            h('aside', { id: 'sidebar', key: 'sidebar', 'data-testid': 'sidebar' }, [
                h('h2', { key: 'heading' }, ['WORLD EDITOR ', h('span', { className: 'status-badge', key: 'badge' }, 'v2.0')]),
                h(LayersPanel, { store, key: 'layers' }),
                h(InspectorPanel, { store, controller, key: 'inspector' }),
                h(TerrainBrushPanel, { store, key: 'terrain' }),
                h(TerrainLabPanel, { store, controller, key: 'terrain-lab' }),
                h(HelpPanel, { store, key: 'help' }),
                h(FooterPanel, { store, controller, onSave, onRebuild, key: 'footer' })
            ])
        ]),
        h(Toast, { store, key: 'toast' })
    ]);
}
