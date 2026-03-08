export function createInputHandler({ keys, PHYSICS, cameraController }) {
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
            const gui = document.querySelector('.lil-gui');
            if (gui) {
                gui.style.display = gui.style.display === 'none' ? '' : 'none';
            }
        }
    };

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
