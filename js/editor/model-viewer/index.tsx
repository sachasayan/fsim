import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

import { ModelViewerApp } from './app';

export function initModelViewer() {
    const rootElement = document.getElementById('model-viewer-app');
    if (!rootElement) {
        throw new Error('Missing #model-viewer-app root');
    }
    const root = ReactDOMClient.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <ModelViewerApp />
        </React.StrictMode>
    );
}
