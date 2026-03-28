// @ts-check

/**
 * @typedef AudioWindowLike
 * @property {typeof AudioContext | undefined} [AudioContext]
 * @property {typeof AudioContext | undefined} [webkitAudioContext]
 */

export const ProceduralAudio = {
    /** @type {AudioContext | null} */
    ctx: null,
    /** @type {GainNode | null} */
    masterGain: null,
    /** @type {BiquadFilterNode | null} */
    perspectiveFilter: null,
    /** @type {DynamicsCompressorNode | null} */
    limiter: null,
    /** @type {GainNode | null} */
    engineBus: null,
    /** @type {GainNode | null} */
    windBus: null,
    /** @type {GainNode | null} */
    weatherBus: null,
    /** @type {GainNode | null} */
    fxBus: null,
    /** @type {ConvolverNode | null} */
    reverb: null,
    /** @type {GainNode | null} */
    reverbSendEngine: null,
    /** @type {GainNode | null} */
    reverbSendWind: null,
    /** @type {GainNode | null} */
    reverbSendWeather: null,
    /** @type {GainNode | null} */
    reverbReturn: null,
    /** @type {GainNode | null} */
    engineRumbleGain: null,
    /** @type {GainNode | null} */
    engineTurbineGain: null,
    /** @type {BiquadFilterNode | null} */
    engineRumbleFilter: null,
    /** @type {BiquadFilterNode | null} */
    engineTurbineFilter: null,
    /** @type {GainNode | null} */
    windBodyGain: null,
    /** @type {GainNode | null} */
    windRushGain: null,
    /** @type {BiquadFilterNode | null} */
    windBodyFilter: null,
    /** @type {BiquadFilterNode | null} */
    windRushFilter: null,
    /** @type {BiquadFilterNode | null} */
    rainFilter: null,
    /** @type {GainNode | null} */
    rainGain: null,
    /** @type {GainNode | null} */
    cabinAirGain: null,
    /** @type {BiquadFilterNode | null} */
    cabinAirFilter: null,
    lastCoinPickupTime: -Infinity,
    initialized: false,

    init: function () {
        if (this.initialized || this.ctx) return;

        try {
            const AudioContextCtor = /** @type {AudioWindowLike} */ (window).AudioContext || /** @type {AudioWindowLike} */ (window).webkitAudioContext;
            if (!AudioContextCtor) return;
            this.ctx = new AudioContextCtor();

            // 1. Create a shared White Noise Buffer
            const bufferSize = this.ctx.sampleRate * 2;
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

            // Master chain: perspective EQ -> soft limiter -> destination
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.68;
            this.perspectiveFilter = this.ctx.createBiquadFilter();
            this.perspectiveFilter.type = 'lowpass';
            this.perspectiveFilter.frequency.value = 7000;
            this.limiter = this.ctx.createDynamicsCompressor();
            this.limiter.threshold.value = -12;
            this.limiter.knee.value = 14;
            this.limiter.ratio.value = 6;
            this.limiter.attack.value = 0.004;
            this.limiter.release.value = 0.2;
            this.masterGain.connect(this.perspectiveFilter).connect(this.limiter).connect(this.ctx.destination);

            // Buses
            this.engineBus = this.ctx.createGain();
            this.windBus = this.ctx.createGain();
            this.weatherBus = this.ctx.createGain();
            this.fxBus = this.ctx.createGain();
            this.engineBus.connect(this.masterGain);
            this.windBus.connect(this.masterGain);
            this.weatherBus.connect(this.masterGain);
            this.fxBus.connect(this.masterGain);

            // Light reverb for ambient glue
            const ir = this.ctx.createBuffer(2, Math.floor(this.ctx.sampleRate * 1.2), this.ctx.sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const data = ir.getChannelData(ch);
                for (let i = 0; i < data.length; i++) {
                    const d = i / data.length;
                    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - d, 2.4);
                }
            }
            this.reverb = this.ctx.createConvolver();
            this.reverb.buffer = ir;
            this.reverbReturn = this.ctx.createGain();
            this.reverbReturn.gain.value = 0.1;
            this.reverb.connect(this.reverbReturn).connect(this.masterGain);

            this.reverbSendEngine = this.ctx.createGain();
            this.reverbSendWind = this.ctx.createGain();
            this.reverbSendWeather = this.ctx.createGain();
            this.reverbSendEngine.gain.value = 0.05;
            this.reverbSendWind.gain.value = 0.14;
            this.reverbSendWeather.gain.value = 0.2;
            this.reverbSendEngine.connect(this.reverb);
            this.reverbSendWind.connect(this.reverb);
            this.reverbSendWeather.connect(this.reverb);

            // Engine layers: rumble + turbine (no tonal whine layer)
            const engNoiseRumble = this.ctx.createBufferSource();
            engNoiseRumble.buffer = noiseBuffer;
            engNoiseRumble.loop = true;
            this.engineRumbleFilter = this.ctx.createBiquadFilter();
            this.engineRumbleFilter.type = 'lowpass';
            this.engineRumbleGain = this.ctx.createGain();
            this.engineRumbleGain.gain.value = 0;
            engNoiseRumble.connect(this.engineRumbleFilter).connect(this.engineRumbleGain);
            this.engineRumbleGain.connect(this.engineBus);
            this.engineRumbleGain.connect(this.reverbSendEngine);
            engNoiseRumble.start();

            const engNoiseTurbine = this.ctx.createBufferSource();
            engNoiseTurbine.buffer = noiseBuffer;
            engNoiseTurbine.loop = true;
            this.engineTurbineFilter = this.ctx.createBiquadFilter();
            this.engineTurbineFilter.type = 'bandpass';
            this.engineTurbineGain = this.ctx.createGain();
            this.engineTurbineGain.gain.value = 0;
            engNoiseTurbine.connect(this.engineTurbineFilter).connect(this.engineTurbineGain);
            this.engineTurbineGain.connect(this.engineBus);
            this.engineTurbineGain.connect(this.reverbSendEngine);
            engNoiseTurbine.start();

            // Wind layers: body + rush
            const windNoiseBody = this.ctx.createBufferSource();
            windNoiseBody.buffer = noiseBuffer;
            windNoiseBody.loop = true;
            this.windBodyFilter = this.ctx.createBiquadFilter();
            this.windBodyFilter.type = 'lowpass';
            this.windBodyGain = this.ctx.createGain();
            this.windBodyGain.gain.value = 0;
            windNoiseBody.connect(this.windBodyFilter).connect(this.windBodyGain);
            this.windBodyGain.connect(this.windBus);
            this.windBodyGain.connect(this.reverbSendWind);
            windNoiseBody.start();

            const windNoiseRush = this.ctx.createBufferSource();
            windNoiseRush.buffer = noiseBuffer;
            windNoiseRush.loop = true;
            this.windRushFilter = this.ctx.createBiquadFilter();
            this.windRushFilter.type = 'bandpass';
            this.windRushGain = this.ctx.createGain();
            this.windRushGain.gain.value = 0;
            windNoiseRush.connect(this.windRushFilter).connect(this.windRushGain);
            this.windRushGain.connect(this.windBus);
            this.windRushGain.connect(this.reverbSendWind);
            windNoiseRush.start();

            // Weather + cabin bed
            const rainSrc = this.ctx.createBufferSource();
            rainSrc.buffer = noiseBuffer;
            rainSrc.loop = true;
            this.rainFilter = this.ctx.createBiquadFilter();
            this.rainFilter.type = 'lowpass';
            this.rainGain = this.ctx.createGain();
            this.rainGain.gain.value = 0;
            rainSrc.connect(this.rainFilter).connect(this.rainGain);
            this.rainGain.connect(this.weatherBus);
            this.rainGain.connect(this.reverbSendWeather);
            rainSrc.start();

            const cabinAirSrc = this.ctx.createBufferSource();
            cabinAirSrc.buffer = noiseBuffer;
            cabinAirSrc.loop = true;
            this.cabinAirFilter = this.ctx.createBiquadFilter();
            this.cabinAirFilter.type = 'bandpass';
            this.cabinAirGain = this.ctx.createGain();
            this.cabinAirGain.gain.value = 0;
            cabinAirSrc.connect(this.cabinAirFilter).connect(this.cabinAirGain).connect(this.weatherBus);
            cabinAirSrc.start();

            this.initialized = true;
        } catch (e) {
            console.error("ProceduralAudio init failed:", e);
        }
    },

    resume: async function () {
        if (!this.initialized) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    },

    /**
     * @param {number} throttle
     * @param {number} airspeed
     * @param {boolean} spoilers
     * @param {number} cameraMode
     * @param {number} weatherMode
     * @param {number} gForce
     * @param {{ x: number, y: number, z: number }} angularVelocity
     * @param {number} aoa
     * @param {number} slip
     */
    update: function (throttle, airspeed, spoilers, cameraMode, weatherMode, gForce, angularVelocity, aoa, slip) {
        if (!this.initialized || !this.ctx || this.ctx.state === 'suspended') return;

        const t = this.ctx.currentTime;
        const inside = cameraMode === 1;
        const outsideMix = inside ? 0.0 : 1.0;
        const insideMix = inside ? 1.0 : 0.0;
        const speedFactor = Math.max(0, Math.min(1.4, airspeed / 250));
        const spoilerDrag = (spoilers && airspeed > 30) ? 0.16 : 0.0;
        const gStress = Math.abs(gForce - 1.0);
        const rotStress = Math.abs(angularVelocity.x) + Math.abs(angularVelocity.y) + Math.abs(angularVelocity.z);
        const maneuverStress = Math.min(1.0, (gStress + rotStress) * 0.7);
        const aoaStress = Math.min(1.0, Math.abs(aoa || 0) / (22 * Math.PI / 180));
        const slipStress = Math.min(1.0, Math.abs(slip || 0) / (16 * Math.PI / 180));

        // Perspective and master smoothness
        this.masterGain.gain.setTargetAtTime(inside ? 0.58 : 0.8, t, 1.5);
        this.perspectiveFilter.frequency.setTargetAtTime(inside ? (1300 + speedFactor * 1200) : 11200, t, 1.0);
        this.reverbReturn.gain.setTargetAtTime(inside ? 0.07 : 0.12, t, 1.2);

        // Engine (cinematic, soft, and less droning)
        const spool = Math.min(1.0, throttle * 0.85 + speedFactor * 0.2);
        const engineDrift = Math.sin(t * 0.23) * 0.06 + Math.sin(t * 0.11 + 1.7) * 0.04;
        this.engineRumbleGain.gain.setTargetAtTime((0.06 + spool * 0.2 + engineDrift * 0.03) * (inside ? 0.62 : 1.0), t, 1.1);
        this.engineRumbleFilter.frequency.setTargetAtTime(85 + spool * 140 + engineDrift * 18, t, 1.2);

        this.engineTurbineGain.gain.setTargetAtTime((0.012 + spool * 0.075) * (inside ? 0.45 : 0.88), t, 1.1);
        this.engineTurbineFilter.frequency.setTargetAtTime(260 + spool * 620 + speedFactor * 200 + engineDrift * 35, t, 1.0);

        // Airframe/wind
        const windBody = (Math.pow(speedFactor, 2) * 0.048 + maneuverStress * 0.05 + spoilerDrag * 0.8);
        const windRush = (Math.pow(speedFactor, 2.1) * 0.018 + aoaStress * 0.035 + slipStress * 0.04 + spoilerDrag * 0.5);
        this.windBodyGain.gain.setTargetAtTime(windBody * (inside ? 0.42 : 0.92), t, 0.85);
        this.windRushGain.gain.setTargetAtTime(windRush * (inside ? 0.28 : 0.85), t, 0.7);
        this.windBodyFilter.frequency.setTargetAtTime(150 + speedFactor * 620 + maneuverStress * 240, t, 0.75);
        this.windRushFilter.frequency.setTargetAtTime(620 + speedFactor * 1500 + slipStress * 420, t, 0.6);

        // Rain and cabin ambience
        const cabinBed = (0.01 + speedFactor * 0.015) * insideMix;
        this.cabinAirGain.gain.setTargetAtTime(cabinBed + (outsideMix * 0.0025), t, 1.4);
        this.cabinAirFilter.frequency.setTargetAtTime(220 + speedFactor * 330, t, 1.2);
    },

    touchdown: function () {
        if (!this.initialized || !this.ctx || this.ctx.state === 'suspended') return;
        const t = this.ctx.currentTime;

        // Gentle, low-pitched suspension thud instead of tire screech
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';

        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);

        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

        osc.connect(gain).connect(this.fxBus || this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
    },

    coinPickup: function () {
        if (!this.initialized || !this.ctx || this.ctx.state === 'suspended') return;

        const t = this.ctx.currentTime;
        const sinceLast = t - this.lastCoinPickupTime;
        this.lastCoinPickupTime = t;

        const bus = this.fxBus || this.ctx.destination;
        const transientBus = this.ctx.createGain();
        transientBus.gain.setValueAtTime(0.0001, t);
        transientBus.gain.exponentialRampToValueAtTime(0.95, t + 0.006);
        transientBus.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        transientBus.connect(bus);

        const bodyFilter = this.ctx.createBiquadFilter();
        bodyFilter.type = 'bandpass';
        bodyFilter.frequency.setValueAtTime(2100, t);
        bodyFilter.Q.value = 3.2;
        bodyFilter.connect(transientBus);

        const accentFilter = this.ctx.createBiquadFilter();
        accentFilter.type = 'highpass';
        accentFilter.frequency.setValueAtTime(2400, t);
        accentFilter.Q.value = 0.7;
        accentFilter.connect(transientBus);

        const crowdedPickup = sinceLast < 0.14;
        const baseFrequency = crowdedPickup
            ? 1220 + Math.random() * 80
            : 980 + Math.random() * 90;
        const layerRatios = [1.0, 2.06, 3.72];
        const layerGains = crowdedPickup ? [0.24, 0.1, 0.05] : [0.28, 0.12, 0.06];

        for (let index = 0; index < layerRatios.length; index++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = index === 0 ? 'triangle' : 'sine';

            const targetFreq = baseFrequency * layerRatios[index];
            osc.frequency.setValueAtTime(targetFreq * 0.82, t);
            osc.frequency.exponentialRampToValueAtTime(targetFreq * 1.18, t + 0.018);
            osc.frequency.exponentialRampToValueAtTime(targetFreq * 0.92, t + 0.075);
            osc.frequency.exponentialRampToValueAtTime(targetFreq * 0.62, t + 0.24);

            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(layerGains[index], t + 0.008);
            gain.gain.exponentialRampToValueAtTime(layerGains[index] * 0.35, t + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

            osc.connect(gain).connect(bodyFilter);
            osc.start(t);
            osc.stop(t + 0.25);
        }

        const ping = this.ctx.createOscillator();
        const pingGain = this.ctx.createGain();
        ping.type = 'sine';
        ping.frequency.setValueAtTime(3560 + Math.random() * 140, t);
        ping.frequency.exponentialRampToValueAtTime(2850 + Math.random() * 90, t + 0.12);
        pingGain.gain.setValueAtTime(0.0001, t);
        pingGain.gain.exponentialRampToValueAtTime(0.045, t + 0.004);
        pingGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        ping.connect(pingGain).connect(accentFilter);
        ping.start(t);
        ping.stop(t + 0.13);

        const noiseBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.08), this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) output[i] = Math.random() * 2 - 1;

        const clink = this.ctx.createBufferSource();
        clink.buffer = noiseBuffer;
        const clinkFilter = this.ctx.createBiquadFilter();
        clinkFilter.type = 'bandpass';
        clinkFilter.frequency.setValueAtTime(4200 + Math.random() * 220, t);
        clinkFilter.Q.value = 5.5;
        const clinkGain = this.ctx.createGain();
        clinkGain.gain.setValueAtTime(0.0001, t);
        clinkGain.gain.exponentialRampToValueAtTime(0.04, t + 0.003);
        clinkGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        clink.connect(clinkFilter).connect(clinkGain).connect(accentFilter);
        clink.start(t);
        clink.stop(t + 0.05);
    }
};
