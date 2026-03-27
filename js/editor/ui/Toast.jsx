import * as React from 'react';

import { cn, useStore } from './common.jsx';

export function Toast({ store }) {
    const toast = useStore(store, (state) => state.ui.toast);
    if (!toast) return null;
    return (
        <div
            className={cn(
                'editor-toast',
                toast.tone === 'success' && 'bg-emerald-500/15 text-emerald-100',
                toast.tone === 'error' && 'bg-red-500/15 text-red-100',
                toast.tone !== 'success' && toast.tone !== 'error' && 'bg-slate-900/90 text-[color:var(--text)]'
            )}
            role="status"
            aria-live="polite"
            data-testid="toast"
        >
            {toast.message}
        </div>
    );
}
