// Centralized custom event name constants
export const DRAWBAR_CHANGE = 'drawbar-change';
export const DRAWBARS_RANDOMIZED = 'drawbars-randomized';
export const DRAWBARS_RESET = 'drawbars-reset';
export const SPECTRAL_SYSTEM_CHANGED = 'spectral-system-changed';
export const SUBHARMONIC_TOGGLED = 'subharmonic-toggled';
export const ADD_CUSTOM_WAVEFORM = 'add-custom-waveform';
export const ROUTING_MODE_CHANGED = 'routing-mode-changed';
export const FUNDAMENTAL_CHANGED = 'fundamental-changed';
export const PLAY_STATE_CHANGED = 'play-state-changed';
export const MASTER_GAIN_CHANGED = 'master-gain-changed';
export const MASTER_SLEW_CHANGED = 'master-slew-changed';
export const OVERTONE_SIGNAL_CHANGED = 'overtone-signal-changed';
export const ENVELOPE_MODE_CHANGED = 'envelope-mode-changed';
export const MIDI_OUTPUT_CHANGED = 'midi-output-changed';
// The system's MIDI port lists changed (Web MIDI came up, a device was
// plugged) — UI-only, unlike MIDI_OUTPUT_CHANGED which is bridged upstream
export const MIDI_PORTS_CHANGED = 'midi-ports-changed';
export const PULSE = 'overtone-pulse';export const SOURCE_CHANGED = 'source-changed';
export const CONVOLUTION_IRS_CHANGED = 'convolution-irs-changed';
export const IR_RING_CHANGED = 'ir-ring-changed';
export const RECORDER_CHANGED = 'recorder-changed';
export const RECORDINGS_CHANGED = 'recordings-changed';
// Shell (embed | surfaces) or pointer density (coarse) changed — see
// js/modules/layout/layoutMode.js. detail: { shell, coarse }
export const LAYOUT_MODE_CHANGED = 'layout-mode-changed';
// What the shell shows changed (active surface, Source dock, side column)
// — read js/modules/surfaces/surfaceState.js; no detail
export const SURFACE_CHANGED = 'surface-changed';
// The Sequence panel's selected overtone (UI-only) — detail: { index }
export const INSPECTOR_CHANGED = 'inspector-changed';
// The link-all lock toggled (UI-only) — detail: { locked }
export const LINK_ALL_CHANGED = 'link-all-changed';
// Shape mode changed: lock, held shift, contour or cycles (UI-only) — detail: { on, held }
export const SHAPE_MODE_CHANGED = 'shape-mode-changed';
