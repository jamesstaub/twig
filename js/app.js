/**
 * MAIN APPLICATION MODULE
 * Initializes and coordinates all modules
 */

import { AppState } from './config.js';
import { loadAppConfig, midiConfig, recorderConfig, soundfileConfig } from './appConfig.js';
import * as midiConfigActions from './modules/midi/midiConfigActions.js';
import { momentumSmoother } from './momentum-smoother.js';

import { initUI, updateUI } from './ui.js';
import { showStatus } from './domUtils.js';
import { faviconService } from './modules/favicon/faviconService.js';
import { audioEngine } from './dsp/engine/AudioEngine.js';
import { irManager } from './dsp/IRManager.js';
import { sourceManager } from './dsp/SourceManager.js';
import { recordingStore } from './modules/recording/RecordingStore.js';
import { RecordingActions } from './modules/recording/recordingActions.js';
import { PresetActions } from './modules/presets/presetActions.js';
import { oscClient, oscEnabled } from './modules/osc/oscClient.js';
import { pulseBus } from './modules/pulse/pulseBus.js';
import { layoutMode } from './modules/layout/layoutMode.js';

/**
 * Main application initialization function
 */
async function initApp() {
    try {
        // Local app config (MIDI routing, recorder modes) first, then the
        // bridge bootstrap — bridged values override the local copy
        loadAppConfig();

        // Apply state pushed to the bridge (Live's plugin parameters)
        // BEFORE the UI renders, so the first paint shows that state
        if (oscEnabled()) {
            await oscClient.bootstrap();
        }

        // Initialize UI components
        initUI();
        faviconService.start();

        updateUI();

    } catch (error) {
        console.error('Failed to initialize application:', error);
        showStatus('Failed to initialize application. Please refresh the page.', 'error');
    }
}

/**
 * Global error handler
 */
function setupErrorHandling() {
    window.addEventListener('error', (e) => {
        console.error('Application error:', e.error);
        showStatus('An unexpected error occurred. Please check the console.', 'error');
    });

    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
        showStatus('A promise was rejected. Please check the console.', 'error');
    });
}

/**
 * Clean up function for when the app is being closed
 */
function cleanup() {
    try {
        // Clear momentum smoothing
        momentumSmoother.clear();

        // Closing the context stops every voice with it
        if (audioEngine.context && audioEngine.context.state !== 'closed') {
            audioEngine.context.close();
        }

        console.log('Application cleaned up successfully');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

/**
 * What a close would throw away. Synth state is bridged and restored, but
 * these only live in the tab: the sound in the air, a take being captured,
 * and the recordings and IRs made this session (RecordingStore and
 * IRManager are memory-only by design).
 */
function hasUnsavedWork() {
    return AppState.isPlaying
        || AppState.recorder.status !== 'idle'   // armed or recording
        || recordingStore.list().length > 0
        || irManager.list().length > 0;
}

/**
 * Closing is nearly always a slip — cmd+W and cmd+Q sit right beside the
 * keys the app plays with. The browser renders its own confirmation (the
 * text is not ours to set); it only offers one at all once the page has
 * been interacted with, which any of the above guarantees.
 */
function confirmClose(event) {
    if (!hasUnsavedWork()) return;
    event.preventDefault();
    event.returnValue = ''; // older engines show the prompt off this alone
}

/**
 * Teardown runs on `pagehide` ONLY: it closes the AudioContext, and
 * `beforeunload` fires while the page may yet survive — doing it there
 * would silence a session the moment the confirmation above appears,
 * even when the answer is "stay".
 */
function setupCleanup() {
    window.addEventListener('beforeunload', confirmClose);
    window.addEventListener('pagehide', cleanup);
}


/**
 * Checks for browser compatibility
 */
function checkCompatibility() {
    const issues = [];

    // Check for Web Audio API
    if (!window.AudioContext && !window.webkitAudioContext) {
        issues.push('Web Audio API not supported');
    }

    // Check for ES6 modules
    if (!window.Promise) {
        issues.push('ES6 Promises not supported');
    }

    if (issues.length > 0) {
        const message = `Browser compatibility issues: ${issues.join(', ')}. Please use a modern browser.`;
        showStatus(message, 'error');
        console.error(message);
        return false;
    }

    // check for midi access
    if (!navigator.requestMIDIAccess) {
        const message = 'Web MIDI API not supported in this browser. MIDI functionality will be disabled.';
        showStatus(message, 'warning');
        console.warn(message);
    }

    return true;
}

// ================================
// STARTUP SEQUENCE
// ================================

/**
 * Main startup function
 */
function startup() {
    // Setup error handling first
    setupErrorHandling();

    // Check browser compatibility
    if (!checkCompatibility()) {
        return;
    }

    // Setup cleanup handlers
    setupCleanup();

    // Apply embed (Max4Live) layout before components measure their containers
    layoutMode.init();

    // Initialize the application
    initApp();
}

// ================================
// EXPORT PUBLIC API
// ================================

// Export functions that might be useful for debugging or external control
window.TWIG = {
    // State access
    getState: () => AppState,

    getAudioCtx: () => audioEngine.context,
    getAudioEngine: () => audioEngine,
    getIRManager: () => irManager,
    getSourceManager: () => sourceManager,
    getRecordingStore: () => recordingStore,
    recorder: RecordingActions,
    getAppConfig: () => ({ midiConfig, recorderConfig, soundfileConfig }),
    midiConfigActions,
    presets: PresetActions,

    // Per-cycle voice pulses (subaudible clock taps): subscribe(voiceIndex |
    // '*', fn(index, {cycle, gateOn, frequency, audioTime})) → unsubscribe fn
    pulses: {
        subscribe: (voice, fn) => pulseBus.subscribe(voice, fn),
    },

    // Module access (for debugging)
    updateUI,

    // Utility functions
    showStatus,

    // Manual cleanup
    cleanup
};

// ================================
// APPLICATION ENTRY POINT
// ================================

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startup);
} else {
    // DOM is already ready
    startup();
}