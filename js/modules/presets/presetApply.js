/**
 * PRESET APPLY — write a whole snapshot to the app in one pass.
 *
 * The actions layer sets one parameter at a time and dispatches an event
 * per write; a preset recall or a crossfader step changes hundreds at
 * once, so this is the one bulk path. It diffs the snapshot against the
 * live sound (capture()) and, for what changed:
 *
 *   1. writes AppState,
 *   2. FAST: pushes every continuous parameter of every running voice
 *      straight to the engine — pitch, level, cutoff/Q, drive, pan, send
 *      levels — so a crossfader swept from a MIDI CC lands on the audio
 *      thread at the CC's own rate,
 *   3. DEFERRED (coalesced onto the next animation frame — or run now
 *      with `immediate`): the structural work — the voice bank sync on a
 *      system change, IR retunes, gate/sequencer messages, a restart on
 *      a source change — and the UI events, once each, so
 *      views and the bridge follow at frame rate. Only the last snapshot
 *      of a frame is worked; the intermediate ones already sounded.
 *
 * AppState is written in full on every call; only the audio and the
 * events are diffed.
 */

import { AppState, setCurrentSystem, updateAppState } from '../../config.js';
import {
    getWavetableManager, harmonicFilterCutoff, harmonicWaveformPayload, restartAudio,
    updateAllHarmonicEnvelopeModes, updateAudioProperties, updateHarmonicConvolution, updateHarmonicFilter,
    updateHarmonicGate, updateHarmonicSequencer,
} from '../../audio.js';
import { audioEngine } from '../../dsp/engine/AudioEngine.js';
import { irManager } from '../../dsp/IRManager.js';
import { calculateFrequency, freqToMidi } from '../../utils.js';
import {
    DRAWBARS_RESET, ENVELOPE_MODE_CHANGED, FUNDAMENTAL_CHANGED, IR_RING_CHANGED, MASTER_GAIN_CHANGED,
    MASTER_SLEW_CHANGED, OVERTONE_SIGNAL_CHANGED, SOURCE_CHANGED, SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED,
} from '../../events.js';
import { CURRENT_WAVEFORM_CHANGED } from '../waveform/waveformActions.js';
import { capture, INTERPOLATED_SYSTEM, waveformName } from './presetSchema.js';

/** Per-voice snapshot keys → the OVERTONE_SIGNAL_CHANGED kind their views refresh on. */
const VOICE_KINDS = { gate: 'gate', filter: 'filter', drive: 'drive', convolution: 'conv', envelope: 'envelope', sequencer: 'seq', pan: 'pan' };

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let deferred = null; // work + events gathered for the next frame
let frame = null;

// A crossfade between two systems changes the ratio table every step. The
// views that rebuild on SPECTRAL_SYSTEM_CHANGED (the strip, the pads) are
// too heavy for frame rate, so while the system stays "interpolated" the
// event is held to this cadence, with a trailing dispatch so the last
// table always lands.
const SYSTEM_EVENT_MIN_MS = 150;
let lastSystemEvent = -Infinity;
let systemEventTimer = null;

/**
 * @param {Object} next - A sanitized snapshot (presetSchema.sanitize)
 * @param {Object} [opts]
 * @param {boolean} [opts.immediate=false] - Run the deferred pass now (a recall)
 * @param {number} [opts.ramp] - Audio smoothing in seconds (default: the master slew)
 */
export function applySnapshot(next, { immediate = false, ramp } = {}) {
    const prev = capture();
    const diff = diffSnapshots(prev, next);

    writeAppState(next, diff);
    if (AppState.isPlaying) writeAudioFast(next, diff, ramp ?? next.masterSlew);

    deferred = mergeDeferred(deferred, diff, prev);
    if (immediate) {
        cancelAnimationFrame(frame);
        frame = null;
        flush();
    } else if (frame === null) {
        frame = requestAnimationFrame(() => { frame = null; flush(); });
    }
}

// ---------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------

function diffSnapshots(prev, next) {
    const d = {
        fundamental: prev.fundamental !== next.fundamental,
        subharmonic: prev.subharmonic !== next.subharmonic,
        system: !same(prev.system, next.system),
        masterGain: prev.masterGain !== next.masterGain,
        masterSlew: prev.masterSlew !== next.masterSlew,
        waveform: !same(prev.waveform, next.waveform),
        // The menu shows the name, or "Interpolated" while a morph is on
        waveformName: waveformName(prev.waveform) !== waveformName(next.waveform)
            || (typeof prev.waveform === 'string') !== (typeof next.waveform === 'string'),
        source: !same(prev.source, next.source),
        envelopeMode: prev.envelopeMode !== next.envelopeMode,
        irRingSeconds: prev.irRingSeconds !== next.irRingSeconds,
        amplitudes: false,
        voices: [], // per index: Set of changed keys
    };
    const n = Math.max(prev.voices.length, next.voices.length);
    for (let i = 0; i < n; i++) {
        const a = prev.voices[i];
        const b = next.voices[i];
        const changed = new Set();
        if (!a || !b) {
            for (const key of Object.keys(VOICE_KINDS)) changed.add(key);
            changed.add('amplitude');
        } else {
            if (a.amplitude !== b.amplitude) changed.add('amplitude');
            for (const key of Object.keys(VOICE_KINDS)) if (!same(a[key], b[key])) changed.add(key);
        }
        if (changed.has('amplitude')) d.amplitudes = true;
        d.voices[i] = changed;
    }
    return d;
}

