

export const LIGHTING_PRESETS = {
  dawn: {
    clearColor: 0x7f8db3,
    stormColor: 0x2f3646,
    hemiSkyColor: 0xbfd4ff,
    hemiGroundColor: 0x2a2230,
    dirColor: 0xffb176,
    ambientBase: 0.34,
    directBase: 1.2,
    sunPhiDeg: 82,
    sunThetaDeg: 114,
    skyTurbidity: 9.2,
    skyRayleigh: 2.35,
    skyMieCoefficient: 0.045,
    skyMieDirectionalG: 0.43,
    exposure: 0.88,
    bloom: { threshold: 5.0, strength: 0.82, radius: 0.4 },
    hazeColor: 0x4d4f64,
    hazeOpacity: 0.12,
    starOpacity: 0.14,
    cloudColorClear: 0xf8fbff,
    cloudColorStorm: 0xd7dee8,
    cloudOpacityBase: 0.43,
    cloudOpacityStorm: 0.52,
    cloudEmissiveBase: 0.05,
    cloudEmissiveStorm: 0.02
  },
  golden_hour: {
    clearColor: 0x6b5c72,
    stormColor: 0x2a2f3d,
    hemiSkyColor: 0xffd3a8,
    hemiGroundColor: 0x2f2220,
    dirColor: 0xff9a52,
    ambientBase: 0.31,
    directBase: 1.15,
    sunPhiDeg: 84,
    sunThetaDeg: 148,
    skyTurbidity: 10.2,
    skyRayleigh: 2.8,
    skyMieCoefficient: 0.052,
    skyMieDirectionalG: 0.4,
    exposure: 0.84,
    bloom: { threshold: 5.0, strength: 0.85, radius: 0.4 },
    hazeColor: 0x4b3f4a,
    hazeOpacity: 0.14,
    starOpacity: 0.22,
    cloudColorClear: 0xfff6ee,
    cloudColorStorm: 0xd5cfca,
    cloudOpacityBase: 0.45,
    cloudOpacityStorm: 0.55,
    cloudEmissiveBase: 0.05,
    cloudEmissiveStorm: 0.015
  },
  blue_hour: {
    clearColor: 0x4e5f86,
    stormColor: 0x1f2532,
    hemiSkyColor: 0xa7c2ff,
    hemiGroundColor: 0x222736,
    dirColor: 0x8fb2ff,
    ambientBase: 0.26,
    directBase: 0.82,
    sunPhiDeg: 86,
    sunThetaDeg: 160,
    skyTurbidity: 11.0,
    skyRayleigh: 2.65,
    skyMieCoefficient: 0.055,
    skyMieDirectionalG: 0.37,
    exposure: 0.8,
    bloom: { threshold: 4.9, strength: 0.9, radius: 0.42 },
    hazeColor: 0x313a50,
    hazeOpacity: 0.15,
    starOpacity: 0.3,
    cloudColorClear: 0xf4f8ff,
    cloudColorStorm: 0xc7d1df,
    cloudOpacityBase: 0.47,
    cloudOpacityStorm: 0.58,
    cloudEmissiveBase: 0.04,
    cloudEmissiveStorm: 0.01
  }
};



export function pickLightingPresetId() {
  const ids = Object.keys(LIGHTING_PRESETS);
  return ids[Math.floor(Math.random() * ids.length)];
}
