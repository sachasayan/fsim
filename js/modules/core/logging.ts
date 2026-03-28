const hasWindow = typeof window !== 'undefined';
const search = hasWindow ? (window.location?.search || '') : '';
const params = new URLSearchParams(search);
const isEnabled = params.get('debug') === '1' || params.get('logs') === '1';

export function debugLog(...args: unknown[]) {
    if (!isEnabled) return;
    console.log(...args);
}

export function debugInfo(...args: unknown[]) {
    if (!isEnabled) return;
    console.info(...args);
}
