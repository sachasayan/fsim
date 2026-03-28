import * as React from 'react';

import type { EditorStore } from '../core/types.js';
import { Panel, RangeNumberField, useStore } from './common';

export function TerrainBrushPanel({ store }: { store: EditorStore }) {
    const brush = useStore(store, (state) => state.tools.terrainBrush);
    return (
        <Panel title="Terrain Brush">
            <div className="editor-form-stack">
                <RangeNumberField
                    label="Radius"
                    value={brush.radius}
                    min={50}
                    max={2000}
                    step={10}
                    onChange={(value) => store.dispatch({ type: 'set-terrain-brush', patch: { radius: value } })}
                />
                <RangeNumberField
                    label="Strength"
                    value={brush.strength}
                    min={0}
                    max={200}
                    step={1}
                    onChange={(value) => store.dispatch({ type: 'set-terrain-brush', patch: { strength: value } })}
                />
            </div>
        </Panel>
    );
}
