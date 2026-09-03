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
import { RECORDER_CHANGED, RECORDINGS_CHANGED } from '../../events.js';
import { initAudio, getAudioEngine } from '../../audio.js';
import { calculateFrequency } from '../../utils.js';
import { showStatus } from '../../domUtils.js';
import { AudioRecorder } from '../../dsp/AudioRecorder.js';
import { RecordingPlayer } from '../../dsp/RecordingPlayer.js';
import { WAVExporter } from '../../dsp/WAVExporter.js';
import { encodeMidiFile } from '../../dsp/midiFile.js';
import { buildZip } from '../../dsp/zipStore.js';
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

// Arming waits this long for a clock beat before starting unaligned
const ARM_TIMEOUT_MS = 3000;
// Voices above this don't emit pulses (gate worklet PULSE_MAX_HZ)
const PULSE_MAX_HZ = 50;
// Playback starts this far ahead so audio and MIDI schedule to one instant
const PLAY_LEAD_S = 0.08;

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

function clearArm() {
    if (!arm) return;
    arm.unsubscribe?.();
    clearTimeout(arm.timer);
    arm = null;
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
        if (!AUDIO_MODES.includes(mode) || AppState.recorder.audioMode === mode) return;
        setRecorder({ audioMode: mode });
    },

    setMidiMode(mode) {
        if (!MIDI_MODES.includes(mode) || AppState.recorder.midiMode === mode) return;
        setRecorder({ midiMode: mode });
    },

    /** Applies at export time, so an existing take can be re-downloaded either way. */
    setTempoMode(mode) {
        if (!TEMPO_MODES.includes(mode) || AppState.recorder.tempoMode === mode) return;
        setRecorder({ tempoMode: mode });
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
        const { audioMode } = AppState.recorder;
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

    async stopRecording() {
        const status = AppState.recorder.status;
        if (status === 'idle' || !recorder) return;
        clearArm();
        const log = capture.stop();
        const active = recorder;
        recorder = null;
        const take = active.recording ? await active.stop() : null;
        setRecorder({ status: 'idle' });
        if (!take || take.duration <= 0) return;

        const number = recordingStore.nextNumber();
        const base = `twig-rec-${pad2(number)}-${fileStamp(new Date())}`;
        const midi = buildMidiDocument(log, take, { midiMode: AppState.recorder.midiMode, name: base });
        const key = recordingStore.add({
            name: `rec ${number} (${formatDuration(take.duration)})`,
            base,
            audioMode: AppState.recorder.audioMode,
            audio: { sampleRate: take.sampleRate, channels: take.channels },
            voiceFrequencies: takeFrequencies.slice(0, take.channels.length),
            midi,
            duration: take.duration,
        });
        document.dispatchEvent(new CustomEvent(RECORDINGS_CHANGED, { detail: { key } }));
        this.select(key);
        showStatus(`Recorded ${formatDuration(take.duration)} — ${take.channels.length} ch audio, ${midi.tracks.reduce((n, t) => n + t.notes.length, 0)} MIDI notes`, 'success');
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

    /** Playback position in seconds (0 when nothing is loaded). */
    position() {
        return player && playerKey === AppState.recorder.selected ? player.position() : 0;
    },

    // ---- Export -------------------------------------------------------

    downloadWav() {
        const recording = selectedRecording();
        if (!recording) return;
        const bytes = WAVExporter.createWAVBufferMulti(recording.audio.channels, recording.audio.sampleRate, { float: true });
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
        const entries = recording.audio.channels.map((channel, i) => ({
            name: `${recording.base}/${names[i]}`,
            data: new Uint8Array(WAVExporter.createWAVBufferMulti([channel], recording.audio.sampleRate, { float: true })),
        }));
        WAVExporter.downloadFile(buildZip(entries, new Date()), `${recording.base}-stems.zip`, 'application/zip');
    },

    downloadMidi() {
        const recording = selectedRecording();
        if (!recording) return;
        const bytes = encodeMidiFile(recording.midi, { fixedTempo: AppState.recorder.tempoMode === 'fixed' });
        WAVExporter.downloadFile(bytes, `${recording.base}.mid`, 'audio/midi');
    },
};
