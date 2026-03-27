import * as React from 'react';

import { isAuthoredObject, isDistrict, isRoad, isTerrainEdit, isTerrainRegion } from '../../modules/editor/objectTypes.js';
import { getDistrictType, DISTRICT_TYPES, ROAD_KINDS, ROAD_SURFACES } from '../../modules/world/MapDataUtils.js';
import { listAuthoredObjectAssets } from '../../modules/world/AuthoredObjectCatalog.js';
import { getEntityById, getEntityLabel } from '../core/document.js';
import { Badge, Button, FieldRow, HintCard, Input, NumberInputField, Panel, RangeNumberField, SelectField, Separator, shallowEqual, useStore } from './common.jsx';

const OBJECT_ASSET_OPTIONS = listAuthoredObjectAssets().map((asset) => ({
    value: asset.id,
    label: asset.label
}));

const OBJECT_HEIGHT_MODE_OPTIONS = [
    { value: 'terrain', label: 'Terrain Height' },
    { value: 'absolute', label: 'Arbitrary Height' }
];

export function InspectorPanel({ store, controller }) {
    const { document, selectedId, selected, groupLocked, itemLocked } = useStore(store, (state) => {
        const selectedEntity = getEntityById(state.document, state.selection.selectedId);
        const groupId = isDistrict(selectedEntity)
            ? 'districts'
            : isRoad(selectedEntity)
                ? 'roads'
                : isTerrainRegion(selectedEntity)
                    ? 'terrainRegions'
                    : isAuthoredObject(selectedEntity)
                        ? 'objects'
                    : isTerrainEdit(selectedEntity)
                        ? 'terrain'
                        : 'vantage';
        return {
            document: state.document,
            selectedId: state.selection.selectedId,
            selected: selectedEntity,
            groupLocked: state.layers.groupLocked[groupId] === true,
            itemLocked: state.layers.itemLocked[state.selection.selectedId] === true
        };
    }, shallowEqual);

    if (!selected) {
        return (
            <Panel title="Properties" copy="Selection details and terrain systems stay docked off the canvas, not stacked over it." testId="inspector-empty">
                <HintCard className="text-center">Select an object to edit its properties.</HintCard>
            </Panel>
        );
    }

    const locked = groupLocked || itemLocked;

    function updateProperty(key, value) {
        store.runCommand({ type: 'change-property', entityId: selectedId, key, value });
    }

    function updateCenter(axis, value) {
        if (selected.center) {
            const next = [...selected.center];
            next[axis] = value;
            store.runCommand({ type: 'move-entity', entityId: selectedId, nextCenter: next });
            return;
        }
        const point = { x: selected.x, z: selected.z };
        if (axis === 0) point.x = value;
        else point.z = value;
        store.runCommand({ type: 'move-entity', entityId: selectedId, nextPoint: point });
    }

    const typeLabel = isDistrict(selected) ? 'DISTRICT' : isRoad(selected) ? 'ROAD' : isTerrainRegion(selected) ? 'REGION' : isAuthoredObject(selected) ? 'OBJECT' : isTerrainEdit(selected) ? 'TERRAIN' : 'VANTAGE';

    return (
        <Panel
            title="Properties"
            copy="Selection details and terrain systems stay docked off the canvas, not stacked over it."
            testId="inspector-panel"
            badge={<Badge className="ml-auto" data-testid="inspector-type-badge">{typeLabel}</Badge>}
        >
            <div className="editor-form-stack">
                <FieldRow label="ID">
                    <Input type="text" readOnly value={getEntityLabel(document, selectedId)} data-testid="field-id" />
                </FieldRow>

                {isTerrainRegion(selected) ? (
                    <div className="editor-grid-two">
                        <NumberInputField label="Tile X" value={selected.tileX} disabled onChange={() => {}} />
                        <NumberInputField label="Tile Z" value={selected.tileZ} disabled onChange={() => {}} />
                        <NumberInputField label="Tile Width" value={selected.tileWidth} disabled onChange={() => {}} />
                        <NumberInputField label="Tile Height" value={selected.tileHeight} disabled onChange={() => {}} />
                    </div>
                ) : (
                    <div className="editor-grid-two">
                        <NumberInputField
                            label="Coord X"
                            disabled={locked || (isTerrainEdit(selected) && Array.isArray(selected.points) && selected.points.length > 0)}
                            value={selected.center ? selected.center[0] : selected.x}
                            onChange={(event) => updateCenter(0, Number(event.target.value))}
                        />
                        <NumberInputField
                            label="Coord Z"
                            disabled={locked || (isTerrainEdit(selected) && Array.isArray(selected.points) && selected.points.length > 0)}
                            value={selected.center ? selected.center[1] : selected.z}
                            onChange={(event) => updateCenter(1, Number(event.target.value))}
                        />
                    </div>
                )}

                {isDistrict(selected) ? (
                    <>
                        <SelectField
                            label="District Type"
                            disabled={locked}
                            value={getDistrictType(selected)}
                            onChange={(value) => updateProperty('district_type', value)}
                            options={DISTRICT_TYPES.map((option) => ({ value: option, label: option }))}
                            testId="field-district-type"
                        />
                        {getDistrictType(selected) === 'windmill_farm' ? (
                            <>
                                <RangeNumberField label="Turbine Density" value={selected.turbine_density} min={0.05} max={1} step={0.05} disabled={locked} onChange={(value) => updateProperty('turbine_density', value)} />
                                <RangeNumberField label="Rotor Radius" value={selected.rotor_radius} min={8} max={80} step={1} disabled={locked} onChange={(value) => updateProperty('rotor_radius', value)} />
                                <RangeNumberField label="Setback" value={selected.setback} min={20} max={240} step={5} disabled={locked} onChange={(value) => updateProperty('setback', value)} />
                            </>
                        ) : null}
                    </>
                ) : null}

                {isRoad(selected) ? (
                    <>
                        <SelectField
                            label="Road Kind"
                            disabled={locked}
                            value={selected.kind}
                            onChange={(value) => updateProperty('kind', value)}
                            options={ROAD_KINDS.map((option) => ({ value: option, label: option }))}
                            testId="field-road-kind"
                        />
                        <SelectField
                            label="Surface"
                            disabled={locked}
                            value={selected.surface}
                            onChange={(value) => updateProperty('surface', value)}
                            options={ROAD_SURFACES.map((option) => ({ value: option, label: option }))}
                            testId="field-road-surface"
                        />
                        <RangeNumberField label="Width" value={selected.width} min={4} max={120} step={1} disabled={locked} onChange={(value) => updateProperty('width', value)} />
                        <RangeNumberField label="Feather" value={selected.feather} min={0} max={80} step={1} disabled={locked} onChange={(value) => updateProperty('feather', value)} />
                    </>
                ) : null}

                {isTerrainEdit(selected) ? (
                    <>
                        <FieldRow label="Brush Kind">
                            <Input type="text" readOnly value={selected.kind} />
                        </FieldRow>
                        <RangeNumberField label="Radius" value={selected.radius} min={50} max={2000} step={10} disabled={locked} onChange={(value) => updateProperty('radius', value)} />
                        {selected.kind !== 'flatten' ? (
                            <RangeNumberField label="Delta" value={selected.delta} min={1} max={200} step={1} disabled={locked} onChange={(value) => updateProperty('delta', value)} />
                        ) : (
                            <>
                                <RangeNumberField label="Target H" value={selected.target_height} min={-200} max={1200} step={5} disabled={locked} onChange={(value) => updateProperty('target_height', value)} />
                                <RangeNumberField label="Opacity" value={selected.opacity} min={0} max={1} step={0.05} disabled={locked} onChange={(value) => updateProperty('opacity', value)} />
                            </>
                        )}
                    </>
                ) : null}

                {isAuthoredObject(selected) ? (
                    <>
                        <SelectField
                            label="Asset"
                            disabled={locked}
                            value={selected.assetId}
                            onChange={(value) => updateProperty('assetId', value)}
                            options={OBJECT_ASSET_OPTIONS}
                            testId="field-object-asset"
                        />
                        <SelectField
                            label="Height Mode"
                            disabled={locked}
                            value={selected.heightMode || 'terrain'}
                            onChange={(value) => updateProperty('heightMode', value)}
                            options={OBJECT_HEIGHT_MODE_OPTIONS}
                            testId="field-object-height-mode"
                        />
                        <RangeNumberField
                            label={selected.heightMode === 'absolute' ? 'Altitude (m)' : 'Terrain Offset (m)'}
                            value={selected.y || 0}
                            min={selected.heightMode === 'absolute' ? -200 : -100}
                            max={selected.heightMode === 'absolute' ? 3000 : 1000}
                            step={5}
                            disabled={locked}
                            onChange={(value) => updateProperty('y', value)}
                        />
                        <RangeNumberField label="Yaw (deg)" value={selected.yaw || 0} min={-180} max={180} step={1} disabled={locked} onChange={(value) => updateProperty('yaw', value)} />
                        <RangeNumberField label="Scale" value={selected.scale || 1} min={0.1} max={5} step={0.05} disabled={locked} onChange={(value) => updateProperty('scale', value)} />
                    </>
                ) : null}

                {!isDistrict(selected) && !isRoad(selected) && !isTerrainEdit(selected) && !isTerrainRegion(selected) && !isAuthoredObject(selected) ? (
                    <>
                        <RangeNumberField label="Altitude (m)" value={selected.y || 0} min={0} max={3000} step={10} disabled={locked} onChange={(value) => updateProperty('y', value)} />
                        <RangeNumberField label="Tilt (deg)" value={selected.tilt || 45} min={5} max={85} step={1} disabled={locked} onChange={(value) => updateProperty('tilt', value)} />
                        <Button
                            type="button"
                            variant="accent"
                            onClick={() => {
                                const url = `/fsim.html?x=${selected.x}&y=${selected.y || 0}&z=${selected.z}&tilt=${selected.tilt || 45}&fog=${selected.fog || 0}&clouds=${selected.clouds || 0}&lighting=${selected.lighting || 'noon'}`;
                                window.open(url, '_blank');
                            }}
                        >
                            Launch In Sim
                        </Button>
                    </>
                ) : null}

                <Separator />

                <div className="editor-inline-actions">
                    <Button type="button" variant="secondary" onClick={() => controller.frameSelection()}>
                        Frame Selection
                    </Button>
                    <Button
                        type="button"
                        variant="danger"
                        disabled={locked}
                        onClick={() => store.runCommand({ type: 'delete-entity', entityId: selectedId })}
                    >
                        Delete Selected
                    </Button>
                </div>
            </div>
        </Panel>
    );
}
