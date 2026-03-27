import * as React from 'react';

import { ToolButton } from './common.jsx';

export function ToolPalette({ store, currentTool, toolDefs }) {
    return (
        <div className="editor-toolbar-strip" data-testid="toolbar">
            {toolDefs.map(([tool, label, shortcut, path, IconComponent]) => (
                <ToolButton
                    key={tool}
                    id={`tool-${tool}`}
                    label={label}
                    shortcut={shortcut}
                    active={currentTool === tool}
                    compact
                    onClick={() => store.dispatch({ type: 'set-tool', tool })}
                >
                    <IconComponent path={path} className="size-5" />
                </ToolButton>
            ))}
        </div>
    );
}
