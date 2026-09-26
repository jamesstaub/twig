/**
 * AUDITION — hearing a library file without playing it.
 *
 * Straight into the context's destination, past the voices and the master
 * chain: a preview must be audible while the synth is stopped, and must
 * not be caught by a recording in progress. One at a time — starting
 * another stops the first — and every start and stop reports through
 * `onChange` so a row's ▶ can become ■.
 */

import { initAudio } from '../../audio.js';
import { audioEngine } from '../../dsp/engine/AudioEngine.js';

/** Ramp in and out, so a preview of a raw table isn't two clicks. */
const FADE_SECONDS = 0.01;
/** A waveform has no length of its own; this is how long its note is held. */
const WAVE_SECONDS = 1.5;
const WAVE_LEVEL = 0.25;

let active = null; // { id, node, gain }

export const audition = {
    /** The entry id sounding right now, or null. */
    get playing() {
        return active?.id ?? null;
    },

    /** Called whenever `playing` changes. */
    onChange: null,

    /** Play a decoded buffer (a sound file or a take's first channel). */
    async playBuffer(id, buffer) {
        const ctx = await context();
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        start(id, node, ctx, buffer.duration, 1);
    },

    /** Play raw samples at the rate they were made at (an IR). */
    async playSamples(id, samples, sampleRate) {
        const ctx = await context();
        const buffer = ctx.createBuffer(1, samples.length, sampleRate);
        buffer.copyToChannel(samples, 0);
        return this.playBuffer(id, buffer);
    },

    /**
     * Sound a baked waveform as a note. Its table spans `periodMultiplier`
     * fundamental periods, so the oscillator runs that much slower to play
     * the pitch asked for — the same correction the voices make.
     */
    async playWave(id, periodicWave, frequency, periodMultiplier = 1) {
        const ctx = await context();
        const node = ctx.createOscillator();
        node.setPeriodicWave(periodicWave);
        node.frequency.value = Math.max(0.01, frequency / (periodMultiplier || 1));
        start(id, node, ctx, WAVE_SECONDS, WAVE_LEVEL);
    },

    stop() {
        if (!active) return;
        const { node, gain } = active;
        const ctx = audioEngine.context;
        active = null;
        const end = ctx.currentTime + FADE_SECONDS;
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, end);
        try { node.stop(end); } catch { /* already ended */ }
        node.onended = null;
        setTimeout(() => { node.disconnect(); gain.disconnect(); }, FADE_SECONDS * 2000);
        audition.onChange?.();
    },
};

async function context() {
    await initAudio();
    audition.stop();
    return audioEngine.context;
}

function start(id, node, ctx, seconds, level) {
    const gain = ctx.createGain();
    const at = ctx.currentTime;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + FADE_SECONDS);
    gain.gain.setValueAtTime(level, at + Math.max(FADE_SECONDS, seconds - FADE_SECONDS));
    gain.gain.linearRampToValueAtTime(0, at + seconds);
    node.connect(gain).connect(ctx.destination);
    node.start(at);
    node.stop(at + seconds);
    node.onended = () => {
        if (active?.node !== node) return;
        active = null;
        gain.disconnect();
        audition.onChange?.();
    };
    active = { id, node, gain };
    audition.onChange?.();
}
