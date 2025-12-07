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

// ================================
// APPLICATION INITIALIZATION
// ================================

/**
 * Main application initialization function
 */
function initApp() {
    try {
        // Initialize UI components
        initUI();
        faviconService.start();

        updateUI();

    } catch (error) {
        console.error('Failed to initialize application:', error);
        showStatus('Failed to initialize application. Please refresh the page.', 'error');
    }
}

// ================================
// ERROR HANDLING
// ================================

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

// ================================
// APPLICATION LIFECYCLE
// ================================

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

// ================================
// PERFORMANCE MONITORING
// ================================

/**
 * Basic performance monitoring
 */
function setupPerformanceMonitoring() {
    // Monitor audio context performance
    if (window.performance && window.performance.mark) {
        setInterval(() => {
            if (AppState.audioContext && AppState.isPlaying) {
                const currentTime = AppState.audioContext.currentTime;
                const oscillatorCount = AppState.oscillators.length;

                // Log performance metrics occasionally
                if (Math.floor(currentTime) % 30 === 0) {
                    console.log(`Audio performance: ${oscillatorCount} oscillators, context time: ${currentTime.toFixed(2)}s`);
                }
            }
        }, 1000);
    }
}

// ================================
// BROWSER COMPATIBILITY
// ================================

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

    // Check for p5.js
    if (typeof p5 === 'undefined') {
        issues.push('p5.js library not loaded');
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

    // Wait for p5.js to be available
    if (typeof window.p5 === 'undefined') {
        console.log('Waiting for p5.js to load...');
        setTimeout(startup, 100);
        return;
    }

    // Setup cleanup handlers
    setupCleanup();

    // Setup performance monitoring
    setupPerformanceMonitoring();

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