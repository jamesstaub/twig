import BaseComponent from '../base/BaseComponent.js';
import { partialColor } from '../../theme.js';
import { openOvertoneMenu, isTouchContextMenu } from '../generic/overtoneMenu.js';

/**
 * Pad grid — one big playable pad per overtone (drum-machine style).
 * Holding a pad gates that voice's envelope open (attack → sustain),
 * letting go releases it; every pad captures its own pointer, so several
 * fingers play several voices. No velocity: the voice's own ADSR (set in
 * the inspector) is the whole articulation.
 *
 * `setFundamental` flips what a pad does: instead of playing the voice, a
 * tap promotes that overtone to the fundamental (onSetFundamental) — the
 * grid says so with a green border on every pad.
 *
 * Pure presentation: renders from props and reports through
 * onAttack(index) / onRelease(index) / onSetFundamental(index). A per-frame level glow
 * (props.levelOf) shows what's sounding — including voices triggered
 * from the keyboard, not just the pads.
 */
export class PadGridComponent extends BaseComponent {

    constructor(target) {
        super(target);
        this.onAttack = null;
        this.onRelease = null;
        this.onSetFundamental = null;
        this.setFundamental = false;
        this._held = new Set();
        this._pads = [];
        this._levelRaf = null;
    }

    render({ voices, envelopeMode, keyHints = [], levelOf = null, setFundamental = false }) {
        this.teardown();
        this.el.innerHTML = '';

        this.setFundamental = Boolean(setFundamental);
        this.el.classList.toggle('pad-grid-set-fundamental', this.setFundamental);
        // Drone mode dims the pads because they can't sound — but promoting
        // a fundamental works whatever the envelope mode is
        this.el.classList.toggle('pad-grid-inactive', envelopeMode !== 'adsr' && !this.setFundamental);
        this._pads = voices.map((v, i) => this.createPad(i, v, keyHints[i]));
        this._pads.forEach((p) => this.el.appendChild(p));

        this._levelOf = levelOf;
        this.startLevelLoop();
    }

    createPad(index, { label, hz }, keyHint) {
        const pad = document.createElement('button');
        pad.type = 'button';
        pad.className = 'trigger-pad';
        pad.style.setProperty('--pad-color', partialColor(this._ratioOf(index)));
        pad.setAttribute('aria-label', `Overtone ${index + 1} (${label})`);
        pad.dataset.index = index;

        const name = document.createElement('span');
        name.className = 'trigger-pad-label';
        name.textContent = label;
        const freq = document.createElement('span');
        freq.className = 'trigger-pad-hz';
        freq.textContent = hz;
        pad.append(name, freq);
        if (keyHint) {
            const key = document.createElement('span');
            key.className = 'trigger-pad-key';
            key.textContent = keyHint;
            pad.appendChild(key);
        }

        const release = () => {
            if (!this._held.has(index)) return;
            this._held.delete(index);
            pad.classList.remove('held');
            this.onRelease?.(index);
        };
        const openMenu = (x, y) => {
            release(); // never leave the voice sounding under the menu
            openOvertoneMenu(index, x, y);
        };
        this.bindEvent(pad, 'pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            // Set-fundamental mode: a tap promotes, it never gates — so no
            // held state and nothing to release
            if (this.setFundamental) {
                this.onSetFundamental?.(index);
                return;
            }
            try {
                pad.setPointerCapture(e.pointerId);
            } catch { /* synthetic pointer — hold still works */ }
            this._held.add(index);
            pad.classList.add('held');
            this.onAttack?.(index);
            pad.addEventListener('pointerup', release, { once: true });
            pad.addEventListener('pointercancel', release, { once: true });
        });
        // Right-click only: on touch, holding a pad is how you sustain it,
        // so a press-and-hold must never turn into a menu
        this.bindEvent(pad, 'contextmenu', (e) => {
            e.preventDefault();
            if (isTouchContextMenu(e)) return;
            openMenu(e.clientX, e.clientY);
        });
        // A finger sliding off a pad keeps capture, so up/cancel still
        // land here; a lost capture (e.g. a re-render) is handled by
        // releaseAll in teardown.
        pad._release = release;
        return pad;
    }

    _ratioOf(index) {
        return this._ratios?.[index] ?? index + 1;
    }

    /** Per-frame level glow: --pad-level 0..1 from the voice meter. */
    startLevelLoop() {
        if (this._levelRaf) cancelAnimationFrame(this._levelRaf);
        if (!this._levelOf) return;
        const tick = () => {
            for (const pad of this._pads) {
                const level = Math.min(1, this._levelOf(Number(pad.dataset.index)) * 2.5);
                pad.style.setProperty('--pad-level', level.toFixed(3));
            }
            this._levelRaf = requestAnimationFrame(tick);
        };
        this._levelRaf = requestAnimationFrame(tick);
    }

    /** Let go of everything — a re-render must never strand a gated voice. */
    releaseAll() {
        for (const pad of this._pads) pad._release?.();
        this._held.clear();
    }

    teardown() {
        this.releaseAll();
        if (this._levelRaf) {
            cancelAnimationFrame(this._levelRaf);
            this._levelRaf = null;
        }
        super.teardown();
    }
}
