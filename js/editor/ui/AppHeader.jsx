import * as React from 'react';

import { StatusChip } from './common.jsx';
import { CommandStrip } from './CommandStrip.jsx';
import { LayersDropdown } from './LayersDropdown.jsx';
import { ShortcutHelpButton } from './ShortcutHelpModal.jsx';

export function AppHeader({ store, controller, onSave, onRebuild, activeToolLabel }) {
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
