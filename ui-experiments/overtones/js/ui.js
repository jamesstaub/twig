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
import { startTone, stopTone, updateAudioProperties } from './audio.js';
import { smoothUpdateMasterGain } from './utils.js';
import { TonewheelActions } from './modules/tonewheel/tonewheelActions.js';
import { SliderController } from './modules/atoms/slider/sliderController.js';
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
let spreadSliderController;
let vizFreqSliderController;


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

    // setupSystemSelector();
    // populateSystemSelector();
    // updateSystemDescription();



    // Set initial UI values
    updateFundamentalDisplay();
    updateKeyboardUI();


    // Initialize help and keyboard shortcuts
    HelpDialog.init();
    new KeyboardShortcuts().init();
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

    // Add to waveforms button
    setupEventListener('add-wave-button', 'click', handleAddToWaveforms);
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
        updateText('master-gain-value', `${(value * 100).toFixed(0)}%`);
        smoothUpdateMasterGain(value);
    });
    masterGainSliderController.init();

    // Master Slew Slider
    masterSlewSliderController = new SliderController('#master-slew-slider-root', {
        min: 0,
        max: 2,
        step: 0.01,
        value: AppState.masterSlewValue,
        label: 'Slew',
    }, (value) => {
        let displayValue = (value * 1000).toFixed(0);
        let unit = 'ms';
        if (value > 1) {
            displayValue = (value).toFixed(2);
            unit = 's';
        }
        updateText('master-slew-value', `${displayValue}${unit}`);
        updateAppState({ masterSlewValue: value });
    });
    masterSlewSliderController.init();

    // Spread Slider
    spreadSliderController = new SliderController('#spread-slider-root', {
        min: 0,
        max: 1,
        step: 0.01,
        value: AppState.spreadFactor ?? 0.2,
        label: 'Gain',
    }, (value) => {
        TonewheelActions.setSpreadFactor(value);
        updateText('spread-value', `${(value * 100).toFixed(0)}%`);
    });
    spreadSliderController.init();

    // Visualization Frequency Slider
    vizFreqSliderController = new SliderController('#viz-freq-slider-root', {
        min: 0.1,
        max: 20,
        step: 0.1,
        value: AppState.visualizationFrequency ?? 1,
        label: 'Rate',
    }, (value) => {
        setVisualizationFrequency(value);
        updateText('viz-freq-value', `${value.toFixed(1)} Hz`);
    });
    vizFreqSliderController.init();
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
// CONTROL SLIDERS
// ================================

// function setupControlSliders() {
//     // Master gain slider
//     const masterGainSlider = document.getElementById('master-gain-slider');
//     const masterGainDisplay = document.getElementById('master-gain-value');

//     if (masterGainSlider) {
//         // Initialize with AppState value
//         masterGainSlider.value = AppState.masterGainValue;
//         if (masterGainDisplay) {
//             masterGainDisplay.textContent = `${(AppState.masterGainValue * 100).toFixed(0)}%`;
//         }

//         masterGainSlider.addEventListener('input', (e) => {
//             const value = parseFloat(e.target.value);
//             updateText('master-gain-value', `${(value * 100).toFixed(0)}%`);

//             // Use smooth parameter interpolation to prevent crackling
//             smoothUpdateMasterGain(value);
//         });
//     }

//     // master slew slider
//     const masterSlewSlider = document.getElementById('master-slew-slider');
//     const masterSlewDisplay = document.getElementById('master-slew-value');

//     if (masterSlewSlider) {
//         // Initialize with AppState value
//         masterSlewSlider.value = AppState.masterSlewValue;
//         if (masterSlewDisplay) {
//             masterSlewDisplay.textContent = `${(AppState.masterSlewValue * 1000).toFixed(0)}ms`;
//         }

//         masterSlewSlider.addEventListener('input', (e) => {
//             const value = parseFloat(e.target.value);
//             let displayValue = (value * 1000).toFixed(0);
//             let unit = 'ms';


//             if (value > 1) {
//                 displayValue = (value).toFixed(2);
//                 unit = 's';
//             }
//             updateText('master-slew-value', `${displayValue}${unit}`);
//             updateAppState({ masterSlewValue: value });
//         }
//         );
//     }


//     // Spread slider
//     const spreadSlider = document.getElementById('spread-slider');

//     if (spreadSlider) {
//         spreadSlider.addEventListener('input', (e) => {
//             const value = parseFloat(e.target.value);
//             TonewheelActions.setSpreadFactor(value);
//             updateText('spread-value', `${(value * 100).toFixed(0)}%`);
//         });
//     }

//     // Visualization frequency slider
//     const vizFreqSlider = document.getElementById('viz-freq-slider');

//     if (vizFreqSlider) {
//         vizFreqSlider.addEventListener('input', (e) => {
//             const value = parseFloat(e.target.value);
//             setVisualizationFrequency(value);
//             updateText('viz-freq-value', `${value.toFixed(1)} Hz`);
//         });
//     }
// }

export function setVisualizationFrequency(freq) {
    // Set a variable that your animation loop reads each frame
    AppState.visualizationFrequency = freq;
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

function updateFundamental(newMidi) {
    // Allow negative MIDI values for super low octaves
    const midi = Math.round(newMidi);
    const frequency = midiToFreq(midi);
    const octave = Math.floor(midi / 12) - 1;

    updateAppState({
        currentMidiNote: midi,
        fundamentalFrequency: frequency,
        currentOctave: octave
    });

    updateFundamentalDisplay();
    updateKeyboardUI();
    updateAudioProperties();
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

// ================================
// SYSTEM SELECTOR
// ================================


// function populateSystemSelector() {
//     const select = document.getElementById('ratio-system-select');
//     if (!select) return;

//     select.innerHTML = ''; // Clear existing options

//     spectralSystems.forEach((system, index) => {
//         const option = document.createElement('option');
//         option.textContent = system.name;
//         option.value = index;
//         select.appendChild(option);
//     });
// }



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


// ================================
// UI UPDATE FUNCTIONS
// ================================

/**
 * Updates all UI elements to reflect current state
 */
export function updateUI() {
    updateFundamentalDisplay();
    updateKeyboardUI();
    // drawbars.updateDrawbarLabels();
    drawbarsController.init();

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
