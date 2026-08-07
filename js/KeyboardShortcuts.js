// KeyboardShortcuts.js
// Global key mapping: play toggle, fundamental notes, ADSR triggers,
// drawbar arrow control, octave switching.

import { AppState } from './config.js';
import { DrawbarsActions } from './modules/drawbars/drawbarsActions.js';
import { FundamentalActions } from './modules/fundamental/fundamentalActions.js';
import { PlayToggleActions } from './modules/playToggle/playToggleActions.js';
import { triggerHarmonicAttack, triggerHarmonicRelease } from './audio.js';

// Number row: fundamental, 12 chromatic steps up from the current octave's C
const NOTE_KEYS = [
    'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
    'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'
];

// QWERTY row: per-overtone ADSR gates (keydown = attack/sustain, keyup =
// release). Silent outside ADSR mode — triggerHarmonic* guard the mode.
const TRIGGER_KEYS = [
    'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI',
    'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'
];

export class KeyboardShortcuts {
    constructor() {
        this.heldTriggers = new Set();
    }

    init() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        // Release everything if the window loses focus mid-hold, so a
        // cmd-tab away never leaves an envelope stuck at sustain
        window.addEventListener('blur', () => this.releaseAll());

        // Q and W are ADSR trigger keys and cmd is the link-all modifier —
        // one slip away from closing the tab (cmd+W) or quitting (cmd+Q).
        // Swallow them where the environment allows (embedded webviews;
        // regular browser tabs reserve these shortcuts and ignore this)…
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && (e.code === 'KeyW' || e.code === 'KeyQ')) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, { capture: true });

        // …and where they can't be swallowed, make the close ask first:
        // while the synth is playing, closing the tab prompts instead of
        // silently killing the session.
        window.addEventListener('beforeunload', (e) => {
            if (AppState.isPlaying) {
                e.preventDefault();
                e.returnValue = ''; // legacy engines need this for the prompt
            }
        });
    }

    handleKeyDown(e) {
        // Never hijack typing: when an editable field has focus (text or
        // number inputs, selects, textareas), keystrokes belong to it.
        // Range inputs are excluded — drawbar arrow navigation needs them.
        const t = e.target;
        if (t && (
            (t.tagName === 'INPUT' && t.type !== 'range') ||
            t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' ||
            t.isContentEditable
        )) {
            return;
        }

        // Space bar to toggle play/stop (held-key repeats would race
        // start/stop into overlapping voice banks)
        if (e.code === 'Space') {
            e.preventDefault();
            if (!e.repeat) PlayToggleActions.toggle();
            return;
        }

        const noteIndex = NOTE_KEYS.indexOf(e.code);
        if (noteIndex !== -1) {
            FundamentalActions.setFundamentalByNoteIndex(noteIndex);
            return;
        }

        const voice = TRIGGER_KEYS.indexOf(e.code);
        if (voice !== -1) {
            if (!e.repeat && !this.heldTriggers.has(voice)) {
                this.heldTriggers.add(voice);
                triggerHarmonicAttack(voice);
            }
            return;
        }

        // Arrow keys on a focused drawbar slider (focus via Tab)
        const active = document.activeElement;
        if (active && active.matches?.('#drawbars .drawbar-slider')) {
            this.handleDrawbarArrows(e, active);
            if (e.defaultPrevented) return;
        }

        // Ctrl/Meta + ArrowUp/Down: octave navigation
        if (e.ctrlKey || e.metaKey) {
            if (e.code === 'ArrowUp') {
                e.preventDefault();
                FundamentalActions.changeOctave(1);
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                FundamentalActions.changeOctave(-1);
            }
        }
    }

    handleKeyUp(e) {
        // No editable-field guard here: a release must always land, or a
        // focus change while a key is down leaves the voice sustaining
        const voice = TRIGGER_KEYS.indexOf(e.code);
        if (voice !== -1 && this.heldTriggers.delete(voice)) {
            triggerHarmonicRelease(voice);
        }
    }

    releaseAll() {
        for (const voice of this.heldTriggers) {
            triggerHarmonicRelease(voice);
        }
        this.heldTriggers.clear();
    }

    handleDrawbarArrows(e, slider) {
        const drawbars = document.querySelectorAll('#drawbars .drawbar-slider');
        const currentIndex = parseInt(slider.dataset.index);

        // Left/Right arrows: move focus
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
            e.preventDefault();
            const delta = e.code === 'ArrowLeft' ? -1 : 1;
            const nextIndex = (currentIndex + delta + drawbars.length) % drawbars.length;
            drawbars[nextIndex].focus();
            return;
        }

        if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
        e.preventDefault();

        let value;
        if (e.shiftKey) {
            // Shift+Up/Down: jump to max/min
            value = e.code === 'ArrowUp' ? 1 : 0;
        } else {
            const step = (e.metaKey || e.ctrlKey) ? 0.1 : 0.01;
            value = parseFloat(slider.value) + (e.code === 'ArrowUp' ? step : -step);
            value = Math.max(0, Math.min(1, value));
        }
        slider.value = value.toFixed(2);
        DrawbarsActions.setDrawbar(currentIndex, value);
    }
}
