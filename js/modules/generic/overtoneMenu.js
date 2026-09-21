import { AppState } from '../../config.js';
import { calculateFrequency } from '../../utils.js';
import { showStatus } from '../../domUtils.js';
import { DrawbarsActions } from '../drawbars/drawbarsActions.js';
import { midiOutputRouter } from '../midi/midiOutputRouter.js';
import { OvertoneSignalActions } from '../overtoneSignal/overtoneSignalActions.js';

/**
 * The per-overtone context menu (copy frequency / set as fundamental /
 * set as MIDI clock)
 * and the press-and-hold gesture that opens it on touch.
 *
 * Shared because more than one surface exposes an overtone: the drawbar
 * strip's bars and trigger pads, and the Play surface's pads. Only ONE
 * menu exists at a time — it is body-attached and fixed, so no host's
 * overflow can clip it.
 */

// Press-and-hold timing, and the travel that turns a press into a drag
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;

let menu = null;
let onDismiss = null;
let onEsc = null;

async function copyFrequency(freq) {
    const text = freq.toFixed(4).replace(/\.?0+$/, '');
    try {
        await navigator.clipboard.writeText(text);
        showStatus(`Copied ${text} Hz`, 'success');
    } catch {
        // Clipboard API unavailable (insecure context / embedded webview)
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        showStatus(ok ? `Copied ${text} Hz` : 'Copy failed', ok ? 'success' : 'error');
    }
}

export function closeOvertoneMenu() {
    if (menu) {
        menu.remove();
        menu = null;
    }
    if (onDismiss) {
        document.removeEventListener('pointerdown', onDismiss);
        onDismiss = null;
    }
    if (onEsc) {
        document.removeEventListener('keydown', onEsc);
        onEsc = null;
    }
}

/** Open the menu for one overtone at viewport point (x, y). */
export function openOvertoneMenu(index, x, y) {
    closeOvertoneMenu();

    const ratio = AppState.currentSystem.ratios[index];
    if (!(ratio > 0)) return;
    const freq = calculateFrequency(ratio);
    const freqLabel = `${freq.toFixed(freq >= 100 ? 2 : 3)} Hz`;

    menu = document.createElement('div');
    menu.className = 'drawbar-context-menu';

    const addItem = (label, action, enabled = true) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'drawbar-context-menu-item';
        btn.textContent = label;
        btn.disabled = !enabled;
        btn.addEventListener('click', () => {
            closeOvertoneMenu();
            action();
        });
        menu.appendChild(btn);
    };

    addItem(`Copy Frequency (${freqLabel})`, () => copyFrequency(freq));
    addItem('Set as Fundamental', () => DrawbarsActions.setDrawbarAsFundamental(index));
    // A shortcut to the Sequence panel's "Output as MIDI clock" (exclusive:
    // it takes the clock from whichever voice had it). Stays in the menu,
    // disabled, where it doesn't apply — no MIDI output, or already the clock
    const isClock = AppState.midiClockVoice === index;
    addItem(
        isClock ? 'MIDI Clock ✓' : 'Set as MIDI Clock',
        () => OvertoneSignalActions.setMidiClockVoice(index),
        midiOutputRouter.available && !isClock,
    );

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - rect.width - 4))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - rect.height - 4))}px`;

    onDismiss = (e) => {
        if (!menu.contains(e.target)) closeOvertoneMenu();
    };
    onEsc = (e) => {
        if (e.key === 'Escape') closeOvertoneMenu();
    };
    // Defer: the gesture that opened the menu must not immediately dismiss
    // it (the long press is still holding its own pointer down)
    setTimeout(() => {
        document.addEventListener('pointerdown', onDismiss);
        document.addEventListener('keydown', onEsc);
    }, 0);
}

/**
 * True for a `contextmenu` a touch/pen press-and-hold raised (Android
 * Chrome fires one natively; the event carries the pointerType there).
 * Pads use it to refuse the menu on touch: holding a pad IS playing it.
 */
export function isTouchContextMenu(e) {
    return Boolean(e.pointerType) && e.pointerType !== 'mouse';
}

/**
 * Arm a press-and-hold for ONE pointer gesture: `fire(x, y)` runs after
 * LONG_PRESS_MS unless the pointer travels past the slop or lifts first.
 * Returns a cancel function; it also cleans itself up, so a host that has
 * nothing else to cancel can ignore the return value.
 *
 * Mouse pointers are skipped — they already have right-click, and a mouse
 * resting mid-drag must not sprout a menu.
 */
export function armLongPress(el, e, fire) {
    if (e.pointerType === 'mouse') return () => {};
    const x = e.clientX;
    const y = e.clientY;

    let timer = null;
    const cancel = () => {
        if (timer === null) return;
        clearTimeout(timer);
        timer = null;
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', cancel);
        el.removeEventListener('pointercancel', cancel);
    };
    const onMove = (ev) => {
        if (Math.hypot(ev.clientX - x, ev.clientY - y) > LONG_PRESS_SLOP_PX) cancel();
    };
    timer = setTimeout(() => {
        cancel();
        fire(x, y);
    }, LONG_PRESS_MS);

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    return cancel;
}