// ---------------------------------------------------------------------
// 1. AppState
// ---------------------------------------------------------------------

function writeAppState(s, diff) {
    const midi = Math.min(127, Math.round(freqToMidi(s.fundamental)));
    updateAppState({
        fundamentalFrequency: s.fundamental,
        currentMidiNote: midi,
        currentOctave: Math.floor(midi / 12) - 1,
        isSubharmonic: s.subharmonic,
        startHarmonic: s.system.startHarmonic,
        stiffnessB: s.system.stiffnessB,
        tubeClosedness: s.system.tubeClosedness,
        stretchA: s.system.stretchA,
        compressA: s.system.compressA,
        masterGainValue: s.masterGain,
        masterSlewValue: s.masterSlew,
        currentWaveform: resolveWaveform(waveformName(s.waveform)),
        waveformMorph: typeof s.waveform === 'string' ? null
            : { a: resolveWaveform(s.waveform.a), b: resolveWaveform(s.waveform.b), t: s.waveform.t },
        sourceMode: s.source.mode,
        adcDeviceId: s.source.adcDeviceId,
        adcChannel: s.source.adcChannel,
        soundfileLoop: s.source.soundfile.loop,
        soundfileRange: Array.isArray(s.source.soundfile.range) && s.source.soundfile.range.length === 2 ? [...s.source.soundfile.range] : null,
        soundfileFundamental: s.source.soundfile.fundamental,
        envelopeMode: s.envelopeMode,
        irRingSeconds: s.irRingSeconds,
    });
    if (diff.system) {
        if (s.system.index === INTERPOLATED_SYSTEM) {
            AppState.currentSystemIndex = INTERPOLATED_SYSTEM;
            AppState.currentSystem = interpolatedSystem(s.system.ratios);
        } else {
            setCurrentSystem(s.system.index);
        }
    }

    // The amplitude store is grow-only: keep at least the system's count
    const count = Math.max(s.voices.length, AppState.currentSystem.ratios.length);
    const amps = [];
    const pans = [];
    const gates = {};
    const filters = {};
    const drives = {};
    const convolutions = {};
    const envelopes = {};
    const sequencers = {};
    for (let i = 0; i < count; i++) {
        const v = s.voices[i];
        amps[i] = v?.amplitude || 0;
        if (!v) continue;
        pans[i] = v.pan;
        gates[i] = { ...v.gate, seq: [...v.gate.seq] };
        filters[i] = { ...v.filter };
        drives[i] = v.drive;
        convolutions[i] = { ...v.convolution, ir: v.convolution.ir && irManager.get(v.convolution.ir) ? v.convolution.ir : null };
        envelopes[i] = { ...v.envelope };
        sequencers[i] = { shape: v.sequencer.shape, stretch: v.sequencer.stretch, amounts: { ...v.sequencer.amounts } };
    }
    updateAppState({
        harmonicAmplitudes: amps,
        oscillatorPans: pans,
        oscillatorGates: gates,
        oscillatorFilters: filters,
        oscillatorDrives: drives,
        oscillatorConvolutions: convolutions,
        oscillatorEnvelopes: envelopes,
        oscillatorSequencers: sequencers,
    });
}

/** A baked wave the session no longer has plays as a sine. */
function resolveWaveform(name) {
    if (!name.startsWith('custom_')) return name;
    return getWavetableManager()?.getWaveform(name) ? name : 'sine';
}

function interpolatedSystem(ratios) {
    return {
        name: 'Interpolated',
        description: 'Overtone frequencies interpolated between presets A and B — every voice glides from one system’s partial to the other’s.',
        ratios: [...ratios],
        labels: ratios.map((r) => (r >= 100 ? r.toFixed(1) : r.toFixed(3))),
    };
}

// ---------------------------------------------------------------------
// 2. fast audio
// ---------------------------------------------------------------------

