/**
 * UI MODULE
 * Mounts every controller, wires cross-module callbacks (so modules stay
 * decoupled — a strip never imports the inspector), and hosts the few
 * body-level bits of presentation that don't belong to one panel.
 */

import { AppState, updateAppState } from './config.js';
import { midiConfig } from './appConfig.js';
import { MASTER_SLEW_CHANGED, ENVELOPE_MODE_CHANGED, SURFACE_CHANGED } from './events.js';
import { OvertoneSignalActions } from './modules/overtoneSignal/overtoneSignalActions.js';
import { updateValue } from './domUtils.js';
import { DrawbarsController } from './modules/drawbars/drawbarsController.js';
import { SpectralSystemController } from './modules/spectralSystem/spectralSystemController.js';
import { WaveformController } from './modules/waveform/waveformController.js';
import { DownloadControlController } from './modules/downloadControl/downloadControlController.js';
import { KeyboardShortcuts } from './KeyboardShortcuts.js';
import { TonewheelController } from './modules/tonewheel/tonewheelController.js';
import { smoothUpdateMasterGain } from './utils.js';
import { SliderController } from './modules/generic/slider/sliderController.js';
import { midiInputRouter } from './modules/midi/midiInputRouter.js';
import { FundamentalController } from './modules/fundamental/fundamentalController.js';
import { PlayToggleController } from './modules/playToggle/playToggleController.js';
import { WaveformSelectorController } from './modules/waveformSelector/waveformSelectorController.js';
import { oscClient, oscEnabled } from './modules/osc/oscClient.js';
import { initLinkAll, linkLock } from './modules/generic/linkAll.js';
import { initShapeMode, shapeMode } from './modules/shape/shapeMode.js';
import { OvertoneToolbarController } from './modules/overtoneToolbar/overtoneToolbarController.js';
import { pulseBus } from './modules/pulse/pulseBus.js';
import { midiOutputRouter } from './modules/midi/midiOutputRouter.js';
import { setPulseHandler } from './audio.js';
import { SourceController } from './modules/source/sourceController.js';
import { SpectrumController } from './modules/spectrum/spectrumController.js';
import { ScopeController } from './modules/scope/scopeController.js';
import { EnvelopeVizController } from './modules/envelopeViz/envelopeVizController.js';
import { RecorderController } from './modules/recording/recorderController.js';
import { SurfacesController } from './modules/surfaces/surfacesController.js';
import { SURFACES } from './modules/surfaces/surfaceState.js';
import { InspectorController } from './modules/inspector/inspectorController.js';
import { PadGridController } from './modules/pads/padGridController.js';
import { SettingsController } from './modules/settings/settingsController.js';
import { EnvelopeModeController } from './modules/envelopeMode/envelopeModeController.js';
import { inspectorState } from './modules/inspector/inspectorState.js';

let settingsController;

export function initUI() {
    setupMainButtons();
    setupControlSliders();

    setupWaveformSelector();
    setupSelectSteppers();

    setupDrawbars();
    setupSpectralSystem();
    setupVisualizations();
    setupFundamental();
    setupSurfaces();

    // Initialize keyboard shortcuts
    new KeyboardShortcuts().init();

    // Cmd/Ctrl = link (an edit goes to every voice), Shift = shape (an
    // edit sculpts every voice along a contour)
    initLinkAll();
    initShapeMode();

    // OSC over WebSocket: the remote-control path for jweb/Max4Live, where
    // Web MIDI delivery is starved while the view is hidden (?osc=0 disables).
    // The shared instance was already bootstrapped with cached state by app.js.
    if (oscEnabled()) {
        oscClient.init();
    }

    setupPulseOutputs();

    setTimeout(() => {
        // if midi is firing while the components are still rendering it breaks the p5 sketch :-/
        midiInputRouter.init();
        midiOutputRouter.init(); // no-op where Web MIDI is unavailable (jweb)
    }, 2000);
}

/**
 * Voice cycle pulses (gate worklets) → pulse bus → MIDI / OSC / JS.
 * OSC relay sends only audible (gate-open) cycles, matching what you hear.
 */
function setupPulseOutputs() {
    setPulseHandler((key, pulse) => pulseBus.dispatch(key, pulse));
    pulseBus.addSink((index, pulse) => {
        const oscOn = AppState.oscillatorPulseOuts[index]?.osc ?? midiConfig.pulseOscEnabled;
        if (oscOn && pulse.gateOn) {
            oscClient.emitPulse(index, pulse);
        }
    });
}

function setupDrawbars() {
    const drawbarsController = new DrawbarsController("#drawbars");
    drawbarsController.onInspect = (index) => inspectorState.open(index);
    drawbarsController.init();
    // The strip's bottom bar: reset/randomize act on the showing family
    new OvertoneToolbarController('#drawbars-toolbar', {
        onReset: () => drawbarsController.reset(),
        onRandomize: () => drawbarsController.randomize(),
    }).init();
}

function setupSpectralSystem() {
    new SpectralSystemController("#spectral-system-root").init();
    new TonewheelController("#tonewheel-container").init();
}

