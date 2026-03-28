import * as React from 'react';

export function StatusBar({ coordsRef }: { coordsRef: React.Ref<HTMLDivElement> }) {
    return (
        <footer className="editor-statusbar">
            <span>Canvas Status</span>
            <div id="coords" ref={coordsRef} data-testid="coords-readout" className="font-mono text-[11px] tracking-[0.1em] text-[color:var(--text)]">
                X: 0, Z: 0
            </div>
        </footer>
    );
}
