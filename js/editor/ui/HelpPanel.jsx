import * as React from 'react';

import { Button, HintCard, Panel, useStore } from './common.jsx';

export function HelpPanel({ store }) {
    const showHelp = useStore(store, (state) => state.ui.showHelp);
    return (
        <Panel title="Shortcut Help">
            <Button type="button" variant="secondary" onClick={() => store.dispatch({ type: 'toggle-help', value: !showHelp })}>
                {showHelp ? 'Hide Shortcuts' : 'Show Shortcuts'}
            </Button>
            {showHelp ? (
                <HintCard>
                    <p>Tools: V Select, D District, W Road, T Region, E Poly Edit, R Raise, L Lower, F Flatten.</p>
                    <p>Terrain Regions: drag on the canvas with Region active to claim a rectangular group of tiles.</p>
                    <p>History: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y redo.</p>
                    <p>Navigation: middle mouse pan, wheel zoom, F frame selection, 0 reset view, G toggle grid snap.</p>
                    <p>Editing: arrows nudge, Shift arrows coarse nudge, Alt arrows fine nudge, Delete removes, Cmd/Ctrl+D duplicates.</p>
                </HintCard>
            ) : null}
        </Panel>
    );
}
