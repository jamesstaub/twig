/**
 * RECORDING ACTIONS — the app-logic layer of the performance recorder.
 *
 * Composes the browser-facing pieces (AudioRecorder, RecordingPlayer,
 * MidiPlayback, downloads) with the pure ones (MidiCapture log → MIDI
 * document → SMF bytes; WAV bytes) and owns the recorder's state in
 * AppState.recorder. Every state change dispatches RECORDER_CHANGED;
 * the take list dispatches RECORDINGS_CHANGED.
 *
 * Alignment contract: the audio take's sample 0 and the MIDI document's
 * time 0 are the same instant on the AudioContext clock — the take starts
 * at a frame the worklet reports, MIDI events are stamped by the gate
 * worklets on that same clock, and master-chain look-ahead latency is
 * trimmed by the recorder. When a clock voice is configured and pulsing,
 * arming waits for its next beat so the take begins ON a beat: bar 1 of
 * the tempo map is the first click.
 */

import { AppState } from '../../config.js';
import { recorderConfig, persistAppConfig } from '../../appConfig.js';
import { RECORDER_CHANGED, RECORDINGS_CHANGED } from '../../events.js';
import { initAudio, getAudioEngine, getFrequencyCorrection, startTone, stopTone } from '../../audio.js';
import { calculateFrequency } from '../../utils.js';
import { showStatus } from '../../domUtils.js';
import { AudioRecorder } from '../../dsp/AudioRecorder.js';
import { RecordingPlayer } from '../../dsp/RecordingPlayer.js';
import { WAVExporter } from '../../dsp/WAVExporter.js';
import { encodeMidiFile } from '../../dsp/midiFile.js';
import { buildZip } from '../../dsp/zipStore.js';
import { choosePeriodMultiplier } from '../../dsp/PartialSpectrum.js';
import { pulseBus } from '../pulse/pulseBus.js';
import { pulseCycleBoundaryAudioTime } from '../pulse/pulseTime.js';
import { isClockVoice } from '../midi/pulseMidi.js';
import { MidiCapture } from './midiCapture.js';
import { buildMidiDocument } from './midiDocument.js';
import { midiPlayback } from './midiPlayback.js';
import { recordingStore } from './RecordingStore.js';

export const AUDIO_MODES = ['mono', 'stereo', 'multitrack'];
export const MIDI_MODES = ['single', 'multi'];
export const TEMPO_MODES = ['fixed', 'map'];
export const LENGTH_MODES = ['manual', 'loop'];

// Arming waits this long for a clock beat before starting unaligned
const ARM_TIMEOUT_MS = 3000;
// Voices above this don't emit pulses (gate worklet PULSE_MAX_HZ)
const PULSE_MAX_HZ = 50;
// Playback starts this far ahead so audio and MIDI schedule to one instant
const PLAY_LEAD_S = 0.08;
// Sync loop: longest realignment period worth waiting for, and the lead
// given to rebuild the voice bank before its shared scheduled start
const SYNC_MAX_SECONDS = 300;
const SYNC_MAX_PERIOD = 4096;
const SYNC_LEAD_S = 0.15;
// Loops at most this long capture the SECOND realignment period (a cheap
// wait that keeps the master chain's restart transient out of the loop);
// longer ones record from the restart itself — sitting "armed" through a
// long first period reads as a hang
const SYNC_SETTLE_MAX_S = 2;

const capture = new MidiCapture();
let recorder = null;
let takeStart = null;
let takeFrequencies = [];  // per-voice Hz at the take's start
let arm = null;            // { unsubscribe, timer, started }
let player = null;
let playerKey = null;

function setRecorder(patch) {
    Object.assign(AppState.recorder, patch);
    document.dispatchEvent(new CustomEvent(RECORDER_CHANGED, { detail: { ...AppState.recorder } }));
}

/** Recorder configuration changes: persisted locally (see appConfig.js). */
function setConfig(patch) {
    Object.assign(recorderConfig, patch);
    persistAppConfig();
    document.dispatchEvent(new CustomEvent(RECORDER_CHANGED, { detail: { ...recorderConfig } }));
}

function clearArm() {
    if (!arm) return;
    arm.unsubscribe?.();
    clearTimeout(arm.timer);
    arm = null;
}

/**
 * Sync-loop plan: the shortest time in which every oscillator returns to
 * phase 0 together — P fundamental periods, P from the same period
 * selector the wavetable bake uses (exact for rational systems, snapped
 * within tolerance otherwise; the residual is the audible seam). A custom
 * wavetable's own period multiplier is folded in via the frequency
 * correction, since its table spans several fundamental periods.
 * @returns {{periods: number, duration: number|null}|null} null = sync not
 *   applicable; duration null = no realignment within reach (record
 *   open-ended from the phase-aligned restart instead)
 */
