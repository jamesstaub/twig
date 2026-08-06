/**
 * ValueTip — one floating value readout for any control being adjusted
 * (drawbar sliders, dials). Singleton: only one control is under the
 * pointer at a time. Position is viewport-fixed and clamped on-screen.
 *
 *   ValueTip.show('75%', x, y);                  // value only
 *   ValueTip.show('L50', x, y, { label: 'pan' }) // control name above value
 *   ValueTip.hide();              // or let the auto-hide timer clear it
 */

let el = null;
let hideTimer = null;
let interactive = false;

function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'value-tip';
    // Interactive tips (embedded buttons) stay open while hovered
    el.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    el.addEventListener('mouseleave', () => {
        if (interactive) hideTimer = setTimeout(() => ValueTip.hide(), 500);
    });
    document.body.appendChild(el);
    return el;
}

export const ValueTip = {
    /**
     * Show near (x, y) — typically above the control's thumb/knob.
     * `extra` embeds an element under the value (e.g. the live sequence
     * preview canvas while adjusting sequencer dials).
     */
    show(text, x, y, { autoHideMs = 700, label = '', extra = null, interactive: interactiveOpt = false } = {}) {
        const tip = ensure();
        interactive = Boolean(interactiveOpt);
        tip.classList.toggle('interactive', interactive);
        tip.textContent = '';
        if (label) {
            const labelEl = document.createElement('span');
            labelEl.className = 'value-tip-label';
            labelEl.textContent = label;
            tip.appendChild(labelEl);
        }
        const valueEl = document.createElement('span');
        valueEl.className = 'value-tip-value';
        valueEl.textContent = text;
        tip.appendChild(valueEl);
        if (extra) tip.appendChild(extra);
        tip.classList.add('visible');
        // Clamp after content is set so the width is real
        const w = tip.offsetWidth;
        tip.style.left = `${Math.max(4, Math.min(x - w / 2, window.innerWidth - w - 4))}px`;
        tip.style.top = `${Math.max(4, y - tip.offsetHeight - 8)}px`;

        clearTimeout(hideTimer);
        if (autoHideMs > 0) {
            hideTimer = setTimeout(() => this.hide(), autoHideMs);
        }
    },

    hide() {
        clearTimeout(hideTimer);
        el?.classList.remove('visible');
    },

    /**
     * The controlling gesture ended (dial released). Interactive tips get
     * a grace period so the pointer can travel into them; plain tips hide.
     */
    release(graceMs = 1200) {
        if (!interactive) {
            this.hide();
            return;
        }
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => this.hide(), graceMs);
    },
};
