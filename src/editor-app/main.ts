import './styles.css';

import { initEditor } from '../../js/editor/index';

initEditor().catch((error) => {
    console.error('Failed to initialize editor', error);
    const root = document.getElementById('editor-app');
    if (root) {
        const message = error instanceof Error ? error.message : String(error);
        root.innerHTML = `<div style="padding:24px;color:#fff;font-family:sans-serif;">Editor failed to load: ${message}</div>`;
    }
});
