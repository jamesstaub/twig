import { autoFilterMultiplier } from '../../audio.js';
import { FILTER_MULTIPLIER_CHANGED } from '../../events.js';
import { octaveField } from '../generic/octaveField.js';
import {
    FILTER_MULTIPLIER_MAX, FILTER_MULTIPLIER_MIN, OvertoneSignalActions,
} from '../overtoneSignal/overtoneSignalActions.js';

/**
 * The filter bank's multiplier, in the drawbar strip's footer.
 *
 * ONE number over every voice's cutoff series (AppState.filterMultiplier).
 * The app derives it — a bank tuned below hearing gets lifted into it by
 * octaves — and this is where that derivation becomes visible and
 * editable, for the times the heuristic's answer is not the one you want.
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
    const field = octaveField({
        label: 'cutoff ×',
        className: 'filter-multiplier',
        ariaLabel: 'Filter cutoff multiplier for every overtone',
        min: FILTER_MULTIPLIER_MIN,
        max: FILTER_MULTIPLIER_MAX,
        autoTitle: 'The multiplier the fundamental and system imply',
        get: () => OvertoneSignalActions.getFilterMultiplier(),
        set: (v) => OvertoneSignalActions.setFilterMultiplier(v),
        autoValue: () => autoFilterMultiplier(),
        isAuto: () => OvertoneSignalActions.getFilterMultiplier() === autoFilterMultiplier(),
        setAuto: () => OvertoneSignalActions.setFilterMultiplier(autoFilterMultiplier()),
    });
    slotEl.appendChild(field.el);

    document.addEventListener(FILTER_MULTIPLIER_CHANGED, field.sync);

    return {
        sync: field.sync,
        /** Live only on the Filter surface; grayed out on the other three. */
        setFamily: (family) => field.setEnabled(family === 'filter'),
    };
}
