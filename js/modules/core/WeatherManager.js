import * as THREE from 'three';
import { LIGHTING_PRESETS } from '../lighting.js';

export function createWeatherManager({
    scene,
    renderer,
    bloomPass,
    WEATHER,
    hemiLight,
    dirLight,
    cloudMaterial,
    updateClouds,
    updateTerrainAtmosphere,
    applyEnvironmentFromWeather,
    initialPreset
}) {
    const clearWeatherColor = new THREE.Color(WEATHER.clearColor);
    const stormWeatherColor = new THREE.Color(WEATHER.stormColor);
    const currentWeatherColor = new THREE.Color();
    const clearCloudColor = new THREE.Color(WEATHER.cloudColorClear);
    const stormCloudColor = new THREE.Color(WEATHER.cloudColorStorm);
    const currentCloudColor = new THREE.Color(clearCloudColor);

    const tmpSunDir = new THREE.Vector3();
    const tmpLightingSunDir = new THREE.Vector3();

    function syncDerivedWeatherCache() {
        clearWeatherColor.setHex(WEATHER.clearColor);
        stormWeatherColor.setHex(WEATHER.stormColor);
        clearCloudColor.setHex(WEATHER.cloudColorClear);
        stormCloudColor.setHex(WEATHER.cloudColorStorm);
        renderer.toneMappingExposure = WEATHER.exposure;
        bloomPass.threshold = WEATHER.bloomThreshold;
        bloomPass.strength = WEATHER.bloomStrength;
        bloomPass.radius = WEATHER.bloomRadius;
    }

    function applyLightingPreset(presetId) {
        const preset = LIGHTING_PRESETS[presetId];
        if (!preset) return;

        WEATHER.lightingPresetId = presetId;
        WEATHER.clearColor = preset.clearColor;
        WEATHER.stormColor = preset.stormColor;
        WEATHER.lightAmbientBase = preset.ambientBase;
        WEATHER.lightDirectBase = preset.directBase;
        WEATHER.hemiSkyColor = preset.hemiSkyColor;
        WEATHER.hemiGroundColor = preset.hemiGroundColor;
        WEATHER.dirColor = preset.dirColor;
        WEATHER.sunPhiDeg = preset.sunPhiDeg;
        WEATHER.sunThetaDeg = preset.sunThetaDeg;
        WEATHER.skyTurbidity = preset.skyTurbidity;
        WEATHER.skyRayleigh = preset.skyRayleigh;
        WEATHER.skyMieCoefficient = preset.skyMieCoefficient;
        WEATHER.skyMieDirectionalG = preset.skyMieDirectionalG;
        WEATHER.hazeColor = preset.hazeColor;
        WEATHER.hazeOpacity = preset.hazeOpacity;
        WEATHER.starOpacity = preset.starOpacity;
        WEATHER.exposure = preset.exposure;
        WEATHER.bloomThreshold = preset.bloom.threshold;
        WEATHER.bloomStrength = preset.bloom.strength;
        WEATHER.bloomRadius = preset.bloom.radius;
        WEATHER.cloudColorClear = preset.cloudColorClear;
        WEATHER.cloudColorStorm = preset.cloudColorStorm;
        WEATHER.cloudOpacityBase = preset.cloudOpacityBase;
        WEATHER.cloudOpacityStorm = preset.cloudOpacityStorm;
        WEATHER.cloudEmissiveBase = preset.cloudEmissiveBase;
        WEATHER.cloudEmissiveStorm = preset.cloudEmissiveStorm;

        syncDerivedWeatherCache();

        if (applyEnvironmentFromWeather) {
            applyEnvironmentFromWeather(WEATHER, { refreshEnvironmentMap: true });
        }
    }

    function update(dt, frameCount, camera) {
        if (frameCount % 4 !== 0) return;

        WEATHER.currentFog += (WEATHER.targetFog - WEATHER.currentFog) * dt * 2.0;
        if (scene.fog) {
            scene.fog.density = WEATHER.currentFog;
        }

        WEATHER.transition += (WEATHER.targetTransition - WEATHER.transition) * dt * 2.0;

        currentWeatherColor.lerpColors(clearWeatherColor, stormWeatherColor, WEATHER.transition);
        scene.background = currentWeatherColor;
        if (scene.fog) {
            scene.fog.color = currentWeatherColor;
        }

        if (updateTerrainAtmosphere) {
            updateTerrainAtmosphere(camera, currentWeatherColor);
        }

        tmpLightingSunDir.copy(dirLight.position).normalize();
        const sunElev = THREE.MathUtils.clamp((tmpLightingSunDir.y + 0.06) / 0.74, 0, 1);
        const lowSun = 1.0 - sunElev;
        const lowSunWeight = lowSun * (1.0 - WEATHER.transition * 0.45);

        hemiLight.intensity = WEATHER.lightAmbientBase * (1.0 - WEATHER.transition * 0.55) * (1.0 + lowSunWeight * 0.26);
        dirLight.intensity = WEATHER.lightDirectBase * (1.0 - WEATHER.transition * 0.9) * (1.0 + lowSunWeight * 0.1);
        renderer.toneMappingExposure = WEATHER.exposure * (1.0 + lowSunWeight * 0.12);
        bloomPass.threshold = WEATHER.bloomThreshold + lowSunWeight * 0.4;
        bloomPass.strength = WEATHER.bloomStrength * (1.0 - lowSunWeight * 0.2);

        if (cloudMaterial) {
            currentCloudColor.lerpColors(clearCloudColor, stormCloudColor, WEATHER.transition);
            cloudMaterial.color.copy(currentCloudColor);
            cloudMaterial.opacity = WEATHER.cloudOpacityBase + (WEATHER.cloudOpacityStorm - WEATHER.cloudOpacityBase) * WEATHER.transition;
            cloudMaterial.emissiveIntensity = WEATHER.cloudEmissiveBase + (WEATHER.cloudEmissiveStorm - WEATHER.cloudEmissiveBase) * WEATHER.transition;
        }

        if (updateClouds) {
            updateClouds(dt * 4.0, camera, WEATHER, currentCloudColor, tmpSunDir.copy(dirLight.position).normalize());
        }
    }

    if (initialPreset) {
        console.log(`WeatherManager: Applying initial lighting preset: ${initialPreset}`);
        applyLightingPreset(initialPreset);
    }

    return {
        applyLightingPreset,
        update,
        syncDerivedWeatherCache
    };
}
