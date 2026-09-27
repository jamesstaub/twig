import BaseComponent from '../base/BaseComponent.js';
import { recorderConfig } from '../../appConfig.js';
import { RecordingActions, AUDIO_MODES, MIDI_MODES, TEMPO_MODES, LENGTH_MODES, VIDEO_SIZE_MODES } from '../recording/recordingActions.js';
import { TonewheelFilm, VIDEO_SIZES } from '../recording/videoCapture.js';

const AUDIO_LABELS = { mono: 'Mono', stereo: 'Stereo', multitrack: 'Multitrack (one channel per overtone)' };
const MIDI_LABELS = { single: 'Single channel', multi: 'Multi-channel (a track + channel per overtone)' };
const LENGTH_LABELS = {
    manual: 'Manual — record until stopped',
    loop: 'Sync loop — restart oscillator phases together, stop when they all realign (seamless loop; exact for rational systems, best-effort for irrational)',
};
const VIDEO_SIZE_LABELS = {
    small: `Small — ${VIDEO_SIZES.small} × ${VIDEO_SIZES.small}`,
    medium: `Medium — ${VIDEO_SIZES.medium} × ${VIDEO_SIZES.medium}`,
    large: `Large — ${VIDEO_SIZES.large} × ${VIDEO_SIZES.large}`,
};
const TEMPO_LABELS = {
    fixed: 'Fixed — initial clock tempo only; notes at their recorded time (works in any DAW / Session view)',
    map: 'Tempo map — every clock change as recorded (Ableton: Arrangement-view import, say yes to "import tempo")',
};

/**
 * Recording settings: audio layout of the .wav, channel layout of the
 * .mid, whether the tonewheel is filmed and at what resolution, take
 * length and tempo handling. Applies to the next take. Renders in place on
 * the Settings surface.
 */
export class RecorderSettingsComponent extends BaseComponent {

    radioGroup(name, options, labels, current, onChange, disabled = false) {
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
            input.disabled = disabled;
            input.addEventListener('change', () => input.checked && onChange(value));
            const text = document.createElement('span');
            text.textContent = labels[value];
            row.append(input, text);
            group.appendChild(row);
        }
        return group;
    }

    /**
     * "label ........ [switch]" row. The switch is the app-wide
     * `.toggle-switch`, not a checkbox, so it reads like the navbar's.
     */
    toggleRow(text, on, onChange) {
        const row = document.createElement('label');
        row.className = 'settings-row';
        const label = document.createElement('span');
        label.textContent = text;
        const toggle = document.createElement('div');
        toggle.className = 'toggle-switch rec-video-toggle';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-label', text);
        toggle.classList.toggle('active', on);
        toggle.setAttribute('aria-checked', String(on));
        this.bindEvent(toggle, 'click', () => onChange(!toggle.classList.contains('active')));
        row.append(label, toggle);
        return row;
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

    /**
     * Record Animation + its export resolution. The sizes stay visible and
     * disabled while filming is off, and the whole section is disabled
     * where the runtime has no MediaRecorder (jweb, old webviews).
     */
    videoBody(enabled, size, filmExtension) {
        const body = document.createElement('div');
        body.className = 'rec-video-body';
        const available = filmExtension !== null;
        body.append(
            this.toggleRow('Record Animation', available && enabled,
                (on) => available && RecordingActions.setVideoEnabled(on)),
            this.radioGroup('rec-video-size', VIDEO_SIZE_MODES, VIDEO_SIZE_LABELS, size,
                (v) => RecordingActions.setVideoSize(v), !available || !enabled),
        );
        const hint = document.createElement('p');
        hint.className = 'settings-hint';
        hint.textContent = available
            ? `The tonewheel over the take, written as .${filmExtension}. Larger sizes render the same drawing at more pixels — the on-page wheel is unaffected.`
            : 'This browser cannot record video.';
        body.appendChild(hint);
        return body;
    }

    render() {
        this.teardown();
        this.el.innerHTML = '';
        const { audioMode, midiMode, tempoMode, lengthMode, videoEnabled, videoSize } = recorderConfig;
        const filmExtension = TonewheelFilm.extension();

        const row = document.createElement('div');
        row.className = 'settings-sections';
        row.append(
            this.section('Audio (.wav)', this.radioGroup('rec-audio-mode', AUDIO_MODES, AUDIO_LABELS, audioMode,
                (v) => RecordingActions.setAudioMode(v))),
            this.section('MIDI (.mid)', this.radioGroup('rec-midi-mode', MIDI_MODES, MIDI_LABELS, midiMode,
                (v) => RecordingActions.setMidiMode(v))),
            this.section('Animation', this.videoBody(videoEnabled, videoSize, filmExtension)),
            this.section('Take length', this.radioGroup('rec-length-mode', LENGTH_MODES, LENGTH_LABELS, lengthMode,
                (v) => RecordingActions.setLengthMode(v)), true),
            this.section('Tempo in the .mid', this.radioGroup('rec-tempo-mode', TEMPO_MODES, TEMPO_LABELS, tempoMode,
                (v) => RecordingActions.setTempoMode(v)), true),
        );
        const note = document.createElement('p');
        note.className = 'settings-hint';
        note.textContent = 'One .wav and one .mid per take, sharing a timeline. The beat comes from the overtone set as MIDI clock; the tempo setting applies when you download. An animation is filmed as its own file, with the master audio in it.';
        this.el.append(row, note);
    }

    /** Reflect a mode changed elsewhere without rebuilding. */
    syncChecked() {
        const { audioMode, midiMode, tempoMode, lengthMode, videoEnabled, videoSize } = recorderConfig;
        for (const input of this.qAll('input[name="rec-audio-mode"]')) input.checked = input.value === audioMode;
        for (const input of this.qAll('input[name="rec-midi-mode"]')) input.checked = input.value === midiMode;
        for (const input of this.qAll('input[name="rec-tempo-mode"]')) input.checked = input.value === tempoMode;
        for (const input of this.qAll('input[name="rec-length-mode"]')) input.checked = input.value === lengthMode;
        // Record Animation and its sizes: the switch, and the sizes graying
        // out in place while nothing is being filmed
        const filming = TonewheelFilm.extension() !== null && videoEnabled;
        const toggle = this.q('.rec-video-toggle');
        if (toggle) {
            toggle.classList.toggle('active', filming);
            toggle.setAttribute('aria-checked', String(filming));
        }
        for (const input of this.qAll('input[name="rec-video-size"]')) {
            input.checked = input.value === videoSize;
            input.disabled = !filming;
        }
    }
}
