import * as React from 'react';

import { HintCard, useStore } from './common.jsx';

export function FooterPanel({ store }) {
    const saveError = useStore(store, (state) => state.ui.saveError);
    if (!saveError) return null;
    return <HintCard tone="danger">{saveError}</HintCard>;
}
