import { AppState } from '../../config.js';
import { autoFilterMultiplier } from '../../audio.js';
import { FILTER_MULTIPLIER_CHANGED } from '../../events.js';
import {
    FILTER_MULTIPLIER_MAX, FILTER_MULTIPLIER_MIN, OvertoneSignalActions,
} from '../overtoneSignal/overtoneSignalActions.js';

/**
 * The filter bank's multiplier, in the drawbar strip's footer.
 *
 * ONE number over every voice's cutoff series (AppState.filterMultiplier).
 * The app derives it — a bank tuned below hearing gets lifted into it by
 * octaves — and this is where that derivation becomes visible and
 * editable: ‹ ÷2  ×N  ×2 › plus the number itself, for the times the
 * heuristic's answer is not the one you want.
 *
 * It lives in the strip's footer, which four surfaces share, so it is
 * DISABLED rather than hidden outside the Filter family — nothing in that
 * bar appears, disappears or moves.
 *
 * Retuning the bank overwrites whatever is typed here (see
 * syncFilterMultiplier in audio.js), so the field follows the value rather
 * than owning it.
 */
export function mountFilterMultiplier(slotEl) {
    slotEl.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'filter-multiplier';

    const label = document.createElement('span');
    label.className = 'filter-multiplier-label';
    label.textContent = 'cutoff ×';

    const halve = button('÷2', () => step(0.5));
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'filter-multiplier-input';
    input.min = String(FILTER_MULTIPLIER_MIN);
    input.max = String(FILTER_MULTIPLIER_MAX);
    input.step = 'any';
    input.setAttribute('aria-label', 'Filter cutoff multiplier for every overtone');
    const double = button('×2', () => step(2));
    // Back to what the fundamental and the system imply
    const auto = button('auto', () => OvertoneSignalActions.setFilterMultiplier(autoFilterMultiplier()));
    auto.classList.add('filter-multiplier-auto');

    root.append(label, halve, input, double, auto);
    slotEl.appendChild(root);

    function step(factor) {
        OvertoneSignalActions.setFilterMultiplier(OvertoneSignalActions.getFilterMultiplier() * factor);
    }

    input.addEventListener('change', () => OvertoneSignalActions.setFilterMultiplier(input.value));

    const sync = () => {
        const value = OvertoneSignalActions.getFilterMultiplier();
        // Not while it is being typed in
        if (document.activeElement !== input) input.value = formatMultiplier(value);
        const isAuto = value === autoFilterMultiplier();
        auto.classList.toggle('is-auto', isAuto);
        auto.title = isAuto
            ? 'The multiplier the fundamental and system imply'
            : `Back to ×${formatMultiplier(autoFilterMultiplier())}, what the fundamental and system imply`;
    };
    document.addEventListener(FILTER_MULTIPLIER_CHANGED, sync);
    sync();

    /** Grayed out in place on the families it has nothing to do with. */
    const setFamily = (family) => {
        const on = family === 'filter';
        root.classList.toggle('disabled', !on);
        for (const el of root.querySelectorAll('button, input')) el.disabled = !on;
    };
    setFamily(null);
    return { sync, setFamily };
}

function button(text, onClick) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'action-btn filter-multiplier-btn';
    el.textContent = text;
    el.addEventListener('click', onClick);
    return el;
}

/** ×64, not ×64.00 — but ×1.5 keeps its half. */
export function formatMultiplier(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** True while AppState holds exactly what the heuristic would choose. */
export function multiplierIsAuto() {
    return AppState.filterMultiplier === autoFilterMultiplier();
}
