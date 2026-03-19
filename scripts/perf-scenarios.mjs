const BASE_QUERY = {
  lighting: 'noon'
};

const DEFAULT_CAMERA = {
  rotationX: 0.35,
  rotationY: -0.25,
  distance: 95
};

const DEFAULT_CAPTURE = {
  warmupFrames: 20,
  sampleFrames: 30,
  sampleMs: 4000,
  settleDelayMs: 10000,
  profilingReadyTimeoutMs: 45000,
  requireSteadyState: true
};

const DEFAULT_RUNTIME = {
  hidePlane: false,
  terrain: {
    showTrees: true,
    showBuildings: true
  }
};

const DEFAULT_LEVEL_FLIGHT_CAPTURE = {
  ...DEFAULT_CAPTURE,
  warmupFrames: 0,
  sampleFrames: 0,
  sampleMs: 10_000
};

const PERF_SCENARIOS = {
  startup_steady_state: {
    id: 'startup_steady_state',
    label: 'Startup steady state',
    query: {
      ...BASE_QUERY,
      fog: '0',
      clouds: '0'
    },
    spawn: { x: 0, y: 5, z: 1900 },
    camera: DEFAULT_CAMERA,
    capture: DEFAULT_CAPTURE,
    runtime: DEFAULT_RUNTIME,
    movement: { type: 'none' }
  },
  level_flight_low_alt: {
    id: 'level_flight_low_alt',
    label: 'Level flight low altitude',
    query: {
      ...BASE_QUERY,
      renderDist: '6'
    },
    spawn: { x: 1200, y: 1000, z: 900 },
    camera: {
      rotationX: 0.22,
      rotationY: -0.18,
      distance: 115
    },
    capture: DEFAULT_LEVEL_FLIGHT_CAPTURE,
    runtime: DEFAULT_RUNTIME,
    movement: {
      type: 'velocity_heading',
      targetSpeedMps: 180,
      yawRad: 0.35,
      throttle: 0.62
    }
  },
  level_flight_cruise: {
    id: 'level_flight_cruise',
    label: 'Level flight cruise',
    query: {
      ...BASE_QUERY,
      renderDist: '7'
    },
    spawn: { x: 3200, y: 8000, z: -1400 },
    camera: {
      rotationX: 0.18,
      rotationY: -0.24,
      distance: 145
    },
    capture: DEFAULT_LEVEL_FLIGHT_CAPTURE,
    runtime: DEFAULT_RUNTIME,
    movement: {
      type: 'velocity_heading',
      targetSpeedMps: 240,
      yawRad: 0.18,
      throttle: 0.58
    }
  },
  terrain_streaming_low_alt: {
    id: 'terrain_streaming_low_alt',
    label: 'Terrain streaming low altitude',
    query: {
      ...BASE_QUERY,
      fog: '0',
      clouds: '0',
      renderDist: '4',
      hideplane: '1'
    },
    spawn: { x: 1200, y: 180, z: 900 },
    camera: {
      rotationX: 0.18,
      rotationY: -0.12,
      distance: 80
    },
    capture: {
      ...DEFAULT_CAPTURE,
      warmupFrames: 24,
      sampleFrames: 36
    },
    runtime: {
      ...DEFAULT_RUNTIME,
      hidePlane: true
    },
    movement: {
      type: 'path',
      speedMps: 210,
      yawRad: 0.35
    }
  },
  terrain_streaming_high_alt: {
    id: 'terrain_streaming_high_alt',
    label: 'Terrain streaming high altitude',
    query: {
      ...BASE_QUERY,
      fog: '0',
      clouds: '0',
      renderDist: '6',
      hideplane: '1'
    },
    spawn: { x: 3200, y: 2400, z: -1400 },
    camera: {
      rotationX: 0.2,
      rotationY: -0.28,
      distance: 135
    },
    capture: {
      ...DEFAULT_CAPTURE,
      warmupFrames: 24,
      sampleFrames: 40
    },
    runtime: {
      ...DEFAULT_RUNTIME,
      hidePlane: true
    },
    movement: {
      type: 'path',
      speedMps: 320,
      yawRad: 0.18
    }
  },
  gpu_heavy_visuals: {
    id: 'gpu_heavy_visuals',
    label: 'GPU heavy visuals',
    query: {
      lighting: 'golden',
      renderDist: '5'
    },
    spawn: { x: 0, y: 220, z: 1500 },
    camera: {
      rotationX: 0.42,
      rotationY: -0.24,
      distance: 100
    },
    capture: DEFAULT_CAPTURE,
    runtime: DEFAULT_RUNTIME,
    movement: { type: 'none' }
  },
  cpu_isolation: {
    id: 'cpu_isolation',
    label: 'CPU isolation',
    query: {
      ...BASE_QUERY,
      fog: '0',
      clouds: '0',
      shadows: '0',
      renderDist: '3'
    },
    spawn: { x: 400, y: 120, z: 2100 },
    camera: DEFAULT_CAMERA,
    capture: DEFAULT_CAPTURE,
    runtime: DEFAULT_RUNTIME,
    movement: { type: 'none' }
  },
  content_stress_city: {
    id: 'content_stress_city',
    label: 'Content stress city',
    query: {
      ...BASE_QUERY,
      fog: '0',
      renderDist: '5'
    },
    spawn: { x: 10300, y: 180, z: 1700 },
    camera: {
      rotationX: 0.48,
      rotationY: -0.14,
      distance: 85
    },
    capture: {
      ...DEFAULT_CAPTURE,
      warmupFrames: 24,
      sampleFrames: 36
    },
    runtime: DEFAULT_RUNTIME,
    movement: {
      type: 'orbit',
      radius: 420,
      angularSpeedRadPerSec: 0.22,
      altitude: 220
    }
  }
};

