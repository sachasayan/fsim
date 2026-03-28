import * as React from 'react';

import type { EditorStore } from '../core/types.js';
import { Button, HintCard, Icon, useStore } from './common';

export function ShortcutHelpButton({ store }: { store: EditorStore }) {
    const showHelp = useStore<boolean>(store, (state) => state.ui.showHelp);

    return (
        <Button
            type="button"
            variant="secondary"
            className="h-10 rounded-2xl px-4"
            data-testid="shortcut-help-button"
            aria-expanded={showHelp ? 'true' : 'false'}
            aria-controls="shortcut-help-modal"
            onClick={() => store.dispatch({ type: 'toggle-help', value: !showHelp })}
        >
            <Icon path="M12 17h.01M9.09 9a3 3 0 115.82 1c0 2-3 3-3 3" />
            <span>Shortcuts</span>
        </Button>
    );
}

export function ShortcutHelpModal({ store }: { store: EditorStore }) {
    const showHelp = useStore<boolean>(store, (state) => state.ui.showHelp);

    React.useEffect(() => {
        if (!showHelp) return undefined;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                store.dispatch({ type: 'toggle-help', value: false });
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showHelp, store]);

    if (!showHelp) return null;

    return (
        <div
            className="editor-modal-backdrop"
            data-testid="shortcut-help-modal"
            id="shortcut-help-modal"
            onClick={() => store.dispatch({ type: 'toggle-help', value: false })}
        >
            <div
                className="editor-modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="shortcut-help-title"
                onClick={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <div className="editor-section-title">Shortcut Help</div>
                        <h2 id="shortcut-help-title" className="m-0 text-xl font-bold text-white">Editor shortcuts</h2>
                        <p className="editor-panel-copy">Keep the canvas clean and pull shortcuts in only when you need them.</p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Close shortcut help"
                        onClick={() => store.dispatch({ type: 'toggle-help', value: false })}
                    >
                        <Icon path="M6 6l12 12M18 6L6 18" />
                    </Button>
                </div>

                <div className="editor-modal-grid">
                    <HintCard tone="info">
                        <p>Tools: V Select, A Airport, D District, O Object, W Road, T Region, E Poly Edit, R Raise, L Lower, F Flatten.</p>
                        <p>Terrain Regions: drag on the canvas with Region active to claim a rectangular group of tiles.</p>
                    </HintCard>
                    <HintCard>
                        <p>History: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y redo.</p>
                        <p>Navigation: middle mouse pan, wheel zoom, F frame selection, 0 reset view, G toggle grid snap.</p>
                        <p>Editing: arrows nudge, Shift arrows coarse nudge, Alt arrows fine nudge, Delete removes, Cmd/Ctrl+D duplicates.</p>
                    </HintCard>
                </div>
            </div>
        </div>
    );
}