/** The side-column visualizations, one per parameter surface. */
function setupVisualizations() {
    // Gain: the summed wavetable + bake/export actions
    new WaveformController("#waveform-canvas-area").init();
    new DownloadControlController("#routing-control-root").init();
    // Filter: the live output
    new ScopeController("#scope-canvas-area").init();
    // Convolution: the spectrum (Create IR bakes it) — see setupWaveformSelector
    // ADSR: every voice's envelope
    new EnvelopeVizController("#envelope-canvas-area").init();
}

function setupFundamental() {
    new FundamentalController("#fundamental-control-root").init();
    // Trigger surface: one pad per overtone
    const padGridController = new PadGridController('#pad-grid');
    padGridController.onInspect = (index) => inspectorState.open(index);
    padGridController.init();
}

function setupSurfaces() {
    // After every panel is mounted (and its canvases sized while visible),
    // so the shell can hide the ones the default surface doesn't show
    new SurfacesController('#surface-toolbar', '.page-content', '#surface-side-toggle').init();
    // The Sequence panel's bottom bar: reset/randomize act on every
    // voice's gate; its slot carries the inspector's voice stepper
    const sequenceToolbar = new OvertoneToolbarController('#sequence-toolbar', {
        onReset: () => OvertoneSignalActions.resetGates(),
        onRandomize: () => OvertoneSignalActions.randomizeGates(),
    });
    sequenceToolbar.init();
    // The per-overtone sequence editor: Sequence surface or the sheet
    // beside any other
    new InspectorController('#inspector-sheet', '#sequence-inspector', sequenceToolbar.slotEl).init();
    // Link and shape are tools of the per-overtone surfaces: leaving them
    // drops both
    document.addEventListener(SURFACE_CHANGED, (e) => {
        if (SURFACES.find((s) => s.id === e.detail?.active)?.tools) return;
        shapeMode.reset();
        linkLock.set(false);
    });
    // Settings surface (MIDI + recording) — the recorder's ⚙ lands here
    settingsController = new SettingsController('#settings-control-root');
    settingsController.init();
}

function setupMainButtons() {
    new PlayToggleController('.play-toggle-container').init();
    setupEnvelopeMode();
    const recorder = new RecorderController('#recorder-root');
    recorder.onOpenSettings = () => settingsController?.open('recorder');
    recorder.init();
}

/**
 * Trigger/Drone mode: Drone = every voice sounds freely; Trigger = voices
 * rest silent and are gated per overtone (pads, Q-] keys, the strip's
 * trigger pads). The switch lives in the navbar; body.adsr-mode drives
 * the strip pads' visibility in CSS.
 */
function setupEnvelopeMode() {
    new EnvelopeModeController('#navbar-mode-root').init();
    const sync = () => {
        document.body.classList.toggle('adsr-mode', OvertoneSignalActions.getEnvelopeMode() === 'adsr');
    };
    document.addEventListener(ENVELOPE_MODE_CHANGED, sync);
    sync(); // bootstrap may have applied a bridged mode before init
}

function setupControlSliders() {
    // Master Gain Slider
    new SliderController('#master-gain-slider-root', {
        min: 0,
        max: 1,
        step: 0.01,
        value: AppState.masterGainValue,
        label: 'Gain',
        formatValue: (v) => `${(v * 100).toFixed(0)}%`,
    }, (value) => {
        smoothUpdateMasterGain(value);
    }).init();

    // Master Slew Slider
    new SliderController('#master-slew-slider-root', {
        min: 0,
        max: 10,
        step: 0.01,
        value: AppState.masterSlewValue,
        label: 'Slew',
        formatValue: (v) => {
            v = parseFloat(v);
            let displayValue = (v * 1000).toFixed(0);
            let unit = 'ms';
            if (v > 1) {
                displayValue = v.toFixed(2);
                unit = 's';
            }
            return `${displayValue}${unit}`;
        }
    }, (value) => {
        updateAppState({ masterSlewValue: value });
        document.dispatchEvent(new CustomEvent(MASTER_SLEW_CHANGED, { detail: { value } }));
    }).init();
}

// ================================
// SOURCE
// ================================

function setupWaveformSelector() {
    new SourceController('#oscillator-control-root').init();
    // The chosen oscillator's own cycle, previewed in the Source panel
    new WaveformController("#current-waveform-canvas-area", { mode: "single" }).init();

    // Spectral view of the timbre as Create IR will bake it (ring-aware)
    new SpectrumController('#spectrum-canvas-area').init();

    new WaveformSelectorController('#waveform-select').init();
}

/**
 * Next/previous buttons flanking select menus. Native dropdowns don't open
 * inside Max's jweb object, so these are the only way to switch options there.
 */
function setupSelectSteppers() {
    document.querySelectorAll('.select-step-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const select = document.getElementById(btn.dataset.target);
            if (!select || select.options.length === 0) return;
            const step = parseInt(btn.dataset.step, 10) || 1;
            const count = select.options.length;
            select.selectedIndex = (select.selectedIndex + step + count) % count;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });
}


/**
 * Updates all UI elements to reflect current state
 * TODO: remove this and use individual components
 */
export function updateUI() {

    // Update waveform selector
    updateValue('waveform-select', AppState.currentWaveform);
}
