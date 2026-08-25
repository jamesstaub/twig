/**
 * UI MODULE
 * Contains UI event handlers, DOM manipulation, and interface logic
 */

import { AppState, midiConfig, updateAppState } from './config.js';
import { MASTER_SLEW_CHANGED, ENVELOPE_MODE_CHANGED } from './events.js';
import { OvertoneSignalActions } from './modules/overtoneSignal/overtoneSignalActions.js';
import { updateText, updateValue } from './domUtils.js';
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
import { ModalController } from './modules/generic/modal/modalController.js';
import MidiMappingModalComponent from './modules/generic/modal/MidiMappingModalComponent.js';
import { openModal, closeModal } from './modules/generic/modal/modalActions.js';
import { PlayToggleController } from './modules/playToggle/playToggleController.js';
import { WaveformSelectorController } from './modules/waveformSelector/waveformSelectorController.js';
import { oscClient, oscEnabled } from './modules/osc/oscClient.js';
import { initLinkAll } from './modules/generic/linkAll.js';
import { pulseBus } from './modules/pulse/pulseBus.js';
import { midiOutputRouter } from './modules/midi/midiOutputRouter.js';
import { setPulseHandler } from './audio.js';
import { SourceController } from './modules/source/sourceController.js';
// ================================
// INITIALIZATION
// ================================


let drawbarsController;
let spectralSystemController;
let waveformController;
let summedWaveformController;
let downloadControlController;
let tonewheelController;


let masterGainSliderController;
let masterSlewSliderController;

let midiMappingModalController;



export function initUI() {
    setupMainButtons();
    setupControlSliders();

    setupMidiMappingModal();
    function setupMidiMappingModal() {
        // Construct the controller for the MIDI Mapping modal
        midiMappingModalController = new ModalController('#modal-root', {
            content: null, // will be set on open
            onClose: () => closeModal()
        });

        // Attach event to open button (DOM is already ready when initUI() runs)
        const btn = document.getElementById('open-midi-mapping-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                const modalContent = new MidiMappingModalComponent(document.createElement('div'));
                modalContent.render({ onClose: () => closeModal() });
                openModal(modalContent, {});
            });
        }
    }


    setupWaveformSelector();
    setupSelectSteppers();


    setupDrawbars()
    setupSpectralSystem()
    setupWaveforms();
    setupRoutingControl();
    setupFundamental();


    // Initialize keyboard shortcuts
    new KeyboardShortcuts().init();

    // Cmd/Ctrl link gestures: apply per-overtone edits to all voices
    initLinkAll();

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
    drawbarsController = new DrawbarsController("#drawbars");
    drawbarsController.init();
}

function setupSpectralSystem() {
    spectralSystemController = new SpectralSystemController("#spectral-system-root");
    spectralSystemController.init();
    setupTonewheel();
}

function setupTonewheel() {
    tonewheelController = new TonewheelController("#tonewheel-container");
    tonewheelController.init();
}


function setupWaveforms() {
    summedWaveformController = new WaveformController("#waveform-canvas-area");
    summedWaveformController.init();

    waveformController = new WaveformController("#current-waveform-canvas-area", { mode: "single" });
    waveformController.init();
}

function setupRoutingControl() {
    downloadControlController = new DownloadControlController("#routing-control-root");
    downloadControlController.init();
}

function setupFundamental() {
    const fundamentalController = new FundamentalController("#fundamental-control-root");
    fundamentalController.init();
}

// ================================
// MAIN CONTROL BUTTONS
// ================================

function setupMainButtons() {
    const playToggleController = new PlayToggleController('.play-toggle-container');
    playToggleController.init();
    setupEnvelopeModeToggle();
}

/**
 * Navbar Open/ADSR switch. Open = every voice drones freely; ADSR = voices
 * rest silent and are gated per overtone (Q-] keys, drawbar trigger pads).
 * body.adsr-mode drives the pads' visibility in CSS.
 */
function setupEnvelopeModeToggle() {
    const toggle = document.getElementById('envelope-mode-toggle');
    if (!toggle) return;

    const sync = () => {
        const adsr = OvertoneSignalActions.getEnvelopeMode() === 'adsr';
        toggle.classList.toggle('active', adsr);
        toggle.setAttribute('aria-checked', String(adsr));
        document.body.classList.toggle('adsr-mode', adsr);
        document.getElementById('env-open-label')?.classList.toggle('inactive', adsr);
        document.getElementById('env-open-label')?.classList.toggle('active', !adsr);
        document.getElementById('env-adsr-label')?.classList.toggle('inactive', !adsr);
        document.getElementById('env-adsr-label')?.classList.toggle('active', adsr);
    };

    toggle.addEventListener('click', () => {
        OvertoneSignalActions.setEnvelopeMode(
            OvertoneSignalActions.getEnvelopeMode() === 'adsr' ? 'open' : 'adsr'
        );
    });
    document.addEventListener(ENVELOPE_MODE_CHANGED, sync);
    sync(); // bootstrap may have applied a bridged mode before init
}

function setupControlSliders() {
    // Master Gain Slider
    masterGainSliderController = new SliderController('#master-gain-slider-root', {
        min: 0,
        max: 1,
        step: 0.01,
        value: AppState.masterGainValue,
        label: 'Gain',
        formatValue: (v) => `${(v * 100).toFixed(0)}%`,
    }, (value) => {
        smoothUpdateMasterGain(value);
    });
    masterGainSliderController.init();

    // Master Slew Slider
    masterSlewSliderController = new SliderController('#master-slew-slider-root', {
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
    });
    masterSlewSliderController.init();


}



export function updateSystemDescription() {
    updateText('system-description', AppState.currentSystem.description, true);
}

// ================================

// ================================
// WAVEFORM SELECTOR
// ================================

function setupWaveformSelector() {
    const sourceController = new SourceController('#oscillator-control-root');
    sourceController.init();

    const waveformSelectorController = new WaveformSelectorController('#waveform-select');
    waveformSelectorController.init();
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

    updateSystemDescription();

    // Update waveform selector
    updateValue('waveform-select', AppState.currentWaveform);
}
