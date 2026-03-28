import * as React from 'react';

import type { EditorStore } from '../core/types.js';
import { HintCard, shallowEqual, useStore } from './common';

export function FooterPanel({ store }: { store: EditorStore }) {
    const { saveError, rebuildError } = useStore<{ saveError: string; rebuildError: string }>(
        store,
        (state) => ({
            saveError: state.ui.saveError,
            rebuildError: state.ui.rebuildError
        }),
        shallowEqual
    );
    const error = saveError || rebuildError;
    if (!error) return null;
    return <HintCard tone="danger">{error}</HintCard>;
}
