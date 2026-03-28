// @ts-check

/**
 * @typedef InputPhysicsLike
 * @property {boolean} brakes
 */

/**
 * @typedef CameraControllerLike
 * @property {() => void} cycleMode
 * @property {() => void} recenterBehindAircraft
 */

/**
 * @param {{
 *   keys: Record<string, boolean>,
 *   PHYSICS: InputPhysicsLike,
 *   cameraController?: CameraControllerLike | null
 * }} options
 */
export function createInputHandler({ keys, PHYSICS, cameraController }) {
    /** @param {KeyboardEvent} e */
    const onKeyDown = (e) => {
        const key = e.key.toLowerCase();
        const originalKey = e.key;

        if (Object.prototype.hasOwnProperty.call(keys, key) || Object.prototype.hasOwnProperty.call(keys, originalKey)) {
            const k = Object.prototype.hasOwnProperty.call(keys, originalKey) ? originalKey : key;
            keys[k] = true;
        }

        if (key === 'c' && cameraController) cameraController.cycleMode();
        if (!e.repeat && cameraController) cameraController.recenterBehindAircraft();
        if (key === 'g') {
            const gui = /** @type {HTMLElement | null} */ (document.querySelector('.lil-gui'));
            if (gui) {
                gui.style.display = gui.style.display === 'none' ? '' : 'none';
            }
        }
    };

    /** @param {KeyboardEvent} e */
    const onKeyUp = (e) => {
        const key = e.key.toLowerCase();
        const originalKey = e.key;

        const k = Object.prototype.hasOwnProperty.call(keys, originalKey) ? originalKey : key;
        if (Object.prototype.hasOwnProperty.call(keys, k)) keys[k] = false;

        if (key === 'b') PHYSICS.brakes = false;
    };

    function init() {
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
    }

    function dispose() {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
    }

    return {
        init,
        dispose
    };
}
