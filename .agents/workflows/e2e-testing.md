---
description: How to use E2E visual feedback testing
---
# E2E Visual Feedback Testing

As an AI agent working on the `fsim` project, you should actively use the end-to-end screenshot script to get visual feedback on the changes you just made to the codebase. This is especially helpful when modifying shaders, lighting, 3D meshes, rendering logic, or procedural generation.

## How to capture a screenshot

You can use the provided npm script to launch the simulator in headless mode, which will wait until the WebGL rendering is stable and output a `.png` to the `screenshots/` directory.

```bash
npm run screenshot
```

By default, the screenshot will capture the spawn position at the airport runway threshold. 

## Capturing specific coordinates

If you want to view a specific part of the map (for example, to inspect the procedural city builder at a distance), you can provide `x`, `y`, and `z` coordinates. The script will teleport the camera to that location before capturing the screenshot.

```bash
npm run screenshot -- --x=5000 --y=200 --z=5000
```

When you are using visual UI feedback, remember to use your vision tools to inspect the generated `screenshots/screenshot-*.png` image and report back your observations to the user.
