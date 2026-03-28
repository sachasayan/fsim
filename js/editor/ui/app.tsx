import * as React from 'react';

import { isTerrainBrushTool } from '../../modules/editor/constants.js';
import { isTerrainRegion } from '../../modules/editor/objectTypes.js';
import { getEntityById } from '../core/document.js';
import type { EditorEntity, EditorStore, EditorTool } from '../core/types.js';
import { AppHeader } from './AppHeader';
import { AirportToolPanel } from './AirportToolPanel';
import { FooterPanel } from './FooterPanel';
import { Icon, TooltipProvider, shallowEqual, useStore } from './common';
import { InspectorPanel } from './InspectorPanel.jsx';
import { ObjectToolPanel } from './ObjectToolPanel';
import { ShortcutHelpModal } from './ShortcutHelpModal';
import { StatusBar } from './StatusBar.jsx';
import { TerrainBrushPanel } from './TerrainBrushPanel';
import { TerrainLabPanel } from './TerrainLabPanel.jsx';
import { Toast } from './Toast';
import { ToolPalette } from './ToolPalette';

type EditorAppController = {
    resetView: () => void;
    frameSelection: () => void;
};

type EditorAppSelection = {
    currentTool: EditorTool;
    selectedEntity: EditorEntity | null;
};

type ToolIconProps = {
    path: string;
    className?: string;
};

type ToolDefinition = readonly [EditorTool, string, string, string, React.ComponentType<ToolIconProps>];

export function EditorApp({
    store,
    controller,
    canvasRef,
    coordsRef,
    onSave,
    onRebuild
}: {
    store: EditorStore;
    controller: EditorAppController;
    canvasRef: React.Ref<HTMLCanvasElement>;
    coordsRef: React.Ref<HTMLDivElement>;
    onSave: () => void | Promise<void | boolean> | Promise<boolean>;
    onRebuild: () => void | Promise<void>;
}) {
    const { currentTool, selectedEntity } = useStore<EditorAppSelection>(
        store,
        (state) => ({
            currentTool: state.tools.currentTool,
            selectedEntity: getEntityById(state.document, state.selection.selectedId)
        }),
        shallowEqual
    );

    const toolDefs: ToolDefinition[] = [
        ['select', 'Select', 'V', 'M5 3v18l5-6 4 6 5-2-4-6 6-4z', Icon],
        ['add-airport', 'Airport', 'A', 'M4 18h16M8 18V8m8 10V8M12 18V4M7 8h10', Icon],
        ['add-district', 'District', 'D', 'M4 6h16v12H4z', Icon],
        ['add-object', 'Object', 'O', 'M5 8l7-4 7 4v8l-7 4-7-4z', Icon],
        ['add-road', 'Road', 'W', 'M8 3l2 7-2 11M16 3l-2 7 2 11', Icon],
        ['terrain-region', 'Region', 'T', 'M4 4h16v16H4z', Icon],
        ['edit-poly', 'Edit', 'E', 'M5 6l7-3 7 4v9l-7 5-7-4z', Icon],
        ['terrain-raise', 'Raise', 'R', 'M4 18h16M12 6v8M9 9l3-3 3 3', Icon],
        ['terrain-lower', 'Lower', 'L', 'M4 18h16M12 6v8M9 11l3 3 3-3', Icon],
        ['terrain-flatten', 'Flatten', 'F', 'M4 16h16M4 11h16M4 8h16', Icon]
    ];
    const activeToolLabel = toolDefs.find(([tool]) => tool === currentTool)?.[1] || currentTool;

    return (
        <TooltipProvider>
            <div className="editor-shell">
                <AppHeader
                    store={store}
                    controller={controller}
                    onSave={onSave}
                    onRebuild={onRebuild}
                    activeToolLabel={activeToolLabel}
                />

                <div className="editor-workspace">
                    <main className="editor-canvas-stage">
                        <div className="editor-floating-tools">
                            <ToolPalette store={store} currentTool={currentTool} toolDefs={toolDefs} />
                        </div>
                        <div id="canvas-container" className={`editor-canvas-container tool-${currentTool}`}>
                            <canvas id="map-canvas" ref={canvasRef} data-testid="map-canvas" />
                        </div>
                    </main>

                    <aside className="editor-dock editor-right-dock" id="inspector-dock">
                        <InspectorPanel store={store} controller={controller} />
                        {currentTool === 'add-airport' ? <AirportToolPanel store={store} /> : null}
                        {currentTool === 'add-object' ? <ObjectToolPanel store={store} /> : null}
                        {isTerrainBrushTool(currentTool) ? <TerrainBrushPanel store={store} /> : null}
                        {isTerrainRegion(selectedEntity) ? <TerrainLabPanel store={store} controller={controller} /> : null}
                        <FooterPanel store={store} />
                    </aside>
                </div>

                <StatusBar coordsRef={coordsRef} />
            </div>
            <ShortcutHelpModal store={store} />
            <Toast store={store} />
        </TooltipProvider>
    );
}
