export const ShaderLibrary = {
    terrain_city_pars_fragment: `
#ifdef HAS_CITY_MASK
uniform sampler2D uRoadMaskTex;
uniform vec2 uCityCenter;
uniform float uCityMaskRadius;
#endif
`,
    terrain_city_fragment: `
    float cityAlpha = 0.0;
#ifdef HAS_CITY_MASK
    vec2 cityUv = (vTerrainWorldPos.xz - uCityCenter + vec2(uCityMaskRadius)) / (uCityMaskRadius * 2.0);
    cityUv.y = 1.0 - cityUv.y;
    if (cityUv.x >= 0.0 && cityUv.x <= 1.0 && cityUv.y >= 0.0 && cityUv.y <= 1.0) {
        cityAlpha = texture2D(uRoadMaskTex, cityUv).r;
    }
#endif
`,
    terrain_city_pavement_fragment: `
#ifdef HAS_CITY_MASK
        // Pavement from 80/255 (0.31) to 160/255 (0.62)
        float isUrbanPavement = smoothstep(0.20, 0.40, cityAlpha);
        // Asphalt from 160/255 (0.62) upwards
        float isRoadAsphalt = smoothstep(0.55, 0.65, cityAlpha);
        
        vec3 pavementColor = vec3(0.55, 0.55, 0.55); // lighter concrete gray so it pops
        vec3 asphaltColor = vec3(0.20, 0.20, 0.20); // dark asphalt

#ifndef IS_FAR_LOD
        pavementColor *= mix(0.85, 1.15, rockDetail); // add grit
#endif

        // Dashed center lane markings
        float isCenter = smoothstep(0.92, 0.98, cityAlpha);
        float dashPattern = step(0.5, fract(vTerrainWorldPos.x * 0.10 + vTerrainWorldPos.z * 0.10));
        vec3 markingColor = vec3(0.92, 0.88, 0.72); // warm off-white
        
        vec3 finalCityColor = mix(pavementColor, asphaltColor, isRoadAsphalt);
        finalCityColor = mix(finalCityColor, markingColor, isCenter * dashPattern * 0.75);

#ifndef IS_FAR_LOD
        // Traffic Layer (Headlights & Taillights)
        // High frequency scrolling patterns on asphalt
        float trafficAnim = uTime * 1.8;
        float flowX = fract(vTerrainWorldPos.x * 0.04 + trafficAnim);
        float flowZ = fract(vTerrainWorldPos.z * 0.04 - trafficAnim);

        // Heads (white/yellow) and Tails (red)
        float heads = step(0.96, fract(vTerrainWorldPos.x * 0.3 + trafficAnim * 1.2)) +
                      step(0.96, fract(vTerrainWorldPos.z * 0.3 - trafficAnim * 1.2));
        float tails = step(0.96, fract(vTerrainWorldPos.x * 0.3 + (trafficAnim + 0.5) * 1.2)) +
                      step(0.96, fract(vTerrainWorldPos.z * 0.3 - (trafficAnim + 0.5) * 1.2));

        // Modulate by urban density (high cityAlpha)
        float trafficDensity = smoothstep(0.65, 0.95, cityAlpha);
        vec3 headlightCol = vec3(1.0, 0.98, 0.85);
        vec3 taillightCol = vec3(1.0, 0.1, 0.05);

        finalCityColor = mix(finalCityColor, headlightCol, heads * isRoadAsphalt * trafficDensity * 0.9);
        finalCityColor = mix(finalCityColor, taillightCol, tails * isRoadAsphalt * trafficDensity * 0.7);
#endif

        diffuseColor.rgb = mix(diffuseColor.rgb, finalCityColor, isUrbanPavement);
#endif
`
};
