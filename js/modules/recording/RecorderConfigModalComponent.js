import ModalComponent from '../generic/modal/ModalComponent.js';
import { AppState } from '../../config.js';
import { RECORDER_CHANGED } from '../../events.js';
import { RecordingActions, AUDIO_MODES, MIDI_MODES, TEMPO_MODES } from './recordingActions.js';

const AUDIO_LABELS = { mono: 'Mono', stereo: 'Stereo', multitrack: 'Multitrack (one channel per overtone)' };
const MIDI_LABELS = { single: 'Single channel', multi: 'Multi-channel (a track + channel per overtone)' };
const TEMPO_LABELS = {
    fixed: 'Fixed — initial clock tempo only; notes at their recorded time (works in any DAW / Session view)',
    map: 'Tempo map — every clock change as recorded (Ableton: Arrangement-view import, say yes to "import tempo")',
};

/**
 * RecorderConfigModalComponent — recording settings: audio layout of the
 * .wav and channel layout of the .mid. Applies to the next take.
 */
export class RecorderConfigModalComponent extends ModalComponent {

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
            // Plain listener: ModalComponent.render() tears down bound events
            // first, and these inputs are discarded with the dialog anyway
            input.addEventListener('change', () => input.checked && onChange(value));
            const text = document.createElement('span');
            text.textContent = labels[value];
            row.append(input, text);
            group.appendChild(row);
        }
        return group;
    }

    section(title, body) {
        const sec = document.createElement('section');
        sec.className = 'midi-section';
        const heading = document.createElement('div');
        heading.className = 'midi-section-title';
        heading.textContent = title;
        sec.append(heading, body);
        return sec;
    }

    render(props = {}) {
        const { audioMode, midiMode, tempoMode } = AppState.recorder;
        const content = document.createElement('div');
        content.className = 'midi-modal rec-config-modal';
        const title = document.createElement('h2');
        title.className = 'midi-modal-title';
        title.textContent = 'Recording';
        const row = document.createElement('div');
        row.className = 'midi-sections-row';
        row.append(
            this.section('Audio (.wav)', this.radioGroup('rec-audio-mode', AUDIO_MODES, AUDIO_LABELS, audioMode,
                (v) => RecordingActions.setAudioMode(v))),
            this.section('MIDI (.mid)', this.radioGroup('rec-midi-mode', MIDI_MODES, MIDI_LABELS, midiMode,
                (v) => RecordingActions.setMidiMode(v))),
        );
        const tempo = this.section('Tempo in the .mid', this.radioGroup('rec-tempo-mode', TEMPO_MODES, TEMPO_LABELS, tempoMode,
            (v) => RecordingActions.setTempoMode(v)));
        tempo.classList.add('midi-section-wide');
        const note = document.createElement('p');
        note.className = 'rec-config-note';
        note.textContent = 'One .wav and one .mid per take, sharing a timeline. The beat comes from the overtone set as MIDI clock; the tempo setting applies when you download.';
        content.append(title, row, tempo, note);
        super.render({ content, onClose: props.onClose });

        this._escHandler = (e) => { if (e.key === 'Escape') props.onClose?.(); };
        document.addEventListener('keydown', this._escHandler);
        this._syncHandler = () => this.syncChecked();
        document.addEventListener(RECORDER_CHANGED, this._syncHandler);
    }

    /** Reflect a mode changed elsewhere without rebuilding the dialog. */
    syncChecked() {
        const { audioMode, midiMode, tempoMode } = AppState.recorder;
        for (const input of this.qAll('input[name="rec-audio-mode"]')) input.checked = input.value === audioMode;
        for (const input of this.qAll('input[name="rec-midi-mode"]')) input.checked = input.value === midiMode;
        for (const input of this.qAll('input[name="rec-tempo-mode"]')) input.checked = input.value === tempoMode;
    }

    teardown() {
        if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
        if (this._syncHandler) document.removeEventListener(RECORDER_CHANGED, this._syncHandler);
        this._escHandler = null;
        this._syncHandler = null;
        super.teardown();
    }
}
