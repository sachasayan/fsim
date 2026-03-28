import * as React from 'react';

import type { EditorStore } from '../core/types.js';
import { Button, Icon, shallowEqual, useStore } from './common';
import { LayerVisibilityControls } from './LayersPanel';

export function LayersDropdown({ store }: { store: EditorStore }) {
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const { groupVisibility } = useStore<{ groupVisibility: Record<string, boolean> }>(
        store,
        (state) => ({
            groupVisibility: state.layers.groupVisibility
        }),
        shallowEqual
    );
    const layerGroups = React.useMemo(
        () => Object.values(groupVisibility),
        [groupVisibility]
    );
    const hiddenCount = layerGroups.filter((visible) => visible === false).length;

    React.useEffect(() => {
        if (!open) return undefined;

        function handlePointerDown(event: PointerEvent) {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        }

        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="editor-dropdown-shell">
            <Button
                type="button"
                variant="secondary"
                className="h-10 rounded-2xl px-4"
                data-testid="layers-panel"
                aria-expanded={open ? 'true' : 'false'}
                aria-controls="layers-dropdown-menu"
                onClick={() => setOpen((value) => !value)}
            >
                <Icon path="M4 6h16M4 12h16M4 18h16" />
                <span>Layers</span>
                <span className="editor-dropdown-summary">{hiddenCount === 0 ? 'All On' : `${hiddenCount} Hidden`}</span>
            </Button>

            {open ? (
                <div id="layers-dropdown-menu" className="editor-dropdown-menu" data-testid="layers-dropdown-menu">
                    <div className="editor-dropdown-header">
                        <div className="editor-section-title">Layers</div>
                        <span className="editor-panel-copy">Toggle world groups without opening the dock.</span>
                    </div>
                    <LayerVisibilityControls store={store} variant="dropdown" />
                </div>
            ) : null}
        </div>
    );
}
