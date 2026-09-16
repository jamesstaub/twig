import BaseComponent from '../base/BaseComponent.js';
import { recorderConfig } from '../../appConfig.js';
import { RecordingActions, AUDIO_MODES, MIDI_MODES, TEMPO_MODES, LENGTH_MODES } from '../recording/recordingActions.js';

const AUDIO_LABELS = { mono: 'Mono', stereo: 'Stereo', multitrack: 'Multitrack (one channel per overtone)' };
const MIDI_LABELS = { single: 'Single channel', multi: 'Multi-channel (a track + channel per overtone)' };
const LENGTH_LABELS = {
    manual: 'Manual — record until stopped',
    loop: 'Sync loop — restart oscillator phases together, stop when they all realign (seamless loop; exact for rational systems, best-effort for irrational)',
};
const TEMPO_LABELS = {
    fixed: 'Fixed — initial clock tempo only; notes at their recorded time (works in any DAW / Session view)',
    map: 'Tempo map — every clock change as recorded (Ableton: Arrangement-view import, say yes to "import tempo")',
};

/**
 * Recording settings: audio layout of the .wav, channel layout of the
 * .mid, take length and tempo handling. Applies to the next take.
 * Renders in place on the Settings surface.
 */
export class RecorderSettingsComponent extends BaseComponent {

    radioGroup(name, options, labels, current, onChange) {
        const group = document.createElement('div');
        group.className = 'rec-radio-group';
        for (const value of options) {
            const row = document.createElement('label');
            row.className = 'rec-radio-row';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = name;
            input.value = value;
            input.checked = value === current;
            input.addEventListener('change', () => input.checked && onChange(value));
            const text = document.createElement('span');
            text.textContent = labels[value];
            row.append(input, text);
            group.appendChild(row);
        }
        return group;
    }

    section(title, body, wide = false) {
        const sec = document.createElement('section');
        sec.className = 'settings-section' + (wide ? ' settings-section-wide' : '');
        const heading = document.createElement('div');
        heading.className = 'settings-section-title';
        heading.textContent = title;
        sec.append(heading, body);
        return sec;
    }

    render() {
        this.teardown();
        this.el.innerHTML = '';
        const { audioMode, midiMode, tempoMode, lengthMode } = recorderConfig;

        const row = document.createElement('div');
        row.className = 'settings-sections';
        row.append(
            this.section('Audio (.wav)', this.radioGroup('rec-audio-mode', AUDIO_MODES, AUDIO_LABELS, audioMode,
                (v) => RecordingActions.setAudioMode(v))),
            this.section('MIDI (.mid)', this.radioGroup('rec-midi-mode', MIDI_MODES, MIDI_LABELS, midiMode,
                (v) => RecordingActions.setMidiMode(v))),
            this.section('Take length', this.radioGroup('rec-length-mode', LENGTH_MODES, LENGTH_LABELS, lengthMode,
                (v) => RecordingActions.setLengthMode(v)), true),
            this.section('Tempo in the .mid', this.radioGroup('rec-tempo-mode', TEMPO_MODES, TEMPO_LABELS, tempoMode,
                (v) => RecordingActions.setTempoMode(v)), true),
        );
        const note = document.createElement('p');
        note.className = 'settings-hint';
        note.textContent = 'One .wav and one .mid per take, sharing a timeline. The beat comes from the overtone set as MIDI clock; the tempo setting applies when you download.';
        this.el.append(row, note);
    }

    /** Reflect a mode changed elsewhere without rebuilding. */
    syncChecked() {
        const { audioMode, midiMode, tempoMode, lengthMode } = recorderConfig;
        for (const input of this.qAll('input[name="rec-audio-mode"]')) input.checked = input.value === audioMode;
        for (const input of this.qAll('input[name="rec-midi-mode"]')) input.checked = input.value === midiMode;
        for (const input of this.qAll('input[name="rec-tempo-mode"]')) input.checked = input.value === tempoMode;
        for (const input of this.qAll('input[name="rec-length-mode"]')) input.checked = input.value === lengthMode;
    }
}