function writeAudioFast(s, diff, ramp) {
    if (diff.masterGain) audioEngine.master.setGain(s.masterGain, ramp);
    const pitchChanged = diff.fundamental || diff.subharmonic || diff.system;
    // One wave pair for the bank; each voice's slots fade onto it
    const waveform = diff.waveform && s.source.mode === 'oscillators' ? harmonicWaveformPayload() : undefined;
    const ratios = AppState.currentSystem.ratios;

    for (const [i, voice] of audioEngine.voices) {
        const v = s.voices[i];
        const changed = diff.voices[i];
        if (!v || !changed || i >= ratios.length) continue;
        const params = {};
        const frequency = calculateFrequency(ratios[i]);
        if (waveform) params.waveform = waveform;
        if (pitchChanged) params.frequency = frequency;
        if (changed.has('amplitude') || diff.masterGain) params.gain = v.amplitude * s.masterGain;
        if (pitchChanged || changed.has('filter')) {
            params.filter = { cutoff: harmonicFilterCutoff(i, frequency), q: v.filter.q };
        }
        if (changed.has('drive')) params.drive = v.drive;
        if (changed.has('pan')) params.pan = v.pan;
        if (changed.has('convolution')) {
            // Levels only; the IR and loop period follow in the deferred pass
            const c = v.convolution;
            const bypassed = !AppState.oscillatorConvolutions[i]?.ir;
            params.convolution = bypassed ? { gain: c.gain } : { wet: c.wet, feedback: c.feedback, gain: c.gain };
        }
        if (Object.keys(params).length) voice.set(params, ramp);
    }
}

// ---------------------------------------------------------------------
// 3. deferred: structure + events
// ---------------------------------------------------------------------

function mergeDeferred(acc, diff, prev) {
    const d = acc || { flags: {}, voices: new Map(), fromInterpolated: prev.system.index === INTERPOLATED_SYSTEM };
    for (const key of Object.keys(diff)) if (diff[key] === true) d.flags[key] = true;
    diff.voices.forEach((changed, i) => {
        if (changed.size === 0) return;
        const set = d.voices.get(i) || new Set();
        for (const key of changed) set.add(key);
        d.voices.set(i, set);
    });
    return d;
}

function flush() {
    const d = deferred;
    deferred = null;
    if (!d) return;
    const f = d.flags;
    const playing = AppState.isPlaying;

    if (playing) {
        if (f.source) {
            // A new head for every voice: rebuild the bank from AppState
            restartAudio();
        } else {
            // Voice count, IR pitch and sequencer curves follow the system
            if (f.fundamental || f.subharmonic || f.system) updateAudioProperties();
            for (const [i, changed] of d.voices) {
                if (changed.has('gate')) updateHarmonicGate(i);
                if (changed.has('filter')) updateHarmonicFilter(i);
                if (changed.has('convolution')) updateHarmonicConvolution(i);
                if (changed.has('sequencer')) updateHarmonicSequencer(i);
            }
            if (f.envelopeMode) updateAllHarmonicEnvelopeModes();
        }
    }

    const dispatch = (name, detail) => document.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));
    if (f.fundamental) dispatch(FUNDAMENTAL_CHANGED);
    if (f.subharmonic) dispatch(SUBHARMONIC_TOGGLED, { isSubharmonic: AppState.isSubharmonic });
    if (f.system) dispatchSystemChanged(d.fromInterpolated && AppState.currentSystemIndex === INTERPOLATED_SYSTEM);
    if (f.masterGain) dispatch(MASTER_GAIN_CHANGED, { value: AppState.masterGainValue });
    if (f.masterSlew) dispatch(MASTER_SLEW_CHANGED, { value: AppState.masterSlewValue });
    if (f.waveformName) dispatch(CURRENT_WAVEFORM_CHANGED, { currentWaveform: AppState.currentWaveform });
    if (f.source) dispatch(SOURCE_CHANGED, { sourceMode: AppState.sourceMode });
    if (f.envelopeMode) dispatch(ENVELOPE_MODE_CHANGED);
    if (f.irRingSeconds) dispatch(IR_RING_CHANGED);
    // The strip re-reads every column on a reset; the bridge resends the set
    if (f.amplitudes && !f.system) dispatch(DRAWBARS_RESET);
    for (const [index, changed] of d.voices) {
        for (const key of changed) {
            if (VOICE_KINDS[key]) dispatch(OVERTONE_SIGNAL_CHANGED, { index, kind: VOICE_KINDS[key] });
        }
    }
}

function dispatchSystemChanged(throttle) {
    const now = performance.now();
    if (throttle && now - lastSystemEvent < SYSTEM_EVENT_MIN_MS) {
        if (systemEventTimer === null) {
            systemEventTimer = setTimeout(() => { systemEventTimer = null; dispatchSystemChanged(false); }, SYSTEM_EVENT_MIN_MS - (now - lastSystemEvent));
        }
        return;
    }
    clearTimeout(systemEventTimer);
    systemEventTimer = null;
    lastSystemEvent = now;
    // No index while interpolated: the bridge can't name that system
    const index = AppState.currentSystemIndex;
    const detail = index === INTERPOLATED_SYSTEM ? { system: AppState.currentSystem } : { index, system: AppState.currentSystem };
    document.dispatchEvent(new CustomEvent(SPECTRAL_SYSTEM_CHANGED, { detail }));
}
