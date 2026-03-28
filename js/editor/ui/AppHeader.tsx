import * as React from 'react';

import type { EditorStore } from '../core/types.js';
import { StatusChip } from './common';
import { CommandStrip } from './CommandStrip';
import { LayersDropdown } from './LayersDropdown';
import { ShortcutHelpButton } from './ShortcutHelpModal';

type AppHeaderController = {
    resetView: () => void;
};

export function AppHeader({
    store,
    controller,
    onSave,
    onRebuild,
    activeToolLabel
}: {
    store: EditorStore;
    controller: AppHeaderController;
    onSave: () => void | Promise<void | boolean> | Promise<boolean>;
    onRebuild: () => void | Promise<void>;
    activeToolLabel: string;
}) {
    return (
        <header className="editor-topbar">
            <div className="editor-topbar-status">
                <ShortcutHelpButton store={store} />
                <LayersDropdown store={store} />
                <StatusChip iconPath="M12 3l7 4v10l-7 4-7-4V7z">{activeToolLabel}</StatusChip>
            </div>

            <CommandStrip store={store} controller={controller} onSave={onSave} onRebuild={onRebuild} />
        </header>
    );
}
