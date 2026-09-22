import { PresetsComponent } from './PresetsComponent.js';
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
 * The Presets surface (#presets-control-root): loads the banks, mounts
 * the panel, and keeps it in sync — coalesced onto animation frames, since
 * a crossfader sweep changes state at MIDI rate.
 */
export class PresetsController {

    constructor(rootSelector) {
        this.root = document.querySelector(rootSelector);
        if (!this.root) throw new Error(`PresetsController: missing ${rootSelector}`);
        this.component = new PresetsComponent(this.root.querySelector('#presets-panel'));
        this.frame = null;
    }

    init() {
        presetStore.load();
        PresetActions.watch(SOUND_EVENTS);
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
