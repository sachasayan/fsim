import * as React from 'react';

import { HintCard, useStore } from './common.jsx';

export function FooterPanel({ store }) {
    const state = useStore(store, (value) => value);
    if (!state.ui.saveError) return null;
    return <HintCard tone="danger">{state.ui.saveError}</HintCard>;
}
