/**
 * UI MODULE
 * Contains UI event handlers, DOM manipulation, and interface logic
 */

import { AppState, updateAppState } from './config.js';
import { updateText, updateValue, setupEventListener, showStatus } from './domUtils.js';
import { DrawbarsController } from './modules/drawbars/drawbarsController.js';
import { SpectralSystemController } from './modules/spectralSystem/spectralSystemController.js';
import { WaveformController } from './modules/waveform/waveformController.js';
import { handleAddToWaveforms, handleWaveformChange } from './modules/waveform/waveformActions.js';
import { DownloadControlController } from './modules/downloadControl/downloadControlController.js';
// import { updateFundamentalDisplay, updateKeyboardUI, updateSystemDescription } from './ui.js';
import { HelpDialog } from './HelpDialog.js';
import { KeyboardShortcuts } from './KeyboardShortcuts.js';
import { TonewheelController } from './modules/tonewheel/tonewheelController.js';
import { startTone, stopTone } from './audio.js';
import { smoothUpdateMasterGain } from './utils.js';

import { SliderController } from './modules/atoms/slider/sliderController.js';
import { MidiInputRouter } from './modules/midi/midiInputRouter.js';
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



export function initUI() {
    setupMainButtons();
    setupControlSliders();
    setupFundamentalControls();
    setupKeyboard();

    setupWaveformSelector();


    setupDrawbars()
    setupSpectralSystem()
    setupWaveforms();
    setupRoutingControl();

    // Set initial UI values
    updateFundamentalDisplay();
    updateKeyboardUI();

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




// ================================
// FUNDAMENTAL FREQUENCY CONTROLS
// ================================

function setupFundamentalControls() {
    // Frequency input
    const fundamentalInput = document.getElementById('fundamental-input');
    if (fundamentalInput) {
        fundamentalInput.addEventListener('change', handleFundamentalChange);
    }

    // Octave controls
    setupEventListener('octave-down', 'click', () => changeOctave(-1));
    setupEventListener('octave-up', 'click', () => changeOctave(1));
}

function handleFundamentalChange(e) {
    let val = parseFloat(e.target.value);
    // Allow very low frequencies (down to 0.01 Hz)
    if (isNaN(val) || val < 0.01 || val > 10000) {
        showStatus("Frequency must be between 0.01 Hz and 10000 Hz.", 'error');
        val = AppState.fundamentalFrequency; // Revert to current value
    }
    import('./UIStateManager.js').then(({ UIStateManager }) => {
        UIStateManager.setFundamentalByFrequency(val);
        e.target.value = val.toFixed(2);
    });
}

function changeOctave(direction) {

    import('./UIStateManager.js').then(({ UIStateManager }) => {
        const state = UIStateManager.getState();
        const newMidiNote = state.currentMidiNote + (direction * 12);
        UIStateManager.setFundamentalByMidi(newMidiNote);
    });
}



export function updateFundamentalDisplay() {
    updateValue('fundamental-input', AppState.fundamentalFrequency.toFixed(2));
    updateText('current-octave-display', `Octave ${AppState.currentOctave}`);
}

// ================================
// KEYBOARD INTERFACE
// ================================

function setupKeyboard() {
    const keyboard = document.getElementById('piano-keyboard');
    if (!keyboard) return;

    // Define the 12 chromatic notes
    const notes = [
        { name: 'C', class: 'white', index: 0 },
        { name: 'C#', class: 'black', index: 1 },
        { name: 'D', class: 'white', index: 2 },
        { name: 'D#', class: 'black', index: 3 },
        { name: 'E', class: 'white', index: 4 },
        { name: 'F', class: 'white', index: 5 },
        { name: 'F#', class: 'black', index: 6 },
        { name: 'G', class: 'white', index: 7 },
        { name: 'G#', class: 'black', index: 8 },
        { name: 'A', class: 'white', index: 9 },
        { name: 'A#', class: 'black', index: 10 },
        { name: 'B', class: 'white', index: 11 },
    ];

    keyboard.innerHTML = ''; // Clear existing keys

    notes.forEach(note => {
        const key = document.createElement('div');
        key.className = `key ${note.class}`;
        key.textContent = note.name;
        key.dataset.noteIndex = note.index;
        key.addEventListener('click', () => handleKeyClick(note.index));
        keyboard.appendChild(key);
    });
}

function handleKeyClick(noteIndex) {
    // noteIndex is 0 (C) through 11 (B)
    import('./UIStateManager.js').then(({ UIStateManager }) => {
        const state = UIStateManager.getState();
        const baseMidi = (state.currentOctave + 1) * 12;
        const newMidi = baseMidi + noteIndex;
        UIStateManager.setFundamentalByMidi(newMidi);
    });
}

export function updateKeyboardUI() {
    const keys = document.querySelectorAll('.key');
    keys.forEach(key => key.classList.remove('active'));

    // Calculate the index (0-11) of the selected note within the current octave
    let noteIndex = AppState.currentMidiNote % 12;
    if (noteIndex < 0) noteIndex += 12;
    const selectedKey = document.querySelector(`.key[data-note-index="${noteIndex}"]`);

    if (selectedKey) {
        selectedKey.classList.add('active');
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
    updateFundamentalDisplay();
    updateKeyboardUI();


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