const PERF_SWEEPS = [
  {
    id: 'baseline',
    label: 'Baseline',
    query: {},
    runtime: {}
  },
  {
    id: 'shadows_off',
    label: 'Shadows off',
    query: { shadows: '0' },
    runtime: {}
  },
  {
    id: 'clouds_off',
    label: 'Clouds off',
    query: { clouds: '0' },
    runtime: {}
  },
  {
    id: 'fog_off',
    label: 'Fog off',
    query: { fog: '0' },
    runtime: {}
  },
  {
    id: 'renderdist_low',
    label: 'Render distance low',
    query: { renderDist: '3' },
    runtime: {}
  },
  {
    id: 'terrain_only',
    label: 'Terrain only',
    query: { hideplane: '1' },
    runtime: {
      hidePlane: true,
      terrain: {
        showTrees: false,
        showBuildings: false
      }
    }
  }
];

export function listPerfScenarios() {
  return Object.values(PERF_SCENARIOS).map((scenario) => structuredClone(scenario));
}

export function getPerfScenario(id = 'startup_steady_state') {
  const scenario = PERF_SCENARIOS[id] || PERF_SCENARIOS.startup_steady_state;
  return structuredClone(scenario);
}

export function listPerfSweeps() {
  return PERF_SWEEPS.map((entry) => structuredClone(entry));
}

export function mergeScenarioVariant(baseScenario, sweep) {
  return {
    ...structuredClone(baseScenario),
    id: `${baseScenario.id}:${sweep.id}`,
    sweepId: sweep.id,
    sweepLabel: sweep.label,
    query: {
      ...(baseScenario.query || {}),
      ...(sweep.query || {})
    },
    runtime: {
      ...(baseScenario.runtime || {}),
      ...(sweep.runtime || {}),
      terrain: {
        ...(baseScenario.runtime?.terrain || {}),
        ...(sweep.runtime?.terrain || {})
      }
    }
  };
}

export function buildScenarioQuery(scenario, extraQuery = '') {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(scenario.query || {})) {
    if (value == null) continue;
    params.set(key, String(value));
  }

  if (extraQuery) {
    const extra = new URLSearchParams(extraQuery.startsWith('?') ? extraQuery.slice(1) : extraQuery);
    for (const [key, value] of extra.entries()) {
      params.set(key, value);
    }
  }

  return params;
}
