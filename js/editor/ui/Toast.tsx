import * as React from 'react';

import type { EditorStore, EditorToast } from '../core/types.js';
import { cn, useStore } from './common';

export function Toast({ store }: { store: EditorStore }) {
    const toast = useStore<EditorToast | null>(store, (state) => state.ui.toast);
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
