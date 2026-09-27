/**
 * OCTAVE FIELD — a number the app can work out for itself, that the user
 * may overrule: `label  ÷2  [ 220 ]  ×2  auto`.
 *
 * Two controls in twig are this shape — the filter bank's cutoff
 * multiplier and a loaded sample's fundamental — and both are wrong by a
 * FACTOR OF TWO when they are wrong: a pitch detector that lands an octave
 * out, a bank tuned below hearing. So the steppers halve and double rather
 * than nudge, and `auto` goes back to the value the app derived, lit while
 * that is what is in force.
 *
 * ÷2 and ×2 work from the value SHOWING, so halving a derived value is one
 * click and does not need it typed out first.
 *
 * `unit` is printed after the number where one is meaningful — the
 * multiplier is a bare ratio, a fundamental is in Hz, and the Source panel
 * has a second control called "Fundamental" right above it.
 *
 * The caller owns the value; this only reads and writes it:
 *   get()        the number to show (null when there is nothing to show)
 *   set(v)       the user typed or stepped to v
 *   autoValue()  what the app derives (null when it cannot)
 *   isAuto()     whether the derived value is currently in force
 *   setAuto()    go back to it
 */

/** Steps below this are pointless for both users of this control. */
const MIN_STEPPABLE = 1e-6;

export function octaveField({
    label, unit = '', className = '', ariaLabel, min = 0, max = Number.MAX_SAFE_INTEGER,
    format = defaultFormat, autoTitle = 'Back to the value twig works out',
    get, set, autoValue, isAuto, setAuto,
}) {
    const root = document.createElement('div');
    root.className = `octave-field ${className}`.trim();

    const caption = document.createElement('span');
    caption.className = 'octave-field-label';
    caption.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'octave-field-input';
    input.min = String(min);
    input.max = String(max);
    input.step = 'any';
    if (ariaLabel) input.setAttribute('aria-label', ariaLabel);

    const halve = button('÷2', () => scale(0.5));
    const double = button('×2', () => scale(2));
    const auto = button('auto', () => setAuto());
    auto.classList.add('octave-field-auto');

    root.append(caption, halve, input);
    if (unit) {
        const units = document.createElement('span');
        units.className = 'octave-field-unit';
        units.textContent = unit;
        root.appendChild(units);
    }
    root.append(double, auto);

    function scale(factor) {
        const current = get();
        if (!(current > MIN_STEPPABLE)) return;
        set(Math.min(max, Math.max(min, current * factor)));
    }

    input.addEventListener('change', () => set(parseFloat(input.value)));

    /** Re-read the value; safe to call as often as the host likes. */
    function sync() {
        const value = get();
        // Not while it is being typed into
        if (document.activeElement !== input) input.value = value === null || value === undefined ? '' : format(value);
        const on = isAuto();
        auto.classList.toggle('is-auto', on);
        const derived = autoValue();
        auto.title = on || derived === null || derived === undefined
            ? autoTitle
            : `${autoTitle}: ${format(derived)}`;
    }

    /** Grayed out in place where it doesn't apply — never hidden. */
    function setEnabled(enabled) {
        root.classList.toggle('disabled', !enabled);
        for (const el of root.querySelectorAll('button, input')) el.disabled = !enabled;
    }

    sync();
    return { el: root, sync, setEnabled };
}

function button(text, onClick) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'action-btn octave-field-btn';
    el.textContent = text;
    el.addEventListener('click', onClick);
    return el;
}

/** 64, not 64.00 — but 1.5 keeps its half. */
function defaultFormat(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}
