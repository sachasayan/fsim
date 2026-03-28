// @ts-check

/**
 * Manages rotating "loading" messages for the loader screen.
 */

const TIPS = [
    "Aligning inertial reference systems...",
    "Projecting terrain mesh priorities...",
    "Scanning nearby surface elevation...",
    "Precharging shader pipelines...",
    "Validating atmospheric lighting model...",
    "Synchronizing world state telemetry...",
    "Bringing avionics subsystems online...",
    "Preparing runway and airfield assets...",
    "Stabilizing rendering instrumentation...",
    "Finalizing departure-ready boot sequence..."
];

/**
 * Starts rotating tips in the specified element.
 * @param {string} elementId - The ID of the DOM element to update.
 * @param {number} intervalMs - Interval between tips in milliseconds.
 * @returns {ReturnType<typeof setInterval> | null} The interval ID.
 */
export function startLoaderTips(elementId, intervalMs = 2200) {
    const element = document.getElementById(elementId);
    if (!element) return null;

    let index = 0;

    // Initial update
    element.innerText = TIPS[index];

    const intervalId = setInterval(() => {
        index = (index + 1) % TIPS.length;
        element.innerText = TIPS[index];
    }, intervalMs);

    return intervalId;
}