function syncLoopPlan() {
    const f0 = AppState.fundamentalFrequency;
    if (AppState.sourceMode !== 'oscillators' || !(f0 > 0)) return null;
    const correction = getFrequencyCorrection(AppState.currentWaveform);
    const ratios = AppState.currentSystem.ratios.filter((r) => r > 0).map((r) => r * correction);
    if (ratios.length === 0) return null;
    const maxPeriod = Math.max(1, Math.min(SYNC_MAX_PERIOD, Math.floor(SYNC_MAX_SECONDS * f0)));
    const periods = choosePeriodMultiplier(ratios, maxPeriod);
    const duration = periods / f0;
    return { periods, duration: duration <= SYNC_MAX_SECONDS ? duration : null };
}

/** A clock voice is playing and slow enough to pulse — worth waiting for. */
function clockWillPulse() {
    const index = AppState.midiClockVoice;
    if (!AppState.isPlaying || index == null) return false;
    const ratio = AppState.currentSystem.ratios[index];
    return ratio > 0 && calculateFrequency(ratio) <= PULSE_MAX_HZ;
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function formatDuration(seconds) {
    const s = Math.round(seconds);
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

function fileStamp(date) {
    return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-` +
        `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

/** Store a finished take (manual stop or a sync loop's auto end). */
function finalizeTake(take) {
    const log = capture.stop();
    recorder = null;
    setRecorder({ status: 'idle' });
    if (!take || take.duration <= 0) return;

    const number = recordingStore.nextNumber();
    const base = `twig-rec-${pad2(number)}-${fileStamp(new Date())}`;
    const midi = buildMidiDocument(log, take, { midiMode: recorderConfig.midiMode, name: base });
    const key = recordingStore.add({
        name: `rec ${number} (${formatDuration(take.duration)})`,
        base,
        audioMode: recorderConfig.audioMode,
        audio: { sampleRate: take.sampleRate, channels: take.channels },
        voiceFrequencies: takeFrequencies.slice(0, take.channels.length),
        midi,
        duration: take.duration,
    });
    document.dispatchEvent(new CustomEvent(RECORDINGS_CHANGED, { detail: { key } }));
    RecordingActions.select(key);
    showStatus(`Recorded ${formatDuration(take.duration)} — ${take.channels.length} ch audio, ${midi.tracks.reduce((n, t) => n + t.notes.length, 0)} MIDI notes`, 'success');
}

function selectedRecording() {
    return recordingStore.get(AppState.recorder.selected);
}

/** Build (or reuse) the player for the selected recording. */
function ensurePlayer(recording) {
    if (player && playerKey === recording.key) return player;
    player?.stop();
    const ctx = AppState.audioContext;
    const engine = getAudioEngine();
    // Master takes already went through the master chain: straight out.
    // Stems are pre-chain: mix them down and run the sum through the live
    // compressor → master → limiter so they sound as they did.
    const take = recording.audioMode === 'multitrack'
        ? { sampleRate: recording.audio.sampleRate, channels: [RecordingPlayer.mixdown(recording.audio.channels)] }
        : recording.audio;
    const destination = recording.audioMode === 'multitrack' ? engine.compressor : ctx.destination;
    player = new RecordingPlayer(ctx, destination, take);
    player.onEnded = () => {
        midiPlayback.stop();
        setRecorder({ transport: 'stopped' });
    };
    playerKey = recording.key;
    return player;
}

/**
 * One shared export gain for a set of stems. Stems are tapped BEFORE the
 * master compressor/limiter, and a resonant filter bank adds 20-30 dB at
 * its peaks, so raw stem samples routinely exceed full scale. The float
 * WAVs store those overs faithfully, but a DAW plays them clipped at
 * 0 dBFS — a huge clipped sine reads as a raw square. Scaling every stem
 * by the same factor puts the take's loudest peak at exactly full scale
 * while keeping the stems' relative balance (and, being gain-only, the
 * audio/MIDI alignment). Takes that already fit are left untouched.
 */
function stemExportGain(channels) {
    let peak = 0;
    for (const data of channels) {
        for (let i = 0; i < data.length; i++) {
            const a = Math.abs(data[i]);
            if (a > peak) peak = a;
        }
    }
    return peak > 1 ? 1 / peak : 1;
}

/** "82.41Hz.wav" per stem — duplicates get a numeric suffix to stay distinct. */
function stemNames(frequencies, count) {
    const seen = new Map();
    return Array.from({ length: count }, (_, i) => {
        const hz = frequencies[i];
        let stem = hz > 0 ? `${hz.toFixed(2).replace(/\.?0+$/, '')}Hz` : `overtone-${i + 1}`;
        const n = (seen.get(stem) || 0) + 1;
        seen.set(stem, n);
        if (n > 1) stem += `_${n}`;
        return `${stem}.wav`;
    });
}

export const RecordingActions = {

    setAudioMode(mode) {
        if (AUDIO_MODES.includes(mode)) setConfig({ audioMode: mode });
    },

    setMidiMode(mode) {
        if (MIDI_MODES.includes(mode)) setConfig({ midiMode: mode });
    },

    /** Applies at export time, so an existing take can be re-downloaded either way. */
    setTempoMode(mode) {
        if (TEMPO_MODES.includes(mode)) setConfig({ tempoMode: mode });
    },

    setLengthMode(mode) {
        if (LENGTH_MODES.includes(mode)) setConfig({ lengthMode: mode });
    },

    /** Record button: idle → arm/start; armed or recording → stop. */
    async toggleRecord() {
        if (AppState.recorder.status === 'idle') await this.startRecording();
        else await this.stopRecording();
    },

    async startRecording() {
        if (AppState.recorder.status !== 'idle') return;
        await initAudio();
        const engine = getAudioEngine();
        if (!engine.recorderReady) {
            showStatus('Recording is unavailable in this browser', 'error');
            return;
        }
        const ctx = AppState.audioContext;
        const { audioMode } = recorderConfig;
        const taps = engine.recordingTaps(audioMode, AppState.currentSystem.ratios.length);
        recorder = new AudioRecorder(ctx);
        takeStart = null;
        capture.start();
        setRecorder({ status: 'armed' });

        const begin = (atTime) => {
            if (!arm || arm.started) return;
            arm.started = true;
            clearArm();
            // Stem identity: each overtone's frequency as the take begins
            // (it may glide later — the name records where it started)
            takeFrequencies = AppState.currentSystem.ratios.map((r) => calculateFrequency(r));
            recorder.start({ ...taps, atTime }).then((startTime) => {
                takeStart = startTime;
                if (AppState.recorder.status === 'armed') setRecorder({ status: 'recording' });
            });
        };
        arm = { started: false, unsubscribe: null, timer: null };
        if (recorderConfig.lengthMode === 'loop') {
            const plan = syncLoopPlan();
            if (plan) {
                await this._startSyncLoop(recorder, taps, plan);
                return;
            }
            showStatus('Sync loop needs the oscillators source — recording until stopped', 'warning');
        }
        if (clockWillPulse()) {
            // Start exactly on the clock voice's next cycle boundary
            arm.unsubscribe = pulseBus.addSink((index, pulse) => {
                if (!isClockVoice(index)) return;
                const beat = pulseCycleBoundaryAudioTime(pulse);
                if (beat > ctx.currentTime) begin(beat);
            });
            arm.timer = setTimeout(() => begin(null), ARM_TIMEOUT_MS);
        } else {
            begin(null);
        }
    },

    /**
     * Sync loop: rebuild the voice bank so every oscillator starts at
     * phase 0 on one shared frame (t0), then capture exactly one
     * realignment period T. Short loops (≤ SYNC_SETTLE_MAX_S) capture the
     * SECOND period — t0+T .. t0+2T — keeping the master chain's restart
     * transient out; longer ones record the first, starting the moment
     * the bank restarts. No reachable T at all (stubborn irrational
     * stack): record open-ended from t0 until stopped — the phases were
     * still resynced at sample 0. Timed takes' end frames are enforced on
     * the audio thread (sample-exact) and land through onEnded.
     */
    async _startSyncLoop(active, taps, plan) {
        clearArm();
        const ctx = AppState.audioContext;
        if (AppState.isPlaying) stopTone();
        const t0 = ctx.currentTime + SYNC_LEAD_S;
        await startTone({ startAt: t0 });
        takeFrequencies = AppState.currentSystem.ratios.map((r) => calculateFrequency(r));
        active.onEnded = (take) => {
            if (recorder === active) finalizeTake(take);
        };
        let atTime = t0;
        let endTime = null;
        if (plan.duration == null) {
            showStatus(`Sync: phases restarted — no realignment within ${SYNC_MAX_SECONDS / 60} min, recording until stopped`, 'warning');
        } else {
            const settle = plan.duration <= SYNC_SETTLE_MAX_S ? 1 : 0;
            atTime = t0 + settle * plan.duration;
            endTime = atTime + plan.duration;
            showStatus(`Sync loop: ${plan.duration.toFixed(3)} s (${plan.periods} × fundamental period)`, 'info');
        }
        active.start({ ...taps, atTime, endTime }).then((startTime) => {
            takeStart = startTime;
            if (recorder === active && AppState.recorder.status === 'armed') setRecorder({ status: 'recording' });
        });
    },

    async stopRecording() {
        const status = AppState.recorder.status;
        if (status === 'idle' || !recorder) return;
        clearArm();
        const active = recorder;
        const take = active.recording ? await active.stop() : null;
        finalizeTake(take);
    },



    // ---- Transport ----------------------------------------------------

    select(key) {
        if (key === AppState.recorder.selected) return;
        this.reset();
        setRecorder({ selected: recordingStore.get(key) ? key : null });
    },

    selectStep(step) {
        const list = recordingStore.list();
        if (list.length === 0) return;
        const current = recordingStore.indexOf(AppState.recorder.selected);
        const next = ((current < 0 ? 0 : current + step) + list.length) % list.length;
        this.select(list[next].key);
    },

    async play() {
        const recording = selectedRecording();
        if (!recording || AppState.recorder.transport === 'playing') return;
        await initAudio();
        const p = ensurePlayer(recording);
        const offset = p.offset;
        const at = AppState.audioContext.currentTime + PLAY_LEAD_S;
        p.play(offset, at);
        midiPlayback.start(recording.midi, offset, at);
        setRecorder({ transport: 'playing' });
    },

    pause() {
        if (AppState.recorder.transport !== 'playing') return;
        player?.stop();
        midiPlayback.stop();
        setRecorder({ transport: 'paused' });
    },

    togglePlay() {
        if (AppState.recorder.transport === 'playing') this.pause();
        else this.play();
    },

    reset() {
        player?.stop();
        if (player) player.offset = 0;
        midiPlayback.stop();
        if (AppState.recorder.transport !== 'stopped') setRecorder({ transport: 'stopped' });
    },

    /**
     * Seconds recorded so far, on the audio clock (0 while idle or armed —
     * a sync loop's capture window may still lie ahead of "now").
     */
    recordingElapsed() {
        if (AppState.recorder.status !== 'recording' || takeStart == null || !AppState.audioContext) return 0;
        return Math.max(0, AppState.audioContext.currentTime - takeStart);
    },

    /** Playback position in seconds (0 when nothing is loaded). */
    position() {
        return player && playerKey === AppState.recorder.selected ? player.position() : 0;
    },

    // ---- Export -------------------------------------------------------

    downloadWav() {
        const recording = selectedRecording();
        if (!recording) return;
        // Multitrack takes are pre-master stems — normalize (see stemExportGain);
        // mono/stereo takes are the finished master and stay untouched
        const gain = recording.audioMode === 'multitrack' ? stemExportGain(recording.audio.channels) : 1;
        const bytes = WAVExporter.createWAVBufferMulti(recording.audio.channels, recording.audio.sampleRate, { float: true, gain });
        WAVExporter.downloadFile(bytes, `${recording.base}.wav`, 'audio/wav');
    },

    /**
     * Multitrack takes only: a .zip of one mono 32-bit-float .wav per
     * overtone, each named by the voice's frequency at recording start.
     */
    downloadStems() {
        const recording = selectedRecording();
        if (!recording || recording.audioMode !== 'multitrack') return;
        const names = stemNames(recording.voiceFrequencies || [], recording.audio.channels.length);
        const gain = stemExportGain(recording.audio.channels);
        const entries = recording.audio.channels.map((channel, i) => ({
            name: `${recording.base}/${names[i]}`,
            data: new Uint8Array(WAVExporter.createWAVBufferMulti([channel], recording.audio.sampleRate, { float: true, gain })),
        }));
        // The matching MIDI rides along so the bundle drops into a DAW whole
        entries.push({
            name: `${recording.base}/${recording.base}.mid`,
            data: encodeMidiFile(recording.midi, { fixedTempo: recorderConfig.tempoMode === 'fixed' }),
        });
        WAVExporter.downloadFile(buildZip(entries, new Date()), `${recording.base}-stems.zip`, 'application/zip');
    },

    downloadMidi() {
        const recording = selectedRecording();
        if (!recording) return;
        const bytes = encodeMidiFile(recording.midi, { fixedTempo: recorderConfig.tempoMode === 'fixed' });
        WAVExporter.downloadFile(bytes, `${recording.base}.mid`, 'audio/midi');
    },
};
