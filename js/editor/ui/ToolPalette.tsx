import * as React from 'react';

import type { EditorStore, EditorTool } from '../core/types.js';
import { ToolButton } from './common';

type ToolIconProps = {
    path: string;
    className?: string;
};

type ToolDefinition = readonly [EditorTool, string, string, string, React.ComponentType<ToolIconProps>];

export function ToolPalette({
    store,
    currentTool,
    toolDefs
}: {
    store: EditorStore;
    currentTool: EditorTool;
    toolDefs: ToolDefinition[];
}) {
    return (
        <div className="editor-toolbar-strip" data-testid="toolbar">
            {toolDefs.map(([tool, label, shortcut, path, IconComponent]) => (
                <React.Fragment key={tool}>
                    <ToolButton
                        id={`tool-${tool}`}
                        label={label}
                        shortcut={shortcut}
                        active={currentTool === tool}
                        compact
                        onClick={() => {
                            store.dispatch({ type: 'set-tool', tool });
                        }}
                    >
                        <IconComponent path={path} className="size-5" />
                    </ToolButton>
                </React.Fragment>
            ))}
        </div>
    );
}
