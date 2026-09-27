import {
  CURRENT_WAVEFORM_CHANGED,
  PresetActions,
  presetStore
} from "./chunk-IXPH2EMF.js";
import {
  DRAWBARS_RANDOMIZED,
  DRAWBARS_RESET,
  DRAWBAR_CHANGE,
  ENVELOPE_MODE_CHANGED,
  FUNDAMENTAL_CHANGED,
  IR_RING_CHANGED,
  MASTER_GAIN_CHANGED,
  MASTER_SLEW_CHANGED,
  OVERTONE_SIGNAL_CHANGED,
  PRESETS_CHANGED,
  SOURCE_CHANGED,
  SPECTRAL_SYSTEM_CHANGED,
  SUBHARMONIC_TOGGLED
} from "./chunk-YSWKRLK7.js";

// js/modules/presets/presetsController.js
var SOUND_EVENTS = [
  DRAWBAR_CHANGE,
  DRAWBARS_RANDOMIZED,
  DRAWBARS_RESET,
  ENVELOPE_MODE_CHANGED,
  FUNDAMENTAL_CHANGED,
  IR_RING_CHANGED,
  MASTER_GAIN_CHANGED,
  MASTER_SLEW_CHANGED,
  OVERTONE_SIGNAL_CHANGED,
  SOURCE_CHANGED,
  SPECTRAL_SYSTEM_CHANGED,
  SUBHARMONIC_TOGGLED,
  CURRENT_WAVEFORM_CHANGED
];
function initPresets() {
  presetStore.load();
  PresetActions.watch(SOUND_EVENTS);
}
var PresetsController = class {
  constructor(rootSelector, PresetsComponent) {
    this.root = document.querySelector(rootSelector);
    if (!this.root) throw new Error(`PresetsController: missing ${rootSelector}`);
    this.component = new PresetsComponent(this.root.querySelector("#presets-panel"));
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
};

export {
  initPresets,
  PresetsController
};
