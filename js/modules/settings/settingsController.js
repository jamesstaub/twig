import { MidiSettingsComponent } from './MidiSettingsComponent.js';
import { RecorderSettingsComponent } from './RecorderSettingsComponent.js';
import { FilesSettingsComponent } from '../files/FilesSettingsComponent.js';
import { LIBRARY_CHANGED, MIDI_OUTPUT_CHANGED, MIDI_PORTS_CHANGED, RECORDER_CHANGED, RECORDINGS_CHANGED } from '../../events.js';

/**
 * The Settings surface: MIDI routing/mapping, recording settings and the
 * file manager — panels shown one at a time inside #settings-control-root.
 * Getting here (and building this, which is lazy) is settingsSurface.js.
 */
const TABS = {
    midi: '#midi-settings',
    recorder: '#recorder-settings',
    files: '#files-settings',
};

export class SettingsController {

    constructor(rootSelector) {
        this.root = document.querySelector(rootSelector);
        if (!this.root) throw new Error(`SettingsController: missing ${rootSelector}`);
        this.midi = new MidiSettingsComponent(this.root.querySelector(TABS.midi));
        this.recorder = new RecorderSettingsComponent(this.root.querySelector(TABS.recorder));
        this.files = new FilesSettingsComponent(this.root.querySelector(TABS.files));
    }

    init() {
        this.midi.render();
        this.recorder.render();
        this.files.render();
        // Port lists arrive after Web MIDI's delayed init and change with
        // devices; the note-out port is also bridged from Max
        document.addEventListener(MIDI_PORTS_CHANGED, () => this.midi.render());
        document.addEventListener(MIDI_OUTPUT_CHANGED, () => this.midi.render());
        document.addEventListener(RECORDER_CHANGED, () => this.recorder.syncChecked());
        // The library changes from outside this panel too: a bake, an
        // import, a take
        document.addEventListener(LIBRARY_CHANGED, () => this.files.refresh());
        document.addEventListener(RECORDINGS_CHANGED, () => this.files.refresh());
        this.root.querySelectorAll('.settings-tab').forEach((btn) => {
            btn.addEventListener('click', () => this.selectTab(btn.dataset.tab));
        });
    }

    /** One tab at a time. */
    selectTab(tab) {
        this.tab = TABS[tab] ? tab : 'midi';
        for (const [name, selector] of Object.entries(TABS)) {
            this.root.querySelector(selector).hidden = name !== this.tab;
        }
        // The library gains files from everywhere but here — a bake, an
        // import, a take — so it is re-read whenever it is looked at
        if (this.tab === 'files') this.files.refresh();
        this.root.querySelectorAll('.settings-tab').forEach((btn) => {
            btn.setAttribute('aria-pressed', String(btn.dataset.tab === this.tab));
        });
        this.root.scrollTop = 0;
    }
}
