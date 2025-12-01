/**
 * UI MODULE
 * Contains UI event handlers, DOM manipulation, and interface logic
 */

import {
    AppState,
    updateAppState,
    spectralSystems,
} from './config.js';
import {
    midiToFreq,
    smoothUpdateMasterGain,
    smoothUpdateSubharmonicMode
} from './utils.js';
import { startTone, stopTone, updateAudioProperties, restartAudio, sampleCurrentWaveform, exportAsWAV, addToWaveforms } from './audio.js';
import { setSpreadFactor } from './visualization.js';

import { HelpDialog } from './HelpDialog.js';

import { KeyboardShortcuts } from './KeyboardShortcuts.js';
import { setupEventListener, showStatus, updateText, updateValue } from './domUtils.js';

import { DrawbarsController } from './modules/drawbars/drawbarsController.js';
import { SpectralSystemController } from './modules/spectralSystem/spectralSystemController.js';
import { WaveformController } from './modules/waveform/waveformController.js';

// ================================
// INITIALIZATION
// ================================


let drawbarsController;
let spectralSystemController;
let waveformController;
/**
 * Initializes all UI components and event handlers
 */
export function initUI() {
    setupMainButtons();
    setupControlSliders();
    setupFundamentalControls();
    setupKeyboard();

    setupWaveformSelector();

    // Ensure currentSystem is set before rendering drawbars
    if (!AppState.currentSystem) {
        AppState.currentSystem = spectralSystems[0];
    }

    setupDrawbars()
    setupSpectralSystem()
    setupWaveforms();
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
}

function setupWaveforms() {
    waveformController = new WaveformController("#waveform-canvas-area");
    waveformController.init();
}

// ================================
// MAIN CONTROL BUTTONS
// ================================

function setupMainButtons() {
    // Play/Stop toggle (new navbar toggle)
    setupEventListener('play-toggle', 'click', handlePlayToggle);

    // Export WAV button
    setupEventListener('export-wav-button', 'click', handleExportWAV);

    // Add to waveforms button
    setupEventListener('add-wave-button', 'click', handleAddToWaveforms);
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

function handleExportWAV() {
    sampleCurrentWaveform().then(sampledData => {
        const buffer = sampledData.buffer || sampledData; // Handle both old and new format
        if (buffer.length > 0) {
            exportAsWAV(sampledData, 1); // Pass full data object (includes periodMultiplier)
        }
    }).catch(error => {
        console.error('Failed to sample waveform for export:', error);
        showStatus('Failed to sample waveform for export', 'error');
    });
}

function handleAddToWaveforms() {
    sampleCurrentWaveform().then(sampledData => {
        const buffer = sampledData.buffer || sampledData; // Handle both old and new format
        if (buffer.length > 0) {
            return addToWaveforms(sampledData); // Pass the full data object (includes periodMultiplier)
        }
    }).catch(error => {
        console.error('Failed to sample waveform for adding:', error);
        showStatus('Failed to sample waveform for adding', 'error');
    });
}

// ================================
// CONTROL SLIDERS
// ================================

function setupControlSliders() {
    // Master gain slider
    const masterGainSlider = document.getElementById('master-gain-slider');
    const masterGainDisplay = document.getElementById('master-gain-value');

    if (masterGainSlider) {
        // Initialize with AppState value
        masterGainSlider.value = AppState.masterGainValue;
        if (masterGainDisplay) {
            masterGainDisplay.textContent = `${(AppState.masterGainValue * 100).toFixed(0)}%`;
        }

        masterGainSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            updateText('master-gain-value', `${(value * 100).toFixed(0)}%`);

            // Use smooth parameter interpolation to prevent crackling
            smoothUpdateMasterGain(value);
        });
    }

    // Spread slider
    const spreadSlider = document.getElementById('spread-slider');
    const spreadDisplay = document.getElementById('spread-value');

    if (spreadSlider) {
        spreadSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            setSpreadFactor(value);
            updateText('spread-value', `${(value * 100).toFixed(0)}%`);
        });
    }

    // Visualization frequency slider
    const vizFreqSlider = document.getElementById('viz-freq-slider');
    const vizFreqDisplay = document.getElementById('viz-freq-value');

    if (vizFreqSlider) {
        vizFreqSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            updateAppState({ visualizationFrequency: value });
            updateText('viz-freq-value', `${value.toFixed(1)} Hz`);
        });
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



function updateSystemDescription() {
    updateText('system-description', AppState.currentSystem.description, true);
}

// ================================

// ================================
// WAVEFORM SELECTOR
// ================================

function setupWaveformSelector() {
    const select = document.getElementById('waveform-select');
    if (select) {
        select.addEventListener('change', handleWaveformChange);
    }
}

function handleWaveformChange(e) {
    updateAppState({ currentWaveform: e.target.value });
    if (AppState.isPlaying) {
        restartAudio();
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

    // Update slider values
    updateValue('master-gain-slider', AppState.masterGainValue);
    updateText('master-gain-value', `${(AppState.masterGainValue * 100).toFixed(0)}%`);

    updateValue('viz-freq-slider', AppState.visualizationFrequency);
    updateText('viz-freq-value', `${AppState.visualizationFrequency.toFixed(1)} Hz`);

    // Update play button state
    const playButton = document.getElementById('play-button');
    if (playButton) {
        playButton.textContent = AppState.isPlaying ? "Stop Tone" : "Start Tone";
        playButton.classList.toggle('playing', AppState.isPlaying);
    }

    // // Update system selector
    // const systemSelect = document.getElementById('ratio-system-select');
    // if (systemSelect) {
    //     const systemIndex = spectralSystems.indexOf(AppState.currentSystem);
    //     systemSelect.value = systemIndex;
    // }

    // Update waveform selector
    updateValue('waveform-select', AppState.currentWaveform);


}
