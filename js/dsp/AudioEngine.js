/**
 * SIMPLIFIED AUDIO ENGINE CLASS
 * Manages Web Audio API context and oscillator-based synthesis only
 */

import { WaveformGenerator } from './WaveformGenerator.js';

export class AudioEngine {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.compressor = null;
        this.oscillators = new Map();
        this.isInitialized = false;

        // Standard waveforms
        this.standardWaveforms = new Map();

        // No routingMode needed; playback is always stereo
    }

    /**
     * Initializes the audio engine for oscillator-based synthesis
     * @param {number} masterGainValue - Initial master gain value
     * @param {Object} options - Configuration options (for compatibility)
     */
    async initialize(masterGainValue = 0.5) {
        if (this.isInitialized) return;
        this.context = new (window.AudioContext || window.webkitAudioContext)();

        // Per-voice cycle-gate worklet (rhythmic gating of overtones).
        // Served unbundled — the worklet global scope can't import modules.
        this.gateWorkletReady = false;
        try {
            await this.context.audioWorklet.addModule('js/dsp/worklets/gate-processor.js');
            this.gateWorkletReady = true;
        } catch (err) {
            console.warn('[audio] gate worklet unavailable — voices run ungated:', err);
        }

        // Create audio graph
        this.setupAudioGraph(masterGainValue);

        // Pre-generate standard waveforms
        this.generateStandardWaveforms();

        this.isInitialized = true;

        // Resume context if suspended
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    /**
     * Resume the audio context if suspended
     */
    async resume() {
        if (this.context && this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    /**
     * Sets up the main audio processing graph
     * @param {number} masterGainValue - Initial master gain value
     */
    setupAudioGraph(masterGainValue) {
        // Create dynamics compressor (gentle pre-limiter compression)
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-24, this.context.currentTime);
        this.compressor.ratio.setValueAtTime(6, this.context.currentTime); // more aggressive
        this.compressor.attack.setValueAtTime(0.01, this.context.currentTime);
        this.compressor.release.setValueAtTime(0.20, this.context.currentTime);

        // Create master gain node
        this.masterGain = this.context.createGain();
        this.masterGain.gain.setValueAtTime(masterGainValue, this.context.currentTime);
        this.masterGain.maxGain = 1.0;

        // Fast final limiter
        this.limiter = this.context.createDynamicsCompressor();
        this.limiter.threshold.setValueAtTime(-6, this.context.currentTime); // more headroom
        this.limiter.ratio.setValueAtTime(6, this.context.currentTime);
        this.limiter.attack.setValueAtTime(0.005, this.context.currentTime); // much faster
        this.limiter.release.setValueAtTime(0.15, this.context.currentTime); // less pumping

        // mono or stereo: compressor to masterGain
        this.compressor.connect(this.masterGain);

        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.context.destination);
    }

    /**
     * Generates standard band-limited waveforms
     */
    generateStandardWaveforms() {
        const types = ['square', 'sawtooth', 'triangle'];

        for (const type of types) {
            const periodicWave = WaveformGenerator.createBandLimitedWaveform(this.context, type, 128);
            this.standardWaveforms.set(type, periodicWave);
        }
    }


    /**
     * Get a standard waveform PeriodicWave object
     * @param {string} waveformType - Type of waveform ('square', 'sawtooth', 'triangle')
     * @returns {PeriodicWave|null} The PeriodicWave object or null if not found
     */
    getStandardWaveform(waveformType) {
        return this.standardWaveforms.get(waveformType) || null;
    }


    /**
     * Create an oscillator with the specified parameters
     * @param {number} frequency - Oscillator frequency
     * @param {string|PeriodicWave} waveform - Waveform type or PeriodicWave
     * @param {number} gain - Oscillator gain (0-1)
     * @param {Object} options - { pan, channel } for stereo/multichannel
     * @returns {Object} Object containing oscillator, gain node, and (optional) panner
     */
    createOscillator(frequency, waveform, gain = 1.0, options = {}) {
        if (!this.isInitialized) {
            throw new Error("AudioEngine must be initialized before creating oscillators");
        }

        // External-source voice: options.source (a shared AudioNode) feeds
        // the chain through a per-voice tap instead of an oscillator. The
        // voice keeps its frequency identity — the gate worklet and the
        // pitch-tracking lowpass still use it, so an external signal plays
        // through a filter bank tuned to the overtone series.
        let oscillator = null;
        let sourceTap = null;
        const gainNode = this.context.createGain();

        if (options.source) {
            sourceTap = this.context.createGain();
            options.source.connect(sourceTap);
        } else {
            oscillator = this.context.createOscillator();

            // Set frequency
            oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);

            // Set waveform
            if (typeof waveform === 'string') {
                if (waveform === 'sine') {
                    oscillator.type = 'sine';
                } else if (this.standardWaveforms.has(waveform)) {
                    oscillator.setPeriodicWave(this.standardWaveforms.get(waveform));
                } else {
                    throw new Error(`Unknown waveform type: ${waveform}`);
                }
            } else if (waveform instanceof PeriodicWave) {
                oscillator.setPeriodicWave(waveform);
            } else {
                throw new Error("Waveform must be a string or PeriodicWave");
            }
        }

        // Set gain
        gainNode.gain.setValueAtTime(gain, this.context.currentTime);

        // Per-voice ADSR gain, ahead of the drawbar gain so meters and the
        // drive stage follow the envelope. Created for every voice: unity in
        // Open mode, closed at rest in ADSR mode — trigger methods ramp it.
        const envNode = this.context.createGain();
        envNode.gain.setValueAtTime(options.envelopeOpen === false ? 0 : 1, this.context.currentTime);

        // Per-voice cycle gate (rhythmic muting) — created for every voice
        // so gating can be enabled mid-playback without rewiring
        let gateNode = null;
        if (this.gateWorkletReady) {
            // Output 0: gated audio; 1: cutoff CV (Hz delta); 2: resonance
            // CV; 3: convolution wet CV; 4: convolution feedback CV
            gateNode = new AudioWorkletNode(this.context, 'overtone-gate', {
                numberOfOutputs: 5,
                outputChannelCount: [1, 1, 1, 1, 1],
            });
            gateNode.parameters.get('frequency').setValueAtTime(frequency, this.context.currentTime);
            this.applyGateParams(gateNode, options.gate);
            gateNode.parameters.get('pulseOut').setValueAtTime(options.pulseOut ? 1 : 0, this.context.currentTime);
            this.applySequencerParams(gateNode, options.sequencer);
        }

        // Per-voice overdrive between gate and filter — created for every
        // voice (null curve = clean passthrough) so drive can be enabled
        // mid-playback without rewiring
        const driveNode = this.context.createWaveShaper();
        driveNode.oversample = '4x';
        driveNode.curve = AudioEngine.driveCurve(options.drive);

        // Per-voice lowpass after the gate
        const filterNode = this.context.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(options.filter?.cutoff > 0 ? options.filter.cutoff : 20000, this.context.currentTime);
        filterNode.Q.setValueAtTime(options.filter?.q ?? 0.707, this.context.currentTime);

        // Per-voice level meter: parallel tap after gate + filter, so UI
        // indicators show what the voice actually contributes (including
        // sequencer gating). Read via getFloatTimeDomainData.
        const meter = this.context.createAnalyser();
        meter.fftSize = 256;
        filterNode.connect(meter);

        // Per-voice convolution stage after the lowpass — created for every
        // voice so it can be enabled mid-playback without rewiring. "Off" is
        // passthrough: dry 1, wet 0, no IR buffer (a bufferless convolver is
        // silent). Wet path: convolver → convGain (0..1) → duck → convSum →
        // convWet (mix). Feedback is a delay line around the wet signal:
        // convSum → convDelay → convFb (−0.99..0.99) → convSum. Negative
        // feedback inverts every recirculation (alternating-sign passes:
        // the comb moves to odd multiples of half the loop rate). The loop
        // deliberately excludes the convolver — Chrome does not process a
        // signal that reaches a ConvolverNode through a cycle.
        const conv = options.convolution || {};
        const convolver = this.context.createConvolver();
        convolver.normalize = true;
        if (conv.buffer) convolver.buffer = conv.buffer;
        const convDry = this.context.createGain();
        const convWet = this.context.createGain();
        const convGain = this.context.createGain();
        const convSum = this.context.createGain();
        const convFb = this.context.createGain();
        // Wet CV also drives dry by −1 so the mix stays complementary
        const convWetInv = this.context.createGain();
        convWetInv.gain.setValueAtTime(-1, this.context.currentTime);
        // Duck on the wet output, ahead of the loop entry: ramped out around
        // IR buffer swaps (a swap restarts the convolver with a
        // discontinuity that the feedback loop would otherwise repeat)
        const convDuck = this.context.createGain();
        // Feedback loops must contain a DelayNode or Web Audio silences the
        // cycle. The delay equals the IR's duration, so each pass replays
        // the convolved cycle right after the previous one — the loop is a
        // resonator at the timbre's own period (see convDelayTime).
        const convDelay = this.context.createDelay(AudioEngine.CONV_MAX_DELAY);
        convDelay.delayTime.setValueAtTime(AudioEngine.loopDelayTime(conv.delay, this.context), this.context.currentTime);
        convDry.gain.setValueAtTime(1 - (conv.wet ?? 0), this.context.currentTime);
        convWet.gain.setValueAtTime(conv.wet ?? 0, this.context.currentTime);
        convGain.gain.setValueAtTime(conv.gain ?? 1, this.context.currentTime);
        convFb.gain.setValueAtTime(conv.feedback ?? 0, this.context.currentTime);

        // Always stereo: use StereoPannerNode per oscillator
        const panner = this.context.createStereoPanner();
        panner.pan.setValueAtTime(options.pan ?? 0, this.context.currentTime);

        // osc → env → gain → [gate] → drive → lowpass → convolution → pan → bus
        (oscillator || sourceTap).connect(envNode);
        envNode.connect(gainNode);
        if (gateNode) {
            gainNode.connect(gateNode);
            gateNode.connect(driveNode, 0);
            // Audio-rate modulation: CV outputs sum into the filter's
            // AudioParams (the params keep holding the base values)
            gateNode.connect(filterNode.frequency, 1);
            gateNode.connect(filterNode.Q, 2);
            gateNode.connect(convWet.gain, 3);
            gateNode.connect(convWetInv, 3);
            convWetInv.connect(convDry.gain);
            gateNode.connect(convFb.gain, 4);
            gateNode.parameters.get('baseWet').setValueAtTime(conv.wet ?? 0, this.context.currentTime);
            gateNode.parameters.get('baseFb').setValueAtTime(conv.feedback ?? 0, this.context.currentTime);
        } else {
            gainNode.connect(driveNode);
        }
        driveNode.connect(filterNode);
        filterNode.connect(convDry);
        convDry.connect(panner);
        filterNode.connect(convolver);
        convolver.connect(convGain);
        convGain.connect(convDuck);
        convDuck.connect(convSum);
        convSum.connect(convWet);
        convWet.connect(panner);
        convSum.connect(convDelay);
        convDelay.connect(convFb);
        convFb.connect(convSum);
        panner.connect(this.compressor);

        return {
            oscillator, sourceTap, sourceNode: options.source || null,
            envNode, gainNode, gateNode, driveNode, filterNode,
            convolver, convDry, convWet, convGain, convSum, convFb, convDelay, convWetInv, convDuck,
            panner, meter,
        };
    }

    /** Longest feedback delay (IR duration) the stage supports, seconds. */
    static CONV_MAX_DELAY = 10;

    /**
     * Swap a voice's IR without a click: duck the wet output (and so the
     * loop entry) to silence, assign the buffer once the ramp has landed,
     * then ramp back. Swaps arriving mid-duck coalesce onto the latest
     * buffer. The timer only postpones the swap — if the main thread is
     * throttled the duck just lasts longer; nothing audible depends on it
     * firing on time.
     */
    _swapConvolverBuffer(oscData, buffer) {
        oscData.pendingConvBuffer = buffer;
        if (oscData.convSwapTimer) return;
        // Rate-limit: assigning ConvolverNode.buffer allocates fresh FFT
        // state (large for long IRs); a fundamental glide would otherwise
        // do it every 10 cents on every voice. Wait out the interval first,
        // then duck, swap to the latest pending buffer, and ramp back.
        const wait = Math.max(0, (oscData.lastConvSwap ?? -Infinity) + AudioEngine.CONV_SWAP_MIN_MS - performance.now());
        oscData.convSwapTimer = setTimeout(() => {
            const now = this.context.currentTime;
            const duck = oscData.convDuck.gain;
            duck.cancelScheduledValues(now);
            duck.setTargetAtTime(0, now, AudioEngine.CONV_DUCK_TAU);
            oscData.convSwapTimer = setTimeout(() => {
                oscData.convSwapTimer = null;
                if (!oscData.convolver) return; // torn down meanwhile
                oscData.convolver.buffer = oscData.pendingConvBuffer;
                oscData.pendingConvBuffer = undefined;
                oscData.lastConvSwap = performance.now();
                const t = this.context.currentTime;
                duck.cancelScheduledValues(t);
                duck.setTargetAtTime(1, t, AudioEngine.CONV_DUCK_UP_TAU);
            }, AudioEngine.CONV_DUCK_MS);
        }, wait);
    }

    /** Minimum interval between IR assignments on one voice (ms). */
    static CONV_SWAP_MIN_MS = 120;

    // Duck timing is tuned to be barely perceptible: ~1 ms out (−40 dB by
    // 5 ms), the swap once two render quanta have passed, ~2 ms back —
    // about a 12 ms dip in total.
    static CONV_DUCK_TAU = 0.001;
    static CONV_DUCK_UP_TAU = 0.002;
    static CONV_DUCK_MS = 6;

    /**
     * DelayNode time for a wanted loop period in seconds. A DelayNode inside
     * a cycle carries one extra render quantum of latency (the feedback
     * edge is read from the previous quantum), so that quantum is
     * subtracted; the floor is the quantum itself.
     */
    static loopDelayTime(seconds, context) {
        const quantum = 128 / context.sampleRate;
        const target = (seconds || 0) - quantum;
        return Math.min(AudioEngine.CONV_MAX_DELAY, Math.max(quantum, target));
    }

    /**
     * Update a running voice's convolution stage. `buffer` (an AudioBuffer
     * or null) swaps the IR; `delay` is the feedback loop period in seconds;
     * gains ramp to avoid zipper noise.
     */
    updateOscillatorConvolution(key, { wet, feedback, gain, buffer, delay } = {}, rampTime = 0.02) {
        const oscData = this.oscillators.get(key);
        if (!oscData || !oscData.convolver) return;
        const now = this.context.currentTime;
        const tau = rampTime / 3;
        if (wet !== undefined) {
            oscData.convDry.gain.setTargetAtTime(1 - wet, now, tau);
            oscData.convWet.gain.setTargetAtTime(wet, now, tau);
            oscData.gateNode?.parameters.get('baseWet').setTargetAtTime(wet, now, tau);
        }
        if (feedback !== undefined) {
            oscData.convFb.gain.setTargetAtTime(feedback, now, tau);
            oscData.gateNode?.parameters.get('baseFb').setTargetAtTime(feedback, now, tau);
        }
        if (gain !== undefined) oscData.convGain.gain.setTargetAtTime(gain, now, tau);
        if (buffer !== undefined && (oscData.pendingConvBuffer ?? oscData.convolver.buffer) !== buffer) {
            this._swapConvolverBuffer(oscData, buffer);
        }
        if (delay !== undefined) {
            oscData.convDelay.delayTime.setTargetAtTime(AudioEngine.loopDelayTime(delay, this.context), now, tau);
        }
    }

    /**
     * Gate a running voice's ADSR on: ramp to full over the attack, then
     * down to the sustain level over the decay. Holds at sustain until
     * triggerOscillatorRelease.
     */
    triggerOscillatorAttack(key, { a, d, s }) {
        const oscData = this.oscillators.get(key);
        if (!oscData || !oscData.envNode) return;
        const gain = oscData.envNode.gain;
        const now = this.context.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        const attackEnd = now + Math.max(0.001, a);
        gain.linearRampToValueAtTime(1, attackEnd);
        gain.linearRampToValueAtTime(Math.max(0, Math.min(1, s)), attackEnd + Math.max(0.001, d));
    }

    /** Gate a running voice's ADSR off: ramp to silence over the release. */
    triggerOscillatorRelease(key, { r }) {
        const oscData = this.oscillators.get(key);
        if (!oscData || !oscData.envNode) return;
        const gain = oscData.envNode.gain;
        const now = this.context.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0, now + Math.max(0.001, r));
    }

    /**
     * Envelope-mode switch for a running voice: open pins the envelope at
     * unity (organ behavior), closed rests it at silence awaiting triggers.
     */
    /**
     * Instantaneous envelope level (0..1) of a voice — follows attack,
     * decay, and release ramps. 0 for unknown voices.
     * @param {string} key - Oscillator key
     * @returns {number}
     */
    getOscillatorEnvelopeLevel(key) {
        const oscData = this.oscillators.get(key);
        return oscData?.envNode ? oscData.envNode.gain.value : 0;
    }

    setOscillatorEnvelopeOpen(key, open, rampTime = 0.02) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.envNode) {
            const now = this.context.currentTime;
            oscData.envNode.gain.cancelScheduledValues(now);
            oscData.envNode.gain.setTargetAtTime(open ? 1 : 0, now, rampTime / 3);
        }
    }

    /**
     * Instantaneous peak level (0-1) of a running voice, post gate/filter.
     */
    getVoiceLevel(key) {
        const oscData = this.oscillators.get(key);
        if (!oscData || !oscData.meter) return 0;
        if (!this._meterBuffer || this._meterBuffer.length !== oscData.meter.fftSize) {
            this._meterBuffer = new Float32Array(oscData.meter.fftSize);
        }
        oscData.meter.getFloatTimeDomainData(this._meterBuffer);
        let peak = 0;
        for (let i = 0; i < this._meterBuffer.length; i++) {
            const a = Math.abs(this._meterBuffer[i]);
            if (a > peak) peak = a;
        }
        return Math.min(1, peak);
    }

    /** Set the cycle-gate parameters on a gate worklet node. */
    applyGateParams(gateNode, gate = {}) {
        const now = this.context.currentTime;
        gateNode.parameters.get('mode').setValueAtTime(gate.mode ?? 0, now);
        gateNode.parameters.get('x').setValueAtTime(gate.x ?? 1, now);
        gateNode.parameters.get('y').setValueAtTime(gate.y ?? 1, now);
        if (gate.seq !== undefined) {
            // Arbitrary 0/1 patterns can't travel as AudioParams
            gateNode.port.postMessage({ type: 'sequence', steps: gate.seq });
        }
    }

    /** Update the cycle gate of a running voice. */
    updateOscillatorGate(key, gate) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.gateNode) {
            this.applyGateParams(oscData.gateNode, gate);
        }
    }

    /**
     * Set sequencer shape/amounts/config on a gate worklet node.
     * seq: { shape (0-5), amounts: {gain, freq, res, wet, fb}, table?, config? }
     * config: { ratios: number[], baseStep } for the cutoff CV curve.
     */
    applySequencerParams(gateNode, seq) {
        if (!seq) return;
        const now = this.context.currentTime;
        if (seq.shape !== undefined) gateNode.parameters.get('shape').setValueAtTime(seq.shape, now);
        if (seq.stretch !== undefined) gateNode.parameters.get('stretch').setValueAtTime(seq.stretch, now);
        if (seq.amounts) {
            gateNode.parameters.get('amtGain').setValueAtTime(seq.amounts.gain ?? 1, now);
            gateNode.parameters.get('amtFreq').setValueAtTime(seq.amounts.freq ?? 0, now);
            gateNode.parameters.get('amtRes').setValueAtTime(seq.amounts.res ?? 0, now);
            gateNode.parameters.get('amtWet').setValueAtTime(seq.amounts.wet ?? 0, now);
            gateNode.parameters.get('amtFb').setValueAtTime(seq.amounts.fb ?? 0, now);
        }
        if (seq.table !== undefined) {
            gateNode.port.postMessage({ type: 'shapetable', table: seq.table });
        }
        if (seq.config) {
            gateNode.port.postMessage({ type: 'seqconfig', ratios: seq.config.ratios, baseStep: seq.config.baseStep });
        }
    }

    /** Update the sequencer of a running voice. */
    updateOscillatorSequencer(key, seq) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.gateNode) {
            this.applySequencerParams(oscData.gateNode, seq);
        }
    }

    /**
     * Normalized tanh saturation curve for a drive amount (0-5, where 1 is
     * full saturation and higher amounts harden toward a clipper); null for
     * amount 0, which makes the WaveShaper a clean passthrough.
     */
    static driveCurve(amount) {
        if (!(amount > 0)) return null;
        const k = 1 + amount * 29; // gentle warmth → hard clipping
        const norm = Math.tanh(k);
        const curve = new Float32Array(1024);
        for (let i = 0; i < curve.length; i++) {
            const x = (i / (curve.length - 1)) * 2 - 1;
            curve[i] = Math.tanh(k * x) / norm;
        }
        return curve;
    }

    /** Update the overdrive amount (0-1) of a running voice. */
    updateOscillatorDrive(key, amount) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.driveNode) {
            oscData.driveNode.curve = AudioEngine.driveCurve(amount);
        }
    }

    /** Update the stereo pan of a running voice. */
    updateOscillatorPan(key, pan, rampTime = 0.02) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.panner) {
            oscData.panner.pan.setTargetAtTime(pan, this.context.currentTime, rampTime / 3);
        }
    }

    /** Update the lowpass of a running voice; cutoff sweeps use the slew ramp. */
    updateOscillatorFilter(key, filter, rampTime = 0.02) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.filterNode) {
            const now = this.context.currentTime;
            const cutoff = filter.cutoff > 0 ? filter.cutoff : 20000;
            oscData.filterNode.frequency.setTargetAtTime(cutoff, now, rampTime / 3);
            if (filter.q !== undefined) {
                oscData.filterNode.Q.setTargetAtTime(filter.q, now, rampTime / 3);
            }
        }
    }
    // No setRoutingMode needed

    /** Stop and disconnect one voice's node chain. */
    teardownVoice(oscData) {
        clearTimeout(oscData.convSwapTimer);
        oscData.convSwapTimer = null;
        // Fade the voice — and its convolution loop — before cutting it.
        // An abrupt stop is a click, and the feedback loop would repeat
        // that click for as long as it decays.
        const now = this.context.currentTime;
        for (const g of [oscData.gainNode?.gain, oscData.convSum?.gain]) {
            if (!g) continue;
            g.cancelScheduledValues(now);
            g.setTargetAtTime(0, now, AudioEngine.TEARDOWN_TAU);
        }
        if (oscData.oscillator) {
            try {
                oscData.oscillator.stop(now + AudioEngine.TEARDOWN_MS / 1000);
            } catch {
                // Oscillator may already be stopped
            }
        }
        // Unhook after the fade has landed. A throttled timer only delays
        // the cleanup of an already-silent voice.
        setTimeout(() => this._disconnectVoice(oscData), AudioEngine.TEARDOWN_MS);
    }

    /** Voice teardown: ~2 ms fade constant, nodes cut 15 ms later. */
    static TEARDOWN_TAU = 0.002;
    static TEARDOWN_MS = 15;

    _disconnectVoice(oscData) {
        // The shared external source outlives voices — unhook this voice's
        // tap from it so the tap subgraph can be collected
        if (oscData.sourceNode && oscData.sourceTap) {
            try { oscData.sourceNode.disconnect(oscData.sourceTap); } catch { /* already disconnected */ }
        }
        // Worklet processors are kept alive while process() returns true —
        // tell them to die, then unhook the chain so it can be collected
        if (oscData.gateNode) {
            oscData.gateNode.port.postMessage('stop');
        }
        for (const node of [
            oscData.sourceTap, oscData.envNode, oscData.gainNode, oscData.gateNode,
            oscData.driveNode, oscData.filterNode, oscData.convolver, oscData.convDry,
            oscData.convWet, oscData.convGain, oscData.convSum, oscData.convFb, oscData.convDelay, oscData.convWetInv, oscData.convDuck, oscData.panner, oscData.meter,
        ]) {
            try { node?.disconnect(); } catch { /* already disconnected */ }
        }
    }

    /**
     * Add an oscillator to the managed oscillators map
     * @param {string} key - Unique key for the oscillator
     * @param {Object} oscData - Object containing oscillator and gain nodes
     */
    addOscillator(key, oscData) {
        // A voice already registered under this key would be orphaned by the
        // Map overwrite — still connected and sounding, but unreachable by
        // any update (gates, stop). Tear it down first.
        const existing = this.oscillators.get(key);
        if (existing) this.teardownVoice(existing);

        // Start the oscillator (external-source voices have none — the
        // shared source is already running)
        oscData.oscillator?.start(this.context.currentTime);

        // Cycle pulses from the gate worklet → whoever registered onPulse
        // (the pulse bus). Set up here so every voice reports under its key.
        if (oscData.gateNode) {
            oscData.gateNode.port.onmessage = (e) => {
                if (e.data && e.data.type === 'pulse') {
                    this.onPulse?.(key, e.data);
                }
            };
        }

        // Store in oscillators map
        this.oscillators.set(key, oscData);
    }

    /** Enable/disable per-cycle pulse messages from a running voice. */
    updateOscillatorPulse(key, enabled) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.gateNode) {
            oscData.gateNode.parameters.get('pulseOut').setValueAtTime(enabled ? 1 : 0, this.context.currentTime);
        }
    }

    /**
     * Update oscillator frequency with smooth transitions
     * @param {string} key - Oscillator key
     * @param {number} frequency - New frequency
     * @param {number} rampTime - Ramp time in seconds
     */
    updateOscillatorFrequency(key, frequency, rampTime = 0.02) {
        const oscData = this.oscillators.get(key);
        if (!oscData) return;
        const now = this.context.currentTime;
        // External-source voices have no oscillator but keep their frequency
        // identity — the gate clock (and the caller's filter retune) follow it
        oscData.oscillator?.frequency.setTargetAtTime(frequency, now, rampTime / 3);
        if (oscData.gateNode) {
            oscData.gateNode.parameters.get('frequency').setTargetAtTime(frequency, now, rampTime / 3);
        }
    }

    /**
     * Update oscillator gain with smooth transitions
     * @param {string} key - Oscillator key
     * @param {number} gain - New gain value
     * @param {number} rampTime - Ramp time in seconds
     */
    updateOscillatorGain(key, gain, rampTime = 0.02) {
        const oscData = this.oscillators.get(key);
        if (oscData && oscData.gainNode) {
            const now = this.context.currentTime;
            // Apply gain directly with no minimum constraints for proper silence
            oscData.gainNode.gain.setTargetAtTime(gain, now, rampTime / 3);
        }
    }

    /**
     * Update master gain
     * @param {number} gain - New master gain value
     * @param {number} rampTime - Ramp time in seconds
     */
    updateMasterGain(gain, rampTime = 0.02) {
        if (this.masterGain) {
            const now = this.context.currentTime;
            // Apply gain directly with no minimum constraints for proper silence
            this.masterGain.gain.setTargetAtTime(gain, now, rampTime / 3);
        }
    }

    /**
     * Stop all oscillators
     */
    stopAllOscillators() {
        for (const oscData of this.oscillators.values()) {
            this.teardownVoice(oscData);
        }
        this.oscillators.clear();
    }

    /**
     * Get the audio context
     */
    getContext() {
        return this.context;
    }
}