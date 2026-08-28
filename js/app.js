/**
 * MAIN APPLICATION MODULE
 * Initializes and coordinates all modules
 */

import { AppState } from './config.js';
import { momentumSmoother } from './momentum-smoother.js';

import { initUI, updateUI } from './ui.js';
import { showStatus } from './domUtils.js';
import { faviconService } from './modules/favicon/faviconService.js';
import { getAudioEngine } from './audio.js';
import { irManager } from './dsp/IRManager.js';
import { oscClient, oscEnabled } from './modules/osc/oscClient.js';
import { pulseBus } from './modules/pulse/pulseBus.js';
import { themeNumber } from './theme.js';


/**
 * EMBED MODE (Max4Live / jweb)
 * The jweb object in a Max4Live device gives us ~170px of height, so the app
 * collapses into a single horizontal row (see css/embed.css). Detected from
 * viewport height against --embed-max-height (css/theme.css — the single
 * source of truth for the boundary between the two UI designs), or forced
 * with ?embed=1 / disabled with ?embed=0.
 */
function updateEmbedMode() {
    const embedParam = new URLSearchParams(window.location.search).get('embed');
    let embed;
    if (embedParam !== null) {
        embed = embedParam !== '0' && embedParam !== 'false';
    } else {
        embed = window.innerHeight > 0 && window.innerHeight <= themeNumber('--embed-max-height');
    }
    const wasEmbed = document.body.classList.contains('embed');
    document.body.classList.toggle('embed', embed);
    if (embed !== wasEmbed) relocateSpectralSystemPanel(embed);
}

// Where #spectral-system-root sits on desktop, so it can be moved back
// exactly — { parent, next } for Node.insertBefore(section, next)
let spectralSystemHome = null;

/**
 * In embed mode, the Overtone System section joins the consolidated m4l
 * panel (fundamental + source + system, one narrow vertical stack) instead
 * of pairing with the Wavetable panel — a real DOM move, not CSS, so the
 * desktop card layout (`.system-result-row`'s 2-up grid) is completely
 * unaffected; every id inside the section stays a descendant of the same
 * root, so component code that queries by id (scoped to that root) never
 * notices the move.
 */
function relocateSpectralSystemPanel(embed) {
    const section = document.getElementById('spectral-system-root');
    const m4lPanel = document.getElementById('m4l-fundamental-source-panel');
    if (!section || !m4lPanel) return;
    if (embed) {
        spectralSystemHome = { parent: section.parentElement, next: section.nextElementSibling };
        m4lPanel.appendChild(section);
    } else if (spectralSystemHome) {
        spectralSystemHome.parent.insertBefore(section, spectralSystemHome.next);
        spectralSystemHome = null;
    }
}

/**
 * Main application initialization function
 */
async function initApp() {
    try {
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

        // Stop audio if playing
        if (AppState.isPlaying && AppState.audioContext) {
            AppState.oscillators.forEach(node => {
                if (node.osc) {
                    node.osc.stop();
                    node.osc.disconnect();
                    node.gainNode.disconnect();
                }
            });
        }

        // Close audio context
        if (AppState.audioContext && AppState.audioContext.state !== 'closed') {
            AppState.audioContext.close();
        }

        console.log('Application cleaned up successfully');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

/**
 * Sets up cleanup handlers
 */
function setupCleanup() {
    window.addEventListener('beforeunload', cleanup);
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
    updateEmbedMode();
    window.addEventListener('resize', updateEmbedMode);

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

    getAudioCtx: () => getAudioEngine().getContext(),
    getAudioEngine: () => getAudioEngine(),
    getIRManager: () => irManager,

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