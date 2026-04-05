import * as React from 'react';

import { DEFAULT_CAMERA_STATE } from './cameraState';
import { fetchModelViewerAssetDetail, fetchModelViewerCatalog, fetchModelViewerJob, startBakeImpostorJob, startDiagnosticsJob, startInspectImpostorJob, startProcessAssetJob } from './api';
import type { ModelViewerCameraState, ModelViewerDraftState, ModelViewerJob, ModelViewerPreviewRepresentation, ModelViewerPreviewState, WorldAssetCatalogEntry, WorldAssetDetail } from './types';
import { ModelPreviewScene } from './previewScene';
import { Badge } from '../ui/components/ui/badge';
import { Button } from '../ui/components/ui/button';
import { Input } from '../ui/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/components/ui/select';
import { Toggle } from '../ui/components/ui/toggle';
import { CheckboxField, DockIntro, FieldRow, HintCard, NumberInputField, Panel, SectionHeading, SpinnerIcon, formatControlValue } from '../ui/common';

const DEFAULT_PREVIEW_STATE: ModelViewerPreviewState = {
    representation: 'decimated',
    ...DEFAULT_CAMERA_STATE,
    sunYaw: -40,
    sunPitch: 34,
    showGround: true
};

type SecondaryTab = 'artifacts' | 'logs';

function formatBytes(bytes: number | null) {
    if (!Number.isFinite(bytes || 0)) return 'n/a';
    const value = Number(bytes);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: number | null) {
    if (!Number.isFinite(value || 0)) return 'n/a';
    return new Date(Number(value)).toLocaleString();
}

function formatTriangles(value: number | null | undefined) {
    if (value == null || !Number.isFinite(value)) return 'n/a';
    return `${Math.round(value).toLocaleString()} tris`;
}

function previewModeLabel(representation: ModelViewerPreviewRepresentation) {
    if (representation === 'impostor') return 'Impostor';
    if (representation === 'sideBySide') return 'Comparison';
    return 'Mesh';
}

function createDraftState(detail: WorldAssetDetail): ModelViewerDraftState {
    return {
        targetTriangles: Number(detail.preset.targetTriangles) || 0,
        targetHeightMeters: Number(detail.targetHeightMeters) || 0,
        sizeBudgetBytes: Number(detail.preset.sizeBudgetBytes) || 0,
        joinMeshes: detail.preset.joinMeshes === true,
        cleanupLooseGeometry: detail.preset.cleanupLooseGeometry !== false,
        preserveUVs: detail.preset.preserveUVs !== false,
        decimateMethod: String(detail.preset.decimateMethod || 'COLLAPSE'),
        stage: false,
        impostorGridSize: Number(detail.preset.impostorBake?.gridSize) || 4,
        impostorFrameSize: Number(detail.preset.impostorBake?.frameSize) || 256,
        impostorOutputDir: String(detail.preset.impostorBake?.outputDir || '')
    };
}

function representationOptions(detail: WorldAssetDetail | null) {
    if (!detail) return [];
    const options: Array<{ value: ModelViewerPreviewRepresentation; label: string; disabled: boolean }> = [
        { value: 'source', label: 'Source', disabled: !detail.files.source.exists || !detail.files.source.urlPath },
        { value: 'decimated', label: 'Decimated', disabled: !detail.files.decimated.exists || !detail.files.decimated.urlPath },
        { value: 'gameReady', label: 'Staged', disabled: !detail.files.gameReady.exists || !detail.files.gameReady.urlPath },
        { value: 'impostor', label: 'Impostor', disabled: !detail.files.impostor?.metadata.exists },
        { value: 'sideBySide', label: 'Side by side', disabled: !detail.files.impostor?.metadata.exists || !detail.files.decimated.exists }
    ];
    return options;
}

