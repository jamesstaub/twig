// KeyboardShortcuts.js
// Handles all keyboard event mapping, calls DrawbarActions methods

import { AppState } from './config.js';
import { DrawbarsActions } from './modules/drawbars/drawbarsActions.js';
import { FundamentalActions } from './modules/fundamental/fundamentalActions.js';
import { PlayToggleActions } from './modules/playToggle/playToggleActions.js';

// BUG: the arrow keybindings for the current get stuck when focus is on a difernt drawbar (if you use tab instead of the number keys)
export class KeyboardShortcuts {
    constructor() {
        this.focusedDrawbar = null;
    }

    init() {
        document.addEventListener('keydown', (e) => {
            // Space bar to toggle play/stop
            if (e.code === 'Space') {
                e.preventDefault();
                PlayToggleActions.toggle();
                return;
            }

            // QWERTY row: Fundamental note selection
            const qwertyKeys = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Backslash'];
            const qwertyIndex = qwertyKeys.indexOf(e.code);
            if (qwertyIndex !== -1) {
                const baseMidi = ((AppState?.currentOctave ?? 3) + 1) * 12;
                FundamentalActions.setFundamentalByMidi(baseMidi + qwertyIndex);
                return;
            }

            // Number row: Drawbar focus
            const drawbarKeys = [
                'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
                'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'
            ];
            const drawbarIndex = drawbarKeys.indexOf(e.code);
            if (drawbarIndex !== -1) {
                const drawbars = document.querySelectorAll('#drawbars .drawbar-slider');
                if (drawbars[drawbarIndex]) {
                    drawbars[drawbarIndex].focus();
                    this.focusedDrawbar = drawbars[drawbarIndex];
                }
                return;
            }

            // Drawbar navigation and value control
            if (this.focusedDrawbar) {
                const drawbars = document.querySelectorAll('#drawbars .drawbar-slider');
                const currentIndex = parseInt(this.focusedDrawbar.dataset.index);

                // Left/Right arrows: move focus
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                    e.preventDefault();
                    const delta = e.code === 'ArrowLeft' ? -1 : 1;
                    const nextIndex = (currentIndex + delta + drawbars.length) % drawbars.length;
                    drawbars[nextIndex].focus();
                    this.focusedDrawbar = drawbars[nextIndex];
                    return;
                }

                // Shift+Up/Down: jump to max/min (must come before regular Up/Down)
                if (e.shiftKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
                    e.preventDefault();
                    const value = e.code === 'ArrowUp' ? 1 : 0;
                    this.focusedDrawbar.value = value.toFixed(2);
                    DrawbarsActions.setDrawbar(currentIndex, value);
                    return;
                }

                // Up/Down arrows: increment/decrement drawbar value
                if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
                    e.preventDefault();
                    const step = (e.metaKey || e.ctrlKey) ? 0.1 : 0.01;
                    const newValue = parseFloat(this.focusedDrawbar.value) +
                        (e.code === 'ArrowUp' ? step : -step);
                    const clamped = Math.max(0, Math.min(1, newValue));
                    this.focusedDrawbar.value = clamped.toFixed(2);

                    // Call centralized action
                    DrawbarsActions.setDrawbar(currentIndex, clamped);

                    return;
                }
            }

            // Ctrl/Meta + ArrowUp/Down: Octave navigation (when not focused on drawbar)
            if (!this.focusedDrawbar && (e.ctrlKey || e.metaKey)) {
                if (e.code === 'ArrowUp') {
                    e.preventDefault();
                    window.changeOctave?.(1);
                } else if (e.code === 'ArrowDown') {
                    e.preventDefault();
                    window.changeOctave?.(-1);
                }
            }
        });
    }
}
