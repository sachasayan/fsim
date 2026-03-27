import * as React from 'react';

import { HintCard, shallowEqual, useStore } from './common.jsx';

export function FooterPanel({ store }) {
    const { saveError, rebuildError } = useStore(store, (state) => ({
        saveError: state.ui.saveError,
        rebuildError: state.ui.rebuildError
    }), shallowEqual);
    const error = saveError || rebuildError;
    if (!error) return null;
    return <HintCard tone="danger">{error}</HintCard>;
}
