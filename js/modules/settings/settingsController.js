import { MidiSettingsComponent } from './MidiSettingsComponent.js';
import { RecorderSettingsComponent } from './RecorderSettingsComponent.js';
import { surfaceState } from '../surfaces/surfaceState.js';
import { MIDI_OUTPUT_CHANGED, MIDI_PORTS_CHANGED, RECORDER_CHANGED } from '../../events.js';

/**
 * The Settings surface: MIDI routing/mapping and recording settings, two
 * in-place panels inside #settings-control-root. `open(tab)` is what the
 * recorder's ⚙ calls: it switches to the Settings surface on that tab.
 */
export class SettingsController {

    constructor(rootSelector) {
        this.root = document.querySelector(rootSelector);
        if (!this.root) throw new Error(`SettingsController: missing ${rootSelector}`);
        this.midi = new MidiSettingsComponent(this.root.querySelector('#midi-settings'));
        this.recorder = new RecorderSettingsComponent(this.root.querySelector('#recorder-settings'));
    }

    init() {
        this.midi.render();
        this.recorder.render();
        // Port lists arrive after Web MIDI's delayed init and change with
        // devices; the note-out port is also bridged from Max
        document.addEventListener(MIDI_PORTS_CHANGED, () => this.midi.render());
        document.addEventListener(MIDI_OUTPUT_CHANGED, () => this.midi.render());
        document.addEventListener(RECORDER_CHANGED, () => this.recorder.syncChecked());
        this.root.querySelectorAll('.settings-tab').forEach((btn) => {
            btn.addEventListener('click', () => this.selectTab(btn.dataset.tab));
        });
    }

    /** One tab at a time: 'midi' | 'recorder'. */
    selectTab(tab) {
        this.tab = tab === 'recorder' ? 'recorder' : 'midi';
        this.root.querySelector('#midi-settings').hidden = this.tab !== 'midi';
        this.root.querySelector('#recorder-settings').hidden = this.tab !== 'recorder';
        this.root.querySelectorAll('.settings-tab').forEach((btn) => {
            btn.setAttribute('aria-pressed', String(btn.dataset.tab === this.tab));
        });
        this.root.scrollTop = 0;
    }

    /** Show the settings on the given tab ('midi' | 'recorder'). */
    open(tab) {
        surfaceState.show('settings');
        this.selectTab(tab);
    }
}
