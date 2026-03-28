import * as React from 'react';

import { listAuthoredObjectAssets } from '../../modules/world/AuthoredObjectCatalog';
import type { EditorStore, EditorStoreState } from '../core/types.js';
import { Panel, RangeNumberField, SelectField, shallowEqual, useStore } from './common';

const OBJECT_HEIGHT_MODE_OPTIONS = [
    { value: 'terrain', label: 'Terrain Height' },
    { value: 'sea-level', label: 'Sea Level' },
    { value: 'absolute', label: 'Arbitrary Height' }
];

const OBJECT_ASSET_OPTIONS = listAuthoredObjectAssets().map((asset) => ({
    value: asset.id,
    label: asset.label
}));

export function ObjectToolPanel({ store }: { store: EditorStore }) {
    const objectPlacement = useStore<EditorStoreState['tools']['objectPlacement']>(
        store,
        (state) => state.tools.objectPlacement,
        shallowEqual
    );
    const heightLabel = objectPlacement.heightMode === 'absolute'
        ? 'Altitude (m)'
        : objectPlacement.heightMode === 'sea-level'
            ? 'Sea Level Offset (m)'
            : 'Terrain Offset (m)';
    const heightMin = objectPlacement.heightMode === 'terrain' ? -100 : -200;
    const heightMax = objectPlacement.heightMode === 'terrain' ? 1000 : 3000;

    function patchObjectPlacement(patch: Partial<EditorStoreState['tools']['objectPlacement']>) {
        store.dispatch({ type: 'set-object-placement', patch });
    }

    return (
        <Panel
            title="Object Tool"
            copy="Stamp authored assets onto the map. Terrain mode hugs the ground, sea level anchors to the water plane, and arbitrary mode uses the entered world altitude."
            testId="object-tool-panel"
        >
            <div className="editor-form-stack">
                <SelectField
                    label="Asset"
                    value={objectPlacement.assetId}
                    options={OBJECT_ASSET_OPTIONS}
                    onChange={(value) => patchObjectPlacement({ assetId: value })}
                    testId="field-object-asset"
                />
                <SelectField
                    label="Height Mode"
                    value={objectPlacement.heightMode}
                    options={OBJECT_HEIGHT_MODE_OPTIONS}
                    onChange={(value) => patchObjectPlacement({ heightMode: value })}
                    testId="field-object-height-mode"
                />
                <RangeNumberField
                    label={heightLabel}
                    value={objectPlacement.y}
                    min={heightMin}
                    max={heightMax}
                    step={5}
                    onChange={(value) => patchObjectPlacement({ y: value })}
                />
                <RangeNumberField
                    label="Yaw (deg)"
                    value={objectPlacement.yaw}
                    min={-180}
                    max={180}
                    step={1}
                    onChange={(value) => patchObjectPlacement({ yaw: value })}
                />
                <RangeNumberField
                    label="Scale"
                    value={objectPlacement.scale}
                    min={0.1}
                    max={5}
                    step={0.05}
                    onChange={(value) => patchObjectPlacement({ scale: value })}
                />
            </div>
        </Panel>
    );
}
