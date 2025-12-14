/**
 * UI MODULE
 * Contains UI event handlers, DOM manipulation, and interface logic
 */

import { AppState, updateAppState } from './config.js';
import { updateText, updateValue, setupEventListener, showStatus } from './domUtils.js';
import { DrawbarsController } from './modules/drawbars/drawbarsController.js';
import { SpectralSystemController } from './modules/spectralSystem/spectralSystemController.js';
import { WaveformController } from './modules/waveform/waveformController.js';
import { handleWaveformChange } from './modules/waveform/waveformActions.js';
import { DownloadControlController } from './modules/downloadControl/downloadControlController.js';
// import { updateFundamentalDisplay, updateKeyboardUI, updateSystemDescription } from './ui.js';
import { HelpDialog } from './HelpDialog.js';
import { KeyboardShortcuts } from './KeyboardShortcuts.js';
import { TonewheelController } from './modules/tonewheel/tonewheelController.js';
import { startTone, stopTone } from './audio.js';
import { smoothUpdateMasterGain } from './utils.js';

import { SliderController } from './modules/generic/slider/sliderController.js';
import { MidiInputRouter } from './modules/midi/midiInputRouter.js';
import { FundamentalController } from './modules/fundamental/fundamentalController.js';
import { ModalController } from './modules/generic/modal/modalController.js';
import MidiMappingModalComponent from './modules/generic/modal/MidiMappingModalComponent.js';
import { openModal, closeModal } from './modules/generic/modal/modalActions.js';
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

        // Attach event to open button
        document.addEventListener('DOMContentLoaded', () => {
            const btn = document.getElementById('open-midi-mapping-btn');
            if (btn) {
                btn.addEventListener('click', () => {
                    // Create the modal content (component instance)
                    const modalContent = new MidiMappingModalComponent(document.createElement('div'));
                    modalContent.render({ onClose: () => closeModal() });
                    openModal(modalContent, {});
                });
            }
        });
    }


    setupWaveformSelector();


    setupDrawbars()
    setupSpectralSystem()
    setupWaveforms();
    setupRoutingControl();
    setupFundamental();


    // Initialize help and keyboard shortcuts
    HelpDialog.init();
    new KeyboardShortcuts().init();

    setTimeout(() => {
        // if midi is firing while the components are still rendering it breaks the p5 sketch :-/
        new MidiInputRouter().init();
    }, 2000);
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
    // Play/Stop toggle (new navbar toggle)
    setupEventListener('play-toggle', 'click', handlePlayToggle);

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
    });
    masterSlewSliderController.init();


}


export async function handlePlayToggle() {
    const toggle = document.getElementById('play-toggle');
    const playLabel = document.getElementById('play-label');

    if (AppState.isPlaying) {
        stopTone();
        toggle.classList.remove('active');
        toggle.setAttribute('aria-checked', 'false');
        playLabel.textContent = "Play";
    } else {
        try {
            await startTone();
            toggle.classList.add('active');
            toggle.setAttribute('aria-checked', 'true');
            playLabel.textContent = "Stop";
        } catch (error) {
            console.error('Failed to start tone:', error);
            showStatus('Failed to start audio. Please check browser permissions.', 'error');
        }
    }
}


export function updateSystemDescription() {
    updateText('system-description', AppState.currentSystem.description, true);
}

// ================================

// ================================
// WAVEFORM SELECTOR
// ================================

function setupWaveformSelector() {
    const select = document.getElementById('waveform-select');
    if (select) {
        select.addEventListener('change', handleWaveformChange)
    }
}


/**
 * Updates all UI elements to reflect current state
 * TODO: remove this and use individual components
 */
export function updateUI() {

    updateSystemDescription();

    // Update play button state
    const playButton = document.getElementById('play-button');
    if (playButton) {
        playButton.textContent = AppState.isPlaying ? "Stop Tone" : "Start Tone";
        playButton.classList.toggle('playing', AppState.isPlaying);
    }

    // Update waveform selector
    updateValue('waveform-select', AppState.currentWaveform);


}
