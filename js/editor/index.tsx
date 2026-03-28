import * as React from 'react';
import { flushSync } from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';

import { normalizeMapData } from '../modules/world/MapDataUtils.js';
import { createEditorCanvasController, type EditorCanvasController } from './canvas/controller.js';
import { createEditorDocument } from './core/document.js';
import { createEditorStore } from './core/store.js';
import type { EditorStore, EditorVantageData, EditorWorldData } from './core/types.js';
import { EditorApp } from './ui/app';

declare global {
    interface Window {
        __FSIM_EDITOR_E2E__?: boolean;
        __EDITOR_TEST__?: { store: EditorStore };
    }
}

type BuildProgressPayload = {
    status?: 'queued' | 'running' | 'completed' | 'failed';
    step?: number;
    total?: number;
    label?: string;
    jobId?: string | null;
    requestIds?: string[];
    error?: string;
};

type SaveResponsePayload = {
    rebuildJobId?: string | null;
    rebuildQueued?: boolean;
};

type RebuildResponsePayload = {
    rebuildJobId?: string | null;
    queued?: boolean;
};

type EditorAppController = {
    frameSelection(): void;
    frameTerrainHydrology(): void;
    resetView(): void;
};

const isEditorE2e = window.__FSIM_EDITOR_E2E__ === true;

function createRequestId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadInitialDocument() {
    const [worldResp, vantageResp] = await Promise.all([
        fetch('/tools/map.json'),
        fetch('/config/vantage_points.json')
    ]);
    if (!worldResp.ok || !vantageResp.ok) {
        throw new Error('Failed to load editor data');
    }
    const worldData = await worldResp.json() as EditorWorldData;
    const vantageData = await vantageResp.json() as EditorVantageData;
    normalizeMapData(worldData);
    return createEditorDocument(worldData, vantageData);
}

