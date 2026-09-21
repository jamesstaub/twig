/**
 * Pulse → MIDI mapping. What a voice cycle MEANS in MIDI terms — note,
 * velocity, channel, whether it is the beat clock — as pure reads of
 * config/state. Both the live output router (Web MIDI) and the recorder's
 * MIDI capture (file) go through here, so a recorded .mid holds exactly
 * the events external gear received.
 */

import { AppState } from '../../config.js';
import { midiConfig } from '../../appConfig.js';

/** Note blip length: note-off follows note-on this much later. */
export const BLIP_MS = 50;

/**
 * MIDI note for a voice: linear from the configured start — overtone 1
 * sends note 13, overtone 12 note 24 by default. Pulses are triggers, not
 * pitches, so identity beats frequency-matching.
 */
export function noteForVoice(index) {
    return Math.max(0, Math.min(127, midiConfig.pulseNoteStart + index));
}

/** MIDI channel (1-16) the pulse note blips go out on. */
export function pulseChannel() {
    return midiConfig.pulseChannel;
}

/** 1-127 from the overtone's drawbar amplitude; 0 = drawbar silent. */
export function velocityForVoice(index) {
    const amp = AppState.harmonicAmplitudes[index] || 0;
    return amp <= 0.001 ? 0 : Math.max(1, Math.round(amp * 127));
}

/**
 * The note blip a pulse produces, or null when the voice sends none
 * (pulse-MIDI off for the voice, gated-off cycle, silent drawbar).
 * @returns {{note:number, velocity:number, channel:number, durationMs:number}|null}
 */
export function blipForPulse(index, pulse) {
    const midiOn = AppState.oscillatorPulseOuts[index]?.midi ?? midiConfig.pulseMidiEnabled;
    if (!midiOn || !pulse.gateOn) return null;
    const velocity = velocityForVoice(index);
    if (velocity === 0) return null;
    return { note: noteForVoice(index), velocity, channel: pulseChannel(), durationMs: BLIP_MS };
}

/** True when this voice is the configured MIDI beat clock. */
export function isClockVoice(index) {
    return AppState.midiClockVoice === index;
}
