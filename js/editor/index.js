import { React, ReactDOM, ReactDOMClient } from '../vendor/react-loader.js';
import { normalizeMapData } from '../modules/world/MapDataUtils.js';
import { createEditorCanvasController } from './canvas/controller.js';
import { createEditorDocument, resolveSelectionAfterReload } from './core/document.js';
import { createEditorStore } from './core/store.js';
import { EditorApp } from './ui/app.js';

const isEditorE2e = window.__FSIM_EDITOR_E2E__ === true;

async function loadInitialDocument() {
    const [worldResp, vantageResp] = await Promise.all([
        fetch('/tools/map.json'),
        fetch('/config/vantage_points.json')
    ]);
    if (!worldResp.ok || !vantageResp.ok) {
        throw new Error('Failed to load editor data');
    }
    const worldData = await worldResp.json();
    const vantageData = await vantageResp.json();
    normalizeMapData(worldData);
    return createEditorDocument(worldData, vantageData);
}

export async function initEditor() {
    const rootElement = document.getElementById('editor-app');
    if (!rootElement) throw new Error('Missing #editor-app root');

    const initialDocument = await loadInitialDocument();
    const store = createEditorStore(initialDocument);
    const canvasRef = { current: null };
    const coordsRef = { current: null };

    if (isEditorE2e) {
        window.__EDITOR_TEST__ = { store };
    }

    let controller = null;

    async function save() {
        store.dispatch({ type: 'set-save-state', value: 'saving', error: '' });
        try {
            const { mapPayload, vantagePayload } = store.serialize();
            const [mapResponse, vantageResponse] = await Promise.all([
                fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: 'tools/map.json', content: mapPayload })
                }),
                fetch('/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: 'config/vantage_points.json', content: vantagePayload })
                })
            ]);
            if (!mapResponse.ok || !vantageResponse.ok) {
                const message = !mapResponse.ok ? await mapResponse.text() : await vantageResponse.text();
                throw new Error(message || 'Save failed');
            }
            store.dispatch({ type: 'mark-saved' });
            store.dispatch({ type: 'set-toast', toast: { message: 'Saved editor changes', tone: 'success', timestamp: Date.now() } });
        } catch (error) {
            store.dispatch({ type: 'set-save-state', value: 'error', error: error.message });
            store.dispatch({ type: 'set-toast', toast: { message: `Save failed: ${error.message}`, tone: 'error', timestamp: Date.now() } });
        }
    }

    const app = React.createElement(EditorApp, {
        store,
        canvasRef: value => { canvasRef.current = value; },
        coordsRef: value => { coordsRef.current = value; },
        onSave: save,
        controller: {
            frameSelection() {
                controller?.frameSelection();
            },
            resetView() {
                controller?.resetView();
            }
        }
    });

    const root = ReactDOMClient.createRoot(rootElement);
    ReactDOM.flushSync(() => {
        root.render(app);
    });

    controller = createEditorCanvasController({
        canvas: canvasRef.current || document.getElementById('map-canvas'),
        coordsElement: coordsRef.current || document.getElementById('coords'),
        store
    });
    await controller.init();

    window.addEventListener('beforeunload', event => {
        if (!store.getState().history.dirty) return;
        event.preventDefault();
        event.returnValue = '';
    });

    const source = new EventSource('/events');
    source.addEventListener('reload-city', async () => {
        try {
            const previousDocument = store.getState().document;
            const nextDocument = await loadInitialDocument();
            const reindexedDocument = createEditorDocument(nextDocument.worldData, nextDocument.vantageData, previousDocument);
            const selectedId = resolveSelectionAfterReload(previousDocument, reindexedDocument, store.getState().selection.selectedId);
            store.dispatch({ type: 'replace-document', document: reindexedDocument, selectedId });
            store.dispatch({ type: 'set-toast', toast: { message: 'Reloaded world data', tone: 'info', timestamp: Date.now() } });
        } catch (error) {
            store.dispatch({ type: 'set-toast', toast: { message: `Reload failed: ${error.message}`, tone: 'error', timestamp: Date.now() } });
        }
    });

    return { store, controller, root };
}
