import * as React from 'react';

import { CommandButton, StatusChip, shallowEqual, useStore } from './common.jsx';

export function CommandStrip({ store, controller, onSave, onRebuild }) {
    const { saveState, saveProgress, rebuildState, rebuildProgress, dirty, snappingEnabled, undoCount } = useStore(store, (state) => ({
        saveState: state.ui.saveState,
        saveProgress: state.ui.saveProgress,
        rebuildState: state.ui.rebuildState,
        rebuildProgress: state.ui.rebuildProgress,
        dirty: state.history.dirty,
        snappingEnabled: state.tools.snappingEnabled,
        undoCount: state.history.undoStack.length
    }), shallowEqual);
    const isSaving = saveState === 'saving';
    const isRebuilding = rebuildState === 'queued' || rebuildState === 'running';
    const saveLabel = isSaving
        ? `${saveProgress?.label || 'Saving'}${saveProgress ? ` ${saveProgress.step}/${saveProgress.total}` : '...'}`
        : !dirty && isRebuilding
            ? `${rebuildProgress?.label || 'Rebuilding world'}${rebuildProgress ? ` ${rebuildProgress.step}/${rebuildProgress.total}` : ''}`
        : saveState === 'saved'
            ? 'Saved'
            : dirty
                ? 'Save Changes'
                : 'Saved';
    const saveTitle = isSaving && saveProgress
        ? `${saveProgress.label} (${saveProgress.step}/${saveProgress.total})`
        : !dirty && isRebuilding && rebuildProgress
            ? `${rebuildProgress.label} (${rebuildProgress.step}/${rebuildProgress.total})`
        : saveLabel;
    const saveButtonBusy = isSaving || (!dirty && isRebuilding);
    const saveButtonDisabled = isSaving || (!dirty && isRebuilding);

    return (
        <div className="editor-topbar-commands flex flex-wrap items-center justify-between gap-3" data-testid="command-strip">
            <div className="flex flex-1 flex-wrap items-center gap-2">
                <StatusChip
                    testId="dirty-state-chip"
                    tone={dirty ? 'dirty' : 'clean'}
                    iconPath={dirty ? 'M12 7v6l4 2M12 3a9 9 0 100 18 9 9 0 000-18z' : 'M5 12l4 4L19 7'}
                >
                    {dirty ? 'Unsaved changes' : 'Up to date'}
                </StatusChip>
                <StatusChip
                    testId="grid-snap-chip"
                    iconPath={snappingEnabled ? 'M12 3v5M12 16v5M3 12h5M16 12h5M6.5 6.5l3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3' : 'M5 5l14 14M12 3v3M3 12h3M18 12h3M12 18v3'}
                >
                    {snappingEnabled ? 'Grid snap on' : 'Grid snap off'}
                </StatusChip>
                <StatusChip testId="undo-count-chip" iconPath="M9 7l-4 4 4 4M5 11h8a6 6 0 110 12h-1">
                    {`Undo ${undoCount}`}
                </StatusChip>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <CommandButton testId="undo-button" title="Undo" onClick={() => store.dispatch({ type: 'undo' })} iconPath="M9 7l-4 4 4 4M5 11h8a6 6 0 110 12h-1" disabled={isSaving}>Undo</CommandButton>
                <CommandButton testId="redo-button" title="Redo" onClick={() => store.dispatch({ type: 'redo' })} iconPath="M15 7l4 4-4 4M19 11h-8a6 6 0 100 12h1" disabled={isSaving}>Redo</CommandButton>
                <CommandButton testId="reset-view-button" title="Reset View" onClick={() => controller.resetView()} iconPath="M12 4V1m0 22v-3M4 12H1m22 0h-3M6.3 6.3L4.2 4.2m15.6 15.6l-2.1-2.1m0-11.4l2.1-2.1M6.3 17.7l-2.1 2.1">Reset View</CommandButton>
                <CommandButton testId="rebuild-world-button" title="Rebuild World" onClick={onRebuild} iconPath="M4 12a8 8 0 0113.66-5.66L20 8M20 4v4h-4M20 12a8 8 0 01-13.66 5.66L4 16M4 20v-4h4" disabled={isSaving || isRebuilding}>Rebuild World</CommandButton>
                <CommandButton testId="save-button" title={saveTitle} onClick={onSave} variant="accent" className="min-w-[220px]" iconPath={saveState === 'saved' && !isRebuilding ? 'M5 12l4 4L19 7' : 'M6 4h10l4 4v12H6zM9 4v6h6V4M9 20v-6h6v6'} disabled={saveButtonDisabled} busy={saveButtonBusy}>
                    {saveLabel}
                </CommandButton>
            </div>
        </div>
    );
}
