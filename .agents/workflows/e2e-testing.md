---
description: How to use E2E visual feedback testing
---
# E2E Visual Feedback Testing

As an AI agent working on the `fsim` project, you should actively use the end-to-end screenshot script to get visual feedback on your changes. This is critical for shaders, lighting, procedural city generation, and rendering logic.

## How to capture a screenshot

Run the following command to launch the simulator in headless mode. The script will wait for the terrain and procedural city to finish loading before capturing a `.png`.

```bash
npm run screenshot
```

By default, it captures the runway spawn point.

## Parameterized Screenshots

You can customize the view using several command-line arguments:

| Argument | Description | Example |
| :--- | :--- | :--- |
| `--x`, `--y`, `--z` | World coordinates for camera position | `--x=8000 --y=400 --z=10000` |
| `--fog` | 1 (on) or 0 (off). Use 0 for clear city views. | `--fog=0` |
| `--clouds` | 1 (on) or 0 (off). | `--clouds=0` |
| `--lighting` | Preset name: `day`, `sunset`, `night`, `dawn`, `overcast`. | `--lighting=night` |
| `--vantage` | Use a named coordinate set from `vantage_points.json`. | `--vantage=city_overview` |

### Example: Clear wide shot of the city
```bash
npm run screenshot -- --vantage=city_overview --fog=0 --clouds=0
```

## Vantage Points

Preset camera positions are stored in `screenshots/vantage_points.json`. You can add new ones there to ensure consistent testing across different development phases.

## Workflow

1.  Apply your code changes.
2.  Run `npm run screenshot` with relevant parameters.
3.  Use your vision tools to inspect the output image in the `screenshots/` directory.
4.  Refine your changes based on the visual feedback.

The script includes a lock mechanism (`.screenshot.lock`) to prevent concurrent runs, ensuring stable rendering environments.
