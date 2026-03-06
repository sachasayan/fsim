/**
 * Manages rotating "loading" messages for the loader screen.
 */

const TIPS = [
    "Reticulating splines...",
    "Generating terrain meshes...",
    "Simulating atmospheric drag...",
    "Warming up turbines...",
    "Calibrating inertial reference systems...",
    "Loading high-fidelity textures...",
    "Calculating flight envelopes...",
    "Synchronizing world clock...",
    "Deploying procedural flora...",
    "Optimizing shader pipelines...",
    "Inflating digital tires...",
    "Polishing cockpit glass...",
    "Testing emergency exits...",
    "Consulting flight manuals...",
    "Pre-heating hydraulic fluid..."
];

/**
 * Starts rotating tips in the specified element.
 * @param {string} elementId - The ID of the DOM element to update.
 * @param {number} intervalMs - Interval between tips in milliseconds.
 * @returns {number} The interval ID.
 */
export function startLoaderTips(elementId, intervalMs = 250) {
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
