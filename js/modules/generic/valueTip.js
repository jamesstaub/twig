/**
 * ValueTip — one floating popover, viewport-fixed and clamped on-screen.
 * Singleton. Today its only use is the Overtone System's "?" description
 * (click-toggled, `interactive` so the text can be selected); every
 * control readout is inline in its widget instead. Slated to retire with
 * the "?" popover's move onto the new surfaces.
 *
 *   ValueTip.show(html, x, y, { html: true, wrap: true, interactive: true, autoHideMs: 0 });
 *   ValueTip.hide();
 */

let el = null;
let hideTimer = null;

function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'value-tip';
    document.body.appendChild(el);
    return el;
}

export const ValueTip = {
    /** Show above (x, y). */
    show(text, x, y, { autoHideMs = 700, label = '', interactive = false, html = false, wrap = false } = {}) {
        const tip = ensure();
        // interactive: accepts the pointer (pointer-events: auto in CSS)
        tip.classList.toggle('interactive', Boolean(interactive));
        // wrap: a longer, left-aligned block (e.g. a system description)
        // instead of the default single-line centered readout
        tip.classList.toggle('value-tip-wrap', Boolean(wrap));
        tip.textContent = '';
        if (label) {
            const labelEl = document.createElement('span');
            labelEl.className = 'value-tip-label';
            labelEl.textContent = label;
            tip.appendChild(labelEl);
        }
        const valueEl = document.createElement('span');
        valueEl.className = 'value-tip-value';
        // `html` is only ever passed static, internally-authored content
        // (system descriptions from config.js) — never external/user input
        if (html) valueEl.innerHTML = text;
        else valueEl.textContent = text;
        tip.appendChild(valueEl);
        tip.classList.add('visible');
        // Clamp after content is set so the width is real
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        tip.style.left = `${Math.max(4, Math.min(x - w / 2, window.innerWidth - w - 4))}px`;
        tip.style.top = `${Math.max(4, y - h - 8)}px`;
        clearTimeout(hideTimer);
        if (autoHideMs > 0) hideTimer = setTimeout(() => ValueTip.hide(), autoHideMs);
    },

    hide() {
        clearTimeout(hideTimer);
        // Drop .interactive with .visible: the tip only ever hides via
        // opacity, and a stranded pointer-events:auto element at its last
        // fixed position would silently eat clicks meant for controls
        el?.classList.remove('visible', 'interactive', 'value-tip-wrap');
    },
};