export async function initEditor(): Promise<void> {
    const rootElement = document.getElementById('editor-app');
    if (!rootElement) throw new Error('Missing #editor-app root');

    const initialDocument = await loadInitialDocument();
    const store = createEditorStore(initialDocument);
    const canvasRef: { current: HTMLCanvasElement | null } = { current: null };
    const coordsRef: { current: HTMLDivElement | null } = { current: null };

    if (isEditorE2e) {
        window.__EDITOR_TEST__ = { store };
    }

    let controller: EditorCanvasController | null = null;
    let activeSavePromise: Promise<boolean> | null = null;

    function setSaveProgress(step: number, total: number, label: string) {
        store.dispatch({
            type: 'set-save-progress',
            progress: {
                step,
                total,
                label
            }
        });
    }

    function handleBuildProgressEvent(event: MessageEvent<string>) {
        const payload = JSON.parse(event.data) as BuildProgressPayload;
        const state = store.getState();
        const trackedRequestId = state.ui.rebuildRequestId;
        const trackedJobId = state.ui.rebuildJobId;
        const eventRequestIds = Array.isArray(payload.requestIds) ? payload.requestIds : [];
        const matchesTrackedJob = Boolean(trackedJobId && payload.jobId === trackedJobId);
        const matchesTrackedRequest = Boolean(trackedRequestId && eventRequestIds.includes(trackedRequestId));
        if (!matchesTrackedJob && !matchesTrackedRequest) return;

        const nextProgress = payload.step !== undefined
            ? {
                step: payload.step,
                total: payload.total ?? state.ui.rebuildProgress?.total ?? 0,
                label: payload.label ?? state.ui.rebuildProgress?.label ?? ''
            }
            : state.ui.rebuildProgress;

        if (payload.status === 'queued' || payload.status === 'running') {
            store.dispatch({
                type: 'track-rebuild-job',
                value: payload.status,
                jobId: payload.jobId,
                requestId: trackedRequestId || payload.requestIds?.[0] || null,
                progress: nextProgress
            });
            return;
        }

        if (payload.status === 'completed') {
            store.dispatch({
                type: 'set-rebuild-state',
                value: 'completed',
                jobId: payload.jobId,
                requestId: trackedRequestId || payload.requestIds?.[0] || null,
                progress: nextProgress
            });
            return;
        }

        if (payload.status === 'failed') {
            store.dispatch({
                type: 'set-rebuild-state',
                value: 'error',
                error: payload.error || 'World rebuild failed',
                jobId: payload.jobId,
                requestId: trackedRequestId || payload.requestIds?.[0] || null,
                progress: nextProgress
            });
            store.dispatch({
                type: 'set-toast',
                toast: { message: `World rebuild failed: ${payload.error || 'Unknown error'}`, tone: 'error', timestamp: Date.now() }
            });
        }
    }

    if (!isEditorE2e) {
        const eventSource = new EventSource(`${window.location.origin}/events`);
        eventSource.addEventListener('editor-build-progress', handleBuildProgressEvent as EventListener);
        eventSource.onerror = (error) => {
            console.error('[Editor] Build progress stream error', error);
        };
        window.addEventListener('beforeunload', () => {
            eventSource.close();
        });
    }

    async function save(): Promise<boolean> {
        if (!store.getState().history.dirty) return true;
        if (activeSavePromise) return activeSavePromise;

        activeSavePromise = (async () => {
            const requestId = createRequestId('save');
            store.dispatch({ type: 'set-save-state', value: 'saving', error: '' });
            store.dispatch({
                type: 'track-rebuild-job',
                value: 'idle',
                requestId,
                jobId: null,
                progress: null,
                error: ''
            });
            try {
                setSaveProgress(1, 3, 'Preparing payload');
                const { mapPayload, vantagePayload } = store.serialize();

                setSaveProgress(2, 3, 'Uploading editor files');
                const mapSavePromise = fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: 'tools/map.json', content: mapPayload, requestId })
                });
                const vantageSavePromise = fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: 'config/vantage_points.json', content: vantagePayload })
                });

                const vantageResponse = await vantageSavePromise;
                if (!vantageResponse.ok) {
                    const message = await vantageResponse.text();
                    throw new Error(message || 'Save failed');
                }

                const mapResponse = await mapSavePromise;
                if (!mapResponse.ok) {
                    const message = await mapResponse.text();
                    throw new Error(message || 'Save failed');
                }
                const mapResult = await mapResponse.json() as SaveResponsePayload;

                if (mapResult.rebuildJobId) {
                    store.dispatch({
                        type: 'track-rebuild-job',
                        value: mapResult.rebuildQueued ? 'queued' : 'running',
                        requestId,
                        jobId: mapResult.rebuildJobId,
                        progress: mapResult.rebuildQueued
                            ? { step: 0, total: 4, label: 'Queued rebuild' }
                            : { step: 1, total: 4, label: 'Preparing rebuild' }
                    });
                }

                setSaveProgress(3, 3, 'Finishing save');
                store.dispatch({ type: 'mark-saved' });
                store.dispatch({ type: 'set-toast', toast: { message: 'Saved editor changes', tone: 'success', timestamp: Date.now() } });
                return true;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                store.dispatch({ type: 'set-save-state', value: 'error', error: message });
                store.dispatch({ type: 'set-toast', toast: { message: `Save failed: ${message}`, tone: 'error', timestamp: Date.now() } });
                return false;
            } finally {
                activeSavePromise = null;
            }
        })();

        return activeSavePromise;
    }

    async function rebuildWorld(): Promise<void> {
        if (store.getState().history.dirty) {
            const saved = await save();
            if (!saved) return;
            return;
        }
        const requestId = createRequestId('rebuild');
        store.dispatch({
            type: 'track-rebuild-job',
            value: 'queued',
            requestId,
            jobId: null,
            progress: { step: 0, total: 4, label: 'Queued rebuild' },
            error: ''
        });
        try {
            const response = await fetch(`/rebuild-world?requestId=${encodeURIComponent(requestId)}`, { method: 'POST' });
            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || 'Rebuild failed');
            }
            const rebuildResult = await response.json() as RebuildResponsePayload;
            store.dispatch({
                type: 'track-rebuild-job',
                value: rebuildResult.queued ? 'queued' : 'running',
                requestId,
                jobId: rebuildResult.rebuildJobId,
                progress: rebuildResult.queued
                    ? { step: 0, total: 4, label: 'Queued rebuild' }
                    : { step: 1, total: 4, label: 'Preparing rebuild' }
            });
            store.dispatch({ type: 'set-toast', toast: { message: 'World rebuild requested', tone: 'info', timestamp: Date.now() } });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            store.dispatch({ type: 'set-rebuild-state', value: 'error', error: message, requestId });
            store.dispatch({ type: 'set-toast', toast: { message: `Rebuild failed: ${message}`, tone: 'error', timestamp: Date.now() } });
        }
    }

    const root = ReactDOMClient.createRoot(rootElement);
    const appController: EditorAppController = {
        frameSelection() {
            controller?.frameSelection();
        },
        frameTerrainHydrology() {
            controller?.frameTerrainHydrology();
        },
        resetView() {
            controller?.resetView();
        }
    };

    flushSync(() => {
        root.render(
            <EditorApp
                store={store}
                canvasRef={(value) => { canvasRef.current = value; }}
                coordsRef={(value) => { coordsRef.current = value; }}
                onSave={save}
                onRebuild={rebuildWorld}
                controller={appController}
            />
        );
    });

    const canvas = canvasRef.current || document.getElementById('map-canvas');
    const coordsElement = coordsRef.current || document.getElementById('coords');
    if (!(canvas instanceof HTMLCanvasElement) || !(coordsElement instanceof HTMLElement)) {
        throw new Error('Editor canvas or coordinate readout failed to initialize');
    }

    controller = createEditorCanvasController({
        canvas,
        coordsElement,
        store
    });
    await controller.init();

    window.addEventListener('beforeunload', (event) => {
        if (!store.getState().history.dirty) return;
        event.preventDefault();
        event.returnValue = '';
    });
}