function PreviewViewport({
    detail,
    previewState,
    onCameraChange,
    onPreviewReadyChange,
    onResetView,
    onFitModel
}: {
    detail: WorldAssetDetail | null;
    previewState: ModelViewerPreviewState;
    onCameraChange: (cameraState: ModelViewerCameraState) => void;
    onPreviewReadyChange: (ready: boolean) => void;
    onResetView: (scene: ModelPreviewScene) => void;
    onFitModel: (scene: ModelPreviewScene) => void;
}) {
    const viewportRef = React.useRef<HTMLDivElement | null>(null);
    const sceneRef = React.useRef<ModelPreviewScene | null>(null);
    const [previewError, setPreviewError] = React.useState<string | null>(null);
    const [previewReady, setPreviewReady] = React.useState(false);

    React.useEffect(() => {
        if (!viewportRef.current) return;
        let scene: ModelPreviewScene | null = null;
        try {
            scene = new ModelPreviewScene(viewportRef.current, {
                onCameraChange,
                quality: typeof navigator !== 'undefined' && navigator.webdriver ? 'test' : 'interactive'
            });
            sceneRef.current = scene;
            setPreviewError(null);
            setPreviewReady(false);
            onPreviewReadyChange(false);
        } catch (error) {
            setPreviewError(error instanceof Error ? error.message : 'Preview unavailable.');
            sceneRef.current = null;
            setPreviewReady(false);
            onPreviewReadyChange(false);
            return;
        }
        const onResize = () => scene?.resize();
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            scene?.dispose();
            sceneRef.current = null;
        };
    }, []);

    React.useEffect(() => {
        if (!sceneRef.current || !detail) return;
        let active = true;
        setPreviewError(null);
        setPreviewReady(false);
        onPreviewReadyChange(false);
        sceneRef.current.showAsset(detail, previewState)
            .then(() => {
                if (!active) return;
                setPreviewReady(true);
                onPreviewReadyChange(true);
            })
            .catch((error) => {
                if (!active) return;
                setPreviewError(error instanceof Error ? error.message : 'Preview unavailable.');
                setPreviewReady(false);
                onPreviewReadyChange(false);
            });
        return () => {
            active = false;
        };
    }, [detail, previewState.representation, onPreviewReadyChange]);

    React.useEffect(() => {
        sceneRef.current?.applyPreviewState(previewState);
    }, [previewState.cameraYaw, previewState.cameraPitch, previewState.cameraDistance, previewState.sunYaw, previewState.sunPitch, previewState.showGround]);

    return (
        <div ref={viewportRef} className="model-viewer-preview-stage" data-testid="model-viewer-preview" data-ready={previewReady && !previewError ? 'true' : 'false'}>
            <div className="pointer-events-none absolute left-4 top-4 z-[2] flex max-w-md flex-col gap-2">
                <div className="model-viewer-overlay-pill">
                    Click-drag to orbit. Scroll or pinch to zoom.
                </div>
                <div className="pointer-events-auto flex gap-2">
                    <Button type="button" variant="secondary" size="sm" className="model-viewer-overlay-button" onClick={() => sceneRef.current && onResetView(sceneRef.current)} data-testid="model-viewer-reset-view">
                        Reset View
                    </Button>
                    <Button type="button" variant="secondary" size="sm" className="model-viewer-overlay-button" onClick={() => sceneRef.current && onFitModel(sceneRef.current)} data-testid="model-viewer-fit-model">
                        Fit Model
                    </Button>
                </div>
            </div>
            <div className="pointer-events-none absolute right-4 top-4 z-[2]">
                <div className="model-viewer-scene-status" data-testid="model-viewer-scene-status">
                    <span>{previewModeLabel(previewState.representation)}</span>
                    <span>{previewState.representation === 'sideBySide' ? 'Mesh + impostor' : previewState.representation}</span>
                    <span>{previewReady ? 'Ready' : (previewError ? 'Error' : 'Loading')}</span>
                </div>
            </div>
            {previewError ? (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[color:var(--text-dim)]">
                    <div className="max-w-sm rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                        <div className="font-semibold text-[color:var(--text)]">Preview unavailable</div>
                        <div className="mt-2">{previewError}</div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function AssetList({
    assets,
    selectedAssetName,
    search,
    onSearchChange,
    onSelect
}: {
    assets: WorldAssetCatalogEntry[];
    selectedAssetName: string | null;
    search: string;
    onSearchChange: (value: string) => void;
    onSelect: (assetName: string) => void;
}) {
    const normalized = search.trim().toLowerCase();
    const filteredAssets = assets.filter((asset) => {
        if (!normalized) return true;
        return asset.assetName.toLowerCase().includes(normalized) || asset.category.toLowerCase().includes(normalized);
    });
    const grouped = filteredAssets.reduce((acc, asset) => {
        const key = asset.category || 'uncategorized';
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key)?.push(asset);
        return acc;
    }, new Map<string, WorldAssetCatalogEntry[]>());

    return (
        <Panel title="Asset Catalog" copy="Preset-backed asset browser for source, decimated, staged, and impostor resources." testId="model-viewer-catalog">
            <Input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search models"
                data-testid="model-viewer-search"
            />
            <div className="model-viewer-catalog-scroll">
                {Array.from(grouped.entries()).map(([category, entries]) => (
                    <div key={category} className="flex flex-col gap-2">
                        <SectionHeading>{category}</SectionHeading>
                        <div className="flex flex-col gap-2">
                            {entries.map((asset) => (
                                <button
                                    key={asset.assetName}
                                    type="button"
                                    className={`model-viewer-asset-row ${asset.assetName === selectedAssetName ? 'is-active' : ''}`}
                                    onClick={() => onSelect(asset.assetName)}
                                    data-testid={`model-viewer-asset-${asset.assetName}`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="font-semibold text-[color:var(--text)]">{asset.assetName}</div>
                                        {asset.hasImpostorBake ? <Badge>Impostor</Badge> : <Badge variant="outline">Mesh</Badge>}
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--text-dim)]">
                                        <span>{formatBytes(asset.files?.decimated?.sizeBytes ?? null)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </Panel>
    );
}

function FileStatusGrid({ detail }: { detail: WorldAssetDetail }) {
    const rows = [
        ['Source', detail.files.source],
        ['Decimated', detail.files.decimated],
        ['Staged', detail.files.gameReady],
        ['Report', detail.files.report],
        ['Impostor Metadata', detail.files.impostor?.metadata || null],
        ['Impostor Albedo', detail.files.impostor?.albedo || null],
        ['Impostor Normal', detail.files.impostor?.normal || null],
        ['Impostor Depth', detail.files.impostor?.depth || null]
    ] as const;
    return (
        <div className="model-viewer-file-grid">
            {rows.map(([label, file]) => (
                <div key={label} className="model-viewer-file-card">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--text-dim)]">{label}</div>
                        <Badge variant={file?.exists ? 'default' : 'outline'}>{file?.exists ? 'Ready' : 'Missing'}</Badge>
                    </div>
                    <div className="text-sm text-[color:var(--text)]">{file?.repoRelativePath || 'n/a'}</div>
                    <div className="text-xs text-[color:var(--text-dim)]">{formatBytes(file?.sizeBytes ?? null)} • {formatDate(file?.mtimeMs ?? null)}</div>
                </div>
            ))}
        </div>
    );
}

function ArtifactsPanel({ job }: { job: ModelViewerJob | null }) {
    if (!job) {
        return <HintCard tone="info">Run inspect or diagnostics jobs to populate reusable artifact links here.</HintCard>;
    }
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[color:var(--text)]">{job.label}</div>
                <Badge>{job.status}</Badge>
            </div>
            {job.artifacts?.outputDir ? (
                <a href={job.artifacts.outputDir} target="_blank" rel="noreferrer" className="text-sm text-[color:var(--accent-strong)] underline-offset-4 hover:underline">
                    Open artifact folder
                </a>
            ) : null}
            <div className="flex flex-col gap-2">
                {(job.artifacts?.files || []).map((artifact) => (
                    <a
                        key={artifact.urlPath}
                        href={artifact.urlPath}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-[color:var(--text)] hover:bg-white/[0.05]"
                    >
                        {artifact.urlPath}
                    </a>
                ))}
            </div>
        </div>
    );
}

function MetadataRows({ rows, testId }: { rows: Array<[string, string]>; testId?: string }) {
    return (
        <div className="model-viewer-metadata-grid" data-testid={testId}>
            {rows.map(([label, value]) => (
                <React.Fragment key={label}>
                    <div className="model-viewer-metadata-label">{label}</div>
                    <div className="model-viewer-metadata-value">{value}</div>
                </React.Fragment>
            ))}
        </div>
    );
}

export function ModelViewerApp() {
    const [catalog, setCatalog] = React.useState<WorldAssetCatalogEntry[]>([]);
    const [selectedAssetName, setSelectedAssetName] = React.useState<string | null>(null);
    const [detail, setDetail] = React.useState<WorldAssetDetail | null>(null);
    const [draft, setDraft] = React.useState<ModelViewerDraftState | null>(null);
    const [previewState, setPreviewState] = React.useState<ModelViewerPreviewState>(DEFAULT_PREVIEW_STATE);
    const [search, setSearch] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [jobsById, setJobsById] = React.useState<Record<string, ModelViewerJob>>({});
    const [activeJobId, setActiveJobId] = React.useState<string | null>(null);
    const [secondaryTab, setSecondaryTab] = React.useState<SecondaryTab>('artifacts');
    const [previewReady, setPreviewReady] = React.useState(false);

    const activeJob = activeJobId ? jobsById[activeJobId] || null : null;

    const loadCatalog = React.useCallback(async () => {
        const response = await fetchModelViewerCatalog();
        setCatalog(response.assets);
        if (!selectedAssetName && response.assets.length > 0) {
            setSelectedAssetName(response.assets[0].assetName);
        }
    }, [selectedAssetName]);

    const loadDetail = React.useCallback(async (assetName: string) => {
        const nextDetail = await fetchModelViewerAssetDetail(assetName);
        setDetail(nextDetail);
        setDraft(createDraftState(nextDetail));
        const options = representationOptions(nextDetail);
        if (!options.some((option) => option.value === previewState.representation && !option.disabled)) {
            const fallback = options.find((option) => !option.disabled);
            setPreviewState((current) => ({
                ...current,
                representation: fallback?.value || 'decimated'
            }));
        }
        return nextDetail;
    }, [previewState.representation]);

    React.useEffect(() => {
        let active = true;
        setLoading(true);
        loadCatalog()
            .catch((nextError) => {
                if (!active) return;
                setError(nextError instanceof Error ? nextError.message : String(nextError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [loadCatalog]);

    React.useEffect(() => {
        if (!selectedAssetName) return;
        let active = true;
        setLoading(true);
        setPreviewReady(false);
        loadDetail(selectedAssetName)
            .catch((nextError) => {
                if (!active) return;
                setError(nextError instanceof Error ? nextError.message : String(nextError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [loadDetail, selectedAssetName]);

    React.useEffect(() => {
        const eventSource = new EventSource('/events');
        const listener = (event: MessageEvent<string>) => {
            try {
                const payload = JSON.parse(event.data) as ModelViewerJob & { jobId?: string };
                const jobId = payload.jobId || payload.id;
                if (!jobId) return;
                setJobsById((current) => ({
                    ...current,
                    [jobId]: {
                        ...(current[jobId] || {}),
                        ...payload,
                        id: jobId
                    }
                }));
                if (!activeJobId) setActiveJobId(jobId);
                if ((payload.status === 'completed' || payload.status === 'failed') && payload.assetName === selectedAssetName && (payload.jobType === 'process-asset' || payload.jobType === 'bake-impostor')) {
                    loadCatalog().catch(() => {});
                    loadDetail(payload.assetName).catch(() => {});
                }
            } catch (nextError) {
                console.error('[ModelViewer] Failed to parse SSE payload', nextError);
            }
        };
        eventSource.addEventListener('model-viewer-job-progress', listener as EventListener);
        return () => {
            eventSource.close();
        };
    }, [activeJobId, loadCatalog, loadDetail, selectedAssetName]);

    const startJob = React.useCallback(async (runner: () => Promise<{ jobId: string }>) => {
        const response = await runner();
        setActiveJobId(response.jobId);
        const job = await fetchModelViewerJob(response.jobId);
        setJobsById((current) => ({ ...current, [job.id]: job }));
    }, []);

    const options = representationOptions(detail);
    const dedicatedImpostorLabUrl = detail?.files.impostor?.baseDir.urlPath && detail.files.decimated.urlPath
        ? `/tree-impostor-viewer.html?asset=${encodeURIComponent(detail.assetName)}&modelUrl=${encodeURIComponent(detail.files.decimated.urlPath)}&impostorBaseUrl=${encodeURIComponent(detail.files.impostor.baseDir.urlPath)}`
        : null;

    return (
        <div className="model-viewer-shell">
            <div className="editor-topbar">
                <div className="editor-topbar-title">
                    <div className="editor-section-title">Developer Model Viewer</div>
                    <p className="editor-panel-copy">Inspect preset-backed world assets, compare meshes and impostors, and launch explicit asset-processing diagnostics.</p>
                </div>
                <div className="editor-topbar-status">
                    {selectedAssetName ? <Badge>{selectedAssetName}</Badge> : null}
                    {detail?.category ? <Badge variant="outline">{detail.category}</Badge> : null}
                    {detail?.files.impostor?.metadata.exists ? <Badge>Impostor Ready</Badge> : <Badge variant="outline">Mesh only</Badge>}
                </div>
            </div>

            <div className="model-viewer-workspace">
                <aside className="editor-dock editor-left-dock">
                    <AssetList
                        assets={catalog}
                        selectedAssetName={selectedAssetName}
                        search={search}
                        onSearchChange={setSearch}
                        onSelect={setSelectedAssetName}
                    />
                </aside>

                <main className="model-viewer-main" data-testid="model-viewer-main-scroll">
                    <Panel title="Preview" copy="Compare source, decimated, staged, and impostor representations." className="shrink-0">
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                            <PreviewViewport
                                detail={detail}
                                previewState={previewState}
                                onCameraChange={(cameraState) => {
                                    setPreviewState((current) => (
                                        current.cameraYaw === cameraState.cameraYaw
                                        && current.cameraPitch === cameraState.cameraPitch
                                        && current.cameraDistance === cameraState.cameraDistance
                                            ? current
                                            : {
                                                ...current,
                                                ...cameraState
                                            }
                                    ));
                                }}
                                onResetView={(scene) => {
                                    scene.resetView();
                                    setPreviewState((current) => ({
                                        ...current,
                                        ...scene.getCameraState()
                                    }));
                                }}
                                onFitModel={(scene) => {
                                    scene.fitCurrentAsset();
                                    setPreviewState((current) => ({
                                        ...current,
                                        ...scene.getCameraState()
                                    }));
                                }}
                                onPreviewReadyChange={setPreviewReady}
                            />
                            <div className="model-viewer-scene-controls">
                                <div className="model-viewer-scene-card">
                                    <div className="model-viewer-scene-card-label">Scene</div>
                                    <div className="model-viewer-scene-summary">
                                        <span>{previewModeLabel(previewState.representation)}</span>
                                        <span>{previewReady ? 'Preview ready' : (loading ? 'Loading asset' : 'Preparing preview')}</span>
                                    </div>
                                </div>
                                <FieldRow label="Representation" value={previewState.representation}>
                                    <div className="grid grid-cols-2 gap-2">
                                        {options.map((option) => (
                                            <Toggle
                                                key={option.value}
                                                pressed={previewState.representation === option.value}
                                                disabled={option.disabled}
                                                onPressedChange={() => setPreviewState((current) => ({ ...current, representation: option.value }))}
                                                data-testid={`model-viewer-representation-${option.value}`}
                                            >
                                                {option.label}
                                            </Toggle>
                                        ))}
                                    </div>
                                </FieldRow>
                                <div className="model-viewer-scene-card">
                                    <div className="model-viewer-scene-card-label">Lighting</div>
                                    <FieldRow label="Sun Yaw" value={formatControlValue(previewState.sunYaw)}>
                                        <input type="range" min={-180} max={180} value={previewState.sunYaw} onChange={(event) => setPreviewState((current) => ({ ...current, sunYaw: Number(event.target.value) }))} />
                                    </FieldRow>
                                    <FieldRow label="Sun Pitch" value={formatControlValue(previewState.sunPitch)}>
                                        <input type="range" min={0} max={89} value={previewState.sunPitch} onChange={(event) => setPreviewState((current) => ({ ...current, sunPitch: Number(event.target.value) }))} />
                                    </FieldRow>
                                    <CheckboxField
                                        label="Show ground plane"
                                        checked={previewState.showGround}
                                        onCheckedChange={(checked) => setPreviewState((current) => ({ ...current, showGround: checked }))}
                                    />
                                </div>
                                {dedicatedImpostorLabUrl ? (
                                    <a href={dedicatedImpostorLabUrl} target="_blank" rel="noreferrer" className="text-sm text-[color:var(--accent-strong)] underline-offset-4 hover:underline">
                                        Open dedicated impostor lab
                                    </a>
                                ) : null}
                            </div>
                        </div>
                    </Panel>

                    <Panel title="Diagnostics" copy="Inspection outputs and process logs from the shared developer tooling." className="min-h-[280px]">
                        <div className="model-viewer-tab-strip" data-testid="model-viewer-secondary-tabs">
                            <Button
                                type="button"
                                variant={secondaryTab === 'artifacts' ? 'accent' : 'ghost'}
                                size="sm"
                                onClick={() => setSecondaryTab('artifacts')}
                                data-testid="model-viewer-tab-artifacts"
                            >
                                Artifacts
                            </Button>
                            <Button
                                type="button"
                                variant={secondaryTab === 'logs' ? 'accent' : 'ghost'}
                                size="sm"
                                onClick={() => setSecondaryTab('logs')}
                                data-testid="model-viewer-tab-logs"
                            >
                                Job Logs
                            </Button>
                        </div>
                        {secondaryTab === 'artifacts' ? (
                            <div data-testid="model-viewer-tab-panel-artifacts">
                                <ArtifactsPanel job={activeJob} />
                            </div>
                        ) : (
                            <div data-testid="model-viewer-tab-panel-logs">
                                <pre className="model-viewer-log-pane" data-testid="model-viewer-job-logs">
                                    {activeJob?.logs?.join('\n') || 'No job output yet.'}
                                </pre>
                            </div>
                        )}
                    </Panel>
                </main>

                <aside className="editor-dock editor-right-dock" data-testid="model-viewer-inspector-scroll">
                    {loading ? (
                        <HintCard tone="info"><SpinnerIcon className="inline-flex mr-2" />Loading asset details…</HintCard>
                    ) : null}
                    {error ? <HintCard tone="danger">{error}</HintCard> : null}
                    {detail && draft ? (
                        <>
                            <Panel title="Asset Metadata" copy="Resolved preset fields, target heights, derived files, and baked impostor metadata.">
                                <DockIntro title={detail.assetName} copy={`Category: ${detail.category || 'uncategorized'}`} />
                                <SectionHeading>Overview</SectionHeading>
                                <MetadataRows
                                    testId="model-viewer-metadata-overview"
                                    rows={[
                                        ['Target triangles', formatTriangles(Number(detail.preset.targetTriangles) || null)],
                                        ['Target height', `${formatControlValue(detail.targetHeightMeters)} m`],
                                        ['Size budget', formatBytes(Number(detail.preset.sizeBudgetBytes) || 0)],
                                        ['Decimate method', String(detail.preset.decimateMethod || 'COLLAPSE')]
                                    ]}
                                />
                                <SectionHeading>Measured Geometry</SectionHeading>
                                <MetadataRows
                                    testId="model-viewer-metadata-measured"
                                    rows={[
                                        ['Source triangles', formatTriangles(detail.measuredTriangles.source)],
                                        ['Decimated triangles', formatTriangles(detail.measuredTriangles.decimated)],
                                        ['Staged triangles', formatTriangles(detail.measuredTriangles.gameReady)]
                                    ]}
                                />
                                <SectionHeading>Impostor Data</SectionHeading>
                                <MetadataRows
                                    testId="model-viewer-metadata-impostor"
                                    rows={[
                                        ['Blend mode', detail.impostorMetadata?.viewBlendMode || 'not configured'],
                                        ['Frame count', detail.impostorMetadata?.frameCount ? String(detail.impostorMetadata.frameCount) : 'n/a'],
                                        ['Frame bands', Array.isArray(detail.impostorMetadata?.frameBands) ? detail.impostorMetadata.frameBands.join(', ') : 'n/a']
                                    ]}
                                />
                                <SectionHeading>Derived Files</SectionHeading>
                                <FileStatusGrid detail={detail} />
                            </Panel>

                            <Panel title="Draft Parameters" copy="These edits stay local to the workbench until you launch an explicit process or bake job.">
                                <div className="editor-form-stack">
                                    <NumberInputField label="Target Triangles" value={draft.targetTriangles} onChange={(event) => setDraft((current) => current ? { ...current, targetTriangles: Number(event.target.value) } : current)} />
                                    <NumberInputField label="Target Height (m)" value={draft.targetHeightMeters} onChange={(event) => setDraft((current) => current ? { ...current, targetHeightMeters: Number(event.target.value) } : current)} />
                                    <NumberInputField label="Size Budget Bytes" value={draft.sizeBudgetBytes} onChange={(event) => setDraft((current) => current ? { ...current, sizeBudgetBytes: Number(event.target.value) } : current)} />
                                    <FieldRow label="Decimate Method">
                                        <Select value={draft.decimateMethod} onValueChange={(value) => setDraft((current) => current ? { ...current, decimateMethod: value } : current)}>
                                            <SelectTrigger data-testid="model-viewer-decimate-method"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="COLLAPSE">COLLAPSE</SelectItem>
                                                <SelectItem value="UNSUBDIV">UNSUBDIV</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FieldRow>
                                    <CheckboxField label="Join meshes" checked={draft.joinMeshes} onCheckedChange={(checked) => setDraft((current) => current ? { ...current, joinMeshes: checked } : current)} />
                                    <CheckboxField label="Cleanup loose geometry" checked={draft.cleanupLooseGeometry} onCheckedChange={(checked) => setDraft((current) => current ? { ...current, cleanupLooseGeometry: checked } : current)} />
                                    <CheckboxField label="Preserve UVs" checked={draft.preserveUVs} onCheckedChange={(checked) => setDraft((current) => current ? { ...current, preserveUVs: checked } : current)} />
                                    <CheckboxField label="Stage to game-ready output after processing" checked={draft.stage} onCheckedChange={(checked) => setDraft((current) => current ? { ...current, stage: checked } : current)} />
                                    {detail.preset.impostorBake?.enabled ? (
                                        <>
                                            <SeparatorBlock />
                                            <NumberInputField label="Impostor Grid Size" value={draft.impostorGridSize} onChange={(event) => setDraft((current) => current ? { ...current, impostorGridSize: Number(event.target.value) } : current)} />
                                            <NumberInputField label="Impostor Frame Size" value={draft.impostorFrameSize} onChange={(event) => setDraft((current) => current ? { ...current, impostorFrameSize: Number(event.target.value) } : current)} />
                                            <FieldRow label="Impostor Output Dir">
                                                <Input value={draft.impostorOutputDir} onChange={(event) => setDraft((current) => current ? { ...current, impostorOutputDir: event.target.value } : current)} data-testid="model-viewer-impostor-output-dir" />
                                            </FieldRow>
                                        </>
                                    ) : (
                                        <HintCard tone="info">This asset does not declare `impostorBake.enabled`, so impostor draft fields and actions are disabled.</HintCard>
                                    )}
                                </div>
                            </Panel>

                            <Panel title="Actions" copy="Explicit developer actions only. No preset files are rewritten by this workbench.">
                                <div className="editor-inline-actions">
                                    <Button variant="accent" onClick={() => startJob(() => startProcessAssetJob(detail.assetName, draft))} data-testid="model-viewer-process-button">
                                        Process Asset
                                    </Button>
                                    <Button
                                        variant="default"
                                        disabled={!detail.preset.impostorBake?.enabled}
                                        onClick={() => startJob(() => startBakeImpostorJob(detail.assetName, draft))}
                                        data-testid="model-viewer-bake-button"
                                    >
                                        Bake Impostor
                                    </Button>
                                    <Button
                                        variant="default"
                                        disabled={!detail.preset.impostorBake?.enabled}
                                        onClick={() => startJob(() => startInspectImpostorJob(detail.assetName))}
                                        data-testid="model-viewer-inspect-button"
                                    >
                                        Inspect Impostor
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        disabled={!detail.preset.impostorBake?.enabled}
                                        onClick={() => startJob(() => startDiagnosticsJob(detail.assetName, ['selector_cardinals', 'selector_stability', 'selector_seam_probe', 'selector_silhouette_compare']))}
                                        data-testid="model-viewer-diagnostics-button"
                                    >
                                        Run Diagnostics
                                    </Button>
                                </div>
                            </Panel>
                        </>
                    ) : null}
                </aside>
            </div>
        </div>
    );
}

function SeparatorBlock() {
    return <div className="h-px w-full bg-white/8" />;
}
