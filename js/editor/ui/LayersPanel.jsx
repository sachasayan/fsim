import * as React from 'react';

import { Icon, Panel, SurfaceIcon, Toggle, Tooltip, TooltipContent, TooltipTrigger, cn, useStore } from './common.jsx';
import { listLayerGroups } from '../core/document.js';

export const LAYER_DEFS = {
    districts: { label: 'Districts', path: 'M4 6h16v12H4zM8 6v12M16 6v12M4 12h16' },
    roads: { label: 'Roads', path: 'M8 3l2 7-2 11M16 3l-2 7 2 11M10 10h4M9 15h6' },
    terrainRegions: { label: 'Regions', path: 'M4 4h16v16H4zM8 8h8v8H8z' },
    terrain: { label: 'Terrain', path: 'M3 16l5-5 4 3 4-6 5 8M3 19h18' },
    vantage: { label: 'Views', path: 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z' }
};

export function LayerVisibilityControls({ store, variant = 'panel' }) {
    const state = useStore(store, (value) => value);
    const groups = listLayerGroups(state.document).filter((group) => LAYER_DEFS[group.id]);

    if (variant === 'dropdown') {
        return (
            <div className="editor-layer-dropdown-list" id="layers-groups" data-testid="layers-groups">
                {groups.map((group) => {
                    const visible = state.layers.groupVisibility[group.id] !== false;
                    const layer = LAYER_DEFS[group.id];
                    return (
                        <div key={group.id} className="editor-layer-dropdown-row">
                            <div className="flex min-w-0 items-center gap-3">
                                <SurfaceIcon compact>
                                    <Icon path={layer.path} />
                                </SurfaceIcon>
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--text)]">{layer.label}</span>
                                    <span className="editor-layer-count">{group.items.length}</span>
                                </div>
                            </div>
                            <Toggle
                                pressed={visible}
                                onPressedChange={() => store.dispatch({ type: 'toggle-group-visible', groupId: group.id })}
                                className={cn('editor-layer-row-toggle', visible && 'active')}
                                aria-pressed={visible ? 'true' : 'false'}
                                aria-label={`${layer.label} (${visible ? 'On' : 'Off'})`}
                                data-testid={`layer-toggle-${group.id}`}
                            >
                                {visible ? 'On' : 'Off'}
                            </Toggle>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="editor-layer-grid" id="layers-groups" data-testid="layers-groups">
            {groups.map((group) => {
                const visible = state.layers.groupVisibility[group.id] !== false;
                const layer = LAYER_DEFS[group.id];
                return (
                    <Tooltip key={group.id}>
                        <TooltipTrigger>
                            <Toggle
                                pressed={visible}
                                onPressedChange={() => store.dispatch({ type: 'toggle-group-visible', groupId: group.id })}
                                className={cn('editor-layer-toggle', visible && 'active')}
                                aria-pressed={visible ? 'true' : 'false'}
                                aria-label={`${layer.label} (${visible ? 'On' : 'Off'})`}
                                data-testid={`layer-toggle-${group.id}`}
                            >
                                <SurfaceIcon compact>
                                    <Icon path={layer.path} />
                                </SurfaceIcon>
                                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--text)]">{layer.label}</span>
                                <span className="editor-layer-count">{group.items.length}</span>
                            </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>{`${layer.label} (${visible ? 'On' : 'Off'})`}</TooltipContent>
                    </Tooltip>
                );
            })}
        </div>
    );
}

export function LayersPanel({ store }) {
    return (
        <Panel title="Layers" testId="layers-panel">
            <LayerVisibilityControls store={store} />
        </Panel>
    );
}
