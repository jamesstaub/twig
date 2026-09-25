import { PresetActions } from './presetActions.js';
import { presetStore } from './presetStore.js';
import {
    DRAWBAR_CHANGE, DRAWBARS_RANDOMIZED, DRAWBARS_RESET, ENVELOPE_MODE_CHANGED, FUNDAMENTAL_CHANGED,
    IR_RING_CHANGED, MASTER_GAIN_CHANGED, MASTER_SLEW_CHANGED, OVERTONE_SIGNAL_CHANGED, PRESETS_CHANGED,
    SOURCE_CHANGED, SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED,
} from '../../events.js';
import { CURRENT_WAVEFORM_CHANGED } from '../waveform/waveformActions.js';

/** Every event a change to the SOUND dispatches — what can make a loaded preset dirty. */
const SOUND_EVENTS = [
    DRAWBAR_CHANGE, DRAWBARS_RANDOMIZED, DRAWBARS_RESET, ENVELOPE_MODE_CHANGED, FUNDAMENTAL_CHANGED,
    IR_RING_CHANGED, MASTER_GAIN_CHANGED, MASTER_SLEW_CHANGED, OVERTONE_SIGNAL_CHANGED, SOURCE_CHANGED,
    SPECTRAL_SYSTEM_CHANGED, SUBHARMONIC_TOGGLED, CURRENT_WAVEFORM_CHANGED,
];

/**
 * The banks and the dirty tracking, loaded at boot: a MIDI crossfader or a
 * bridged recall must work whether or not the panel has ever been opened.
 * The PANEL itself is a separate, lazily mounted module (mountPresetsPanel).
 */
export function initPresets() {
    presetStore.load();
    PresetActions.watch(SOUND_EVENTS);
}

/**
 * The Presets surface (#presets-control-root): mounts the panel and keeps
 * it in sync — coalesced onto animation frames, since a crossfader sweep
 * changes state at MIDI rate.
 */
export class PresetsController {

    constructor(rootSelector, PresetsComponent) {
        this.root = document.querySelector(rootSelector);
        if (!this.root) throw new Error(`PresetsController: missing ${rootSelector}`);
        this.component = new PresetsComponent(this.root.querySelector('#presets-panel'));
        this.frame = null;
    }

    init() {
        this.component.render();
        document.addEventListener(PRESETS_CHANGED, () => this.scheduleSync());
    }

    scheduleSync() {
        if (this.frame !== null) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = null;
            this.component.sync();
        });
    }
}
