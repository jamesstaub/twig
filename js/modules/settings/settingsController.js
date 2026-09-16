import { MidiSettingsComponent } from './MidiSettingsComponent.js';
import { RecorderSettingsComponent } from './RecorderSettingsComponent.js';
import { surfaceState } from '../surfaces/surfaceState.js';
import { layoutMode } from '../layout/layoutMode.js';
import { MIDI_OUTPUT_CHANGED, RECORDER_CHANGED } from '../../events.js';

/**
 * The Settings surface: MIDI routing/mapping and recording settings, two
 * in-place panels inside #settings-control-root. `open(section)` is what
 * the navbar's MIDI button and the recorder's ⚙ call: on the surfaces
 * shell it switches to the Settings surface; in the embed band (no
 * surfaces) the root becomes a full-band overlay (body.settings-open,
 * settings.embed.css) with its own close button.
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
        document.addEventListener(MIDI_OUTPUT_CHANGED, () => this.midi.render());
        document.addEventListener(RECORDER_CHANGED, () => this.recorder.syncChecked());
        this.root.querySelector('.settings-close')?.addEventListener('click', () => this.close());
        this.root.querySelectorAll('.settings-tab').forEach((btn) => {
            btn.addEventListener('click', () => this.selectTab(btn.dataset.tab));
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.body.classList.contains('settings-open')) this.close();
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
        if (layoutMode.isEmbed) {
            document.body.classList.add('settings-open');
        } else {
            surfaceState.show('settings');
        }
        this.selectTab(tab);
    }

    /** Embed overlay only — on the surfaces shell, another surface is the way out. */
    close() {
        document.body.classList.remove('settings-open');
    }
}
