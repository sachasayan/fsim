import * as React from 'react';

import { Panel, RangeNumberField, shallowEqual, useStore } from './common.jsx';

export function AirportToolPanel({ store }) {
    const airportPlacement = useStore(store, (state) => state.tools.airportPlacement, shallowEqual);

    function patchAirportPlacement(patch) {
        store.dispatch({ type: 'set-airport-placement', patch });
    }

    return (
        <Panel
            title="Airport Tool"
            copy="Place cloned default airports into the world. Airports use terrain alignment and expose rotation for runway orientation."
            testId="airport-tool-panel"
        >
            <div className="editor-form-stack">
                <RangeNumberField
                    label="Yaw (deg)"
                    value={airportPlacement.yaw}
                    min={-180}
                    max={180}
                    step={1}
                    onChange={(value) => patchAirportPlacement({ yaw: value })}
                />
            </div>
        </Panel>
    );
}
