import * as React from 'react';

import { isTerrainRegion } from '../../modules/editor/objectTypes.js';
import { TERRAIN_GENERATOR_PRESETS, TERRAIN_PREVIEW_OVERLAYS, applyTerrainGeneratorPreset } from '../../modules/world/terrain/TerrainSynthesis.js';
import { getEntityById } from '../core/document.js';
import { Badge, Button, CheckboxField, HintCard, Panel, RangeNumberField, SectionHeading, SelectField, Separator, useStore } from './common.jsx';

export function TerrainLabPanel({ store, controller }) {
    const terrainLab = useStore(store, (state) => state.ui.terrainLab);
    const selectedEntity = useStore(store, (state) => getEntityById(state.document, state.selection.selectedId));
    const config = terrainLab.draftConfig;
    const metrics = terrainLab.lastMetadata?.hydrology || { riverCount: 0, lakeCount: 0, summary: { cliffCoverage: 0, gorgeCoverage: 0, peakRelief: 0 } };
    const mountainDiagnosis = [];

    if (config.macro.continentalAmplitude <= 80 && config.macro.ridgeAmplitude >= 1000) mountainDiagnosis.push('Land Lift is very low for the current Mountain Height, so peaks will read as isolated bumps instead of full mountain ranges.');
    if (config.macro.valleyAmplitude <= 10) mountainDiagnosis.push('Valley Cut is near zero, which effectively disables most large valley carving.');
    if (config.macro.foothillAmplitude < 80 && config.macro.ridgeAmplitude > 900) mountainDiagnosis.push('Mountain Spread is low, so ridges stay narrow and the terrain can feel less dramatic at a distance.');
    if (config.landforms.canyonDepth > 0.72 && config.hydrology.gorgeStrength < 0.45) mountainDiagnosis.push('Canyon Depth is high, but Gorge Strength is low, so channels may read wide without carving hard enough.');
    if (config.macro.plateauHeight > 250 && config.macro.escarpmentStrength < 0.35) mountainDiagnosis.push('Plateau Height is high while Escarpment Strength is low, so shelves may feel soft instead of cliffy.');
    if (config.macro.summitSharpness > 0.7 && config.macro.massifStrength < 0.35) mountainDiagnosis.push('Peak Sharpness is very high, but Massif Strength is low, so you may get pointy ridges without enough heroic summits.');

    function setConfig(path, value) {
        store.dispatch({ type: 'set-terrain-generator-config', path, value });
    }

    function applyPreset(presetName) {
        const nextConfig = applyTerrainGeneratorPreset(config, presetName);
        store.dispatch({ type: 'set-terrain-preview-status', status: 'idle' });
        store.dispatch({ type: 'set-terrain-preview', status: 'idle', snapshot: null, previewKey: null, previewDirty: true, metadata: null });
        Object.entries(nextConfig).forEach(([key, value]) => {
            if (key === 'macro' || key === 'hydrology' || key === 'preview') {
                Object.entries(value).forEach(([childKey, childValue]) => {
                    store.dispatch({ type: 'set-terrain-generator-config', path: [key, childKey], value: childValue });
                });
                return;
            }
            store.dispatch({ type: 'set-terrain-generator-config', path: [key], value });
        });
    }

    function markDirty() {
        store.dispatch({ type: 'mark-terrain-preview-dirty', status: 'idle' });
    }

    const previewBadge = terrainLab.previewStatus === 'generating' ? 'PREVIEWING' : terrainLab.previewDirty ? 'STALE' : 'READY';

    return (
        <Panel title="Terrain Lab" badge={<Badge className="ml-auto">{previewBadge}</Badge>}>
            <div className="editor-form-stack">
                <HintCard>
                    {isTerrainRegion(selectedEntity)
                        ? 'Editing the selected terrain region. Apply writes these settings back to that rectangle.'
                        : 'Editing the default terrain template. New terrain regions use this config when you create them.'}
                </HintCard>

                <SelectField
                    label="Preset"
                    value={config.preset}
                    options={[
                        { value: 'balanced', label: 'Balanced' },
                        { value: 'alpine', label: 'Alpine' },
                        { value: 'coastal', label: 'Coastal' },
                        { value: 'cinematic', label: 'Cinematic' }
                    ]}
                    onChange={(value) => applyPreset(value)}
                />
                <RangeNumberField label="Seed" value={config.seed} min={1} max={999999} step={1} onChange={(value) => setConfig(['seed'], Math.round(value))} />

                <Separator />
                <SectionHeading>Macro</SectionHeading>
                <RangeNumberField label="Sea/Land Bias" value={config.macro.baseOffset} min={-200} max={200} step={5} onChange={(value) => setConfig(['macro', 'baseOffset'], value)} />
                <RangeNumberField label="Land Lift" value={config.macro.continentalAmplitude} min={40} max={320} step={5} onChange={(value) => setConfig(['macro', 'continentalAmplitude'], value)} />
                <RangeNumberField label="Mountain Height" value={config.macro.ridgeAmplitude} min={120} max={1400} step={10} onChange={(value) => setConfig(['macro', 'ridgeAmplitude'], value)} />
                <RangeNumberField label="Mountain Spread" value={config.macro.foothillAmplitude} min={0} max={300} step={5} onChange={(value) => setConfig(['macro', 'foothillAmplitude'], value)} />
                <RangeNumberField label="Valley Cut" value={config.macro.valleyAmplitude} min={0} max={220} step={5} onChange={(value) => setConfig(['macro', 'valleyAmplitude'], value)} />
                <RangeNumberField label="Range Twist" value={config.macro.warpAmplitude} min={0} max={5000} step={50} onChange={(value) => setConfig(['macro', 'warpAmplitude'], value)} />
                <RangeNumberField label="Range Count" value={config.macro.rangeCount} min={1} max={10} step={1} onChange={(value) => setConfig(['macro', 'rangeCount'], Math.round(value))} />
                <RangeNumberField label="Range Length" value={config.macro.rangeLength} min={0.15} max={1} step={0.01} onChange={(value) => setConfig(['macro', 'rangeLength'], value)} />
                <RangeNumberField label="Range Width" value={config.macro.rangeWidth} min={0.15} max={1} step={0.01} onChange={(value) => setConfig(['macro', 'rangeWidth'], value)} />
                <RangeNumberField label="Uplift Strength" value={config.macro.upliftStrength} min={0} max={1.2} step={0.02} onChange={(value) => setConfig(['macro', 'upliftStrength'], value)} />
                <RangeNumberField label="Massif Strength" value={config.macro.massifStrength} min={0} max={1.2} step={0.02} onChange={(value) => setConfig(['macro', 'massifStrength'], value)} />
                <RangeNumberField label="Escarpment Strength" value={config.macro.escarpmentStrength} min={0} max={1.2} step={0.02} onChange={(value) => setConfig(['macro', 'escarpmentStrength'], value)} />
                <RangeNumberField label="Plateau Height" value={config.macro.plateauHeight} min={0} max={420} step={5} onChange={(value) => setConfig(['macro', 'plateauHeight'], value)} />
                <RangeNumberField label="Summit Sharpness" value={config.macro.summitSharpness} min={0} max={1} step={0.02} onChange={(value) => setConfig(['macro', 'summitSharpness'], value)} />

                <HintCard>
                    <p>For taller mountain ranges, raise Mountain Height and Land Lift together.</p>
                    <p>For deeper carving, raise Valley Cut. Lowering it makes the terrain smoother.</p>
                    <p>For broader ranges, raise Mountain Spread, Range Length, and Range Width together.</p>
                    <p>Current preset: {(TERRAIN_GENERATOR_PRESETS[config.preset] || TERRAIN_GENERATOR_PRESETS.balanced).preset}</p>
                </HintCard>

                {mountainDiagnosis.length > 0 ? (
                    <HintCard tone="danger">
                        {mountainDiagnosis.map((message, index) => <p key={`diag-${index}`}>{message}</p>)}
                    </HintCard>
                ) : null}

                <Separator />
                <SectionHeading>Landforms</SectionHeading>
                <RangeNumberField label="Glacial Valleys" value={config.landforms.glacialValleyStrength} min={0} max={1} step={0.02} onChange={(value) => setConfig(['landforms', 'glacialValleyStrength'], value)} />
                <RangeNumberField label="Canyon Depth" value={config.landforms.canyonDepth} min={0} max={1} step={0.02} onChange={(value) => setConfig(['landforms', 'canyonDepth'], value)} />
                <RangeNumberField label="Canyon Width" value={config.landforms.canyonWidth} min={0.15} max={1} step={0.02} onChange={(value) => setConfig(['landforms', 'canyonWidth'], value)} />
                <RangeNumberField label="Basin Depth" value={config.landforms.basinDepth} min={0} max={1} step={0.02} onChange={(value) => setConfig(['landforms', 'basinDepth'], value)} />
                <RangeNumberField label="Basin Breadth" value={config.landforms.basinBreadth} min={0.15} max={1} step={0.02} onChange={(value) => setConfig(['landforms', 'basinBreadth'], value)} />

                <Separator />
                <SectionHeading>Hydrology</SectionHeading>
                <RangeNumberField label="River Count" value={config.hydrology.riverCount} min={0} max={32} step={1} onChange={(value) => setConfig(['hydrology', 'riverCount'], Math.round(value))} />
                <RangeNumberField label="River Strength" value={config.hydrology.riverStrength} min={0} max={2.5} step={0.05} onChange={(value) => setConfig(['hydrology', 'riverStrength'], value)} />
                <RangeNumberField label="Lake Count" value={config.hydrology.lakeCount} min={0} max={16} step={1} onChange={(value) => setConfig(['hydrology', 'lakeCount'], Math.round(value))} />
                <RangeNumberField label="Lake Strength" value={config.hydrology.lakeStrength} min={0} max={2} step={0.05} onChange={(value) => setConfig(['hydrology', 'lakeStrength'], value)} />
                <RangeNumberField label="Erosion" value={config.hydrology.erosionStrength} min={0} max={2} step={0.05} onChange={(value) => setConfig(['hydrology', 'erosionStrength'], value)} />
                <RangeNumberField label="Gorge Strength" value={config.hydrology.gorgeStrength} min={0} max={1.2} step={0.02} onChange={(value) => setConfig(['hydrology', 'gorgeStrength'], value)} />
                <RangeNumberField label="Incision Bias" value={config.hydrology.incisionBias} min={0} max={1} step={0.02} onChange={(value) => setConfig(['hydrology', 'incisionBias'], value)} />
                <RangeNumberField label="Floodplain Width" value={config.hydrology.floodplainWidth} min={0} max={1} step={0.02} onChange={(value) => setConfig(['hydrology', 'floodplainWidth'], value)} />

                <Separator />
                <SectionHeading>Preview</SectionHeading>
                <SelectField
                    label="Overlay"
                    value={terrainLab.selectedOverlay}
                    options={TERRAIN_PREVIEW_OVERLAYS.map((value) => ({
                        value,
                        label: value === 'height' ? 'Height Tint' : `${value[0].toUpperCase()}${value.slice(1)}`
                    }))}
                    onChange={(value) => {
                        setConfig(['preview', 'overlay'], value);
                        markDirty();
                    }}
                />
                <RangeNumberField label="Resolution" value={config.preview.resolution} min={32} max={192} step={8} onChange={(value) => setConfig(['preview', 'resolution'], Math.round(value))} />
                <CheckboxField
                    label="Contours"
                    checked={config.preview.showContours === true}
                    onCheckedChange={(checked) => setConfig(['preview', 'showContours'], checked)}
                />
                <HintCard>
                    <p>Rivers: {metrics.riverCount}</p>
                    <p>Lakes: {metrics.lakeCount}</p>
                    <p>Peak relief: {Math.round(metrics.summary?.peakRelief || 0)}m</p>
                    <p>Cliff coverage: {Math.round((metrics.summary?.cliffCoverage || 0) * 100)}%</p>
                    <p>Gorge coverage: {Math.round((metrics.summary?.gorgeCoverage || 0) * 100)}%</p>
                </HintCard>

                <div className="editor-inline-actions">
                    <Button type="button" variant="secondary" onClick={() => markDirty()} data-testid="terrain-lab-regenerate">Regenerate Preview</Button>
                    <Button
                        type="button"
                        variant="accent"
                        onClick={() => {
                            store.dispatch({ type: 'apply-terrain-generator' });
                            store.dispatch({
                                type: 'set-toast',
                                toast: {
                                    message: isTerrainRegion(selectedEntity)
                                        ? 'Terrain region updated. Save to persist and rebuild world for the offline bake.'
                                        : 'Terrain template updated. Save to persist and rebuild world for the offline bake.',
                                    tone: 'success',
                                    timestamp: Date.now()
                                }
                            });
                        }}
                        data-testid="terrain-lab-apply"
                    >
                        {isTerrainRegion(selectedEntity) ? 'Apply to Region' : 'Apply Template'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => store.dispatch({ type: 'reset-terrain-generator' })} data-testid="terrain-lab-reset">Reset to Saved</Button>
                    <Button type="button" variant="secondary" onClick={() => controller.frameTerrainHydrology()} data-testid="terrain-lab-frame">Frame Rivers/Lakes</Button>
                </div>
            </div>
        </Panel>
    );
}
