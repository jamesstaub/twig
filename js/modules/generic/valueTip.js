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
let holdWhile = null;
let attached = null;
let expandable = false;

function detach() {
    attached?.classList.remove('value-tip-attached');
    attached = null;
}

/**
 * Deferred hide that respects the current holdWhile predicate: while it
 * returns true (host controls engaged), keep re-polling instead of hiding.
 */
function scheduleHide(ms) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        if (holdWhile && holdWhile()) scheduleHide(250);
        else ValueTip.hide();
    }, ms);
}

function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'value-tip';
    // Interactive tips (embedded buttons) stay open while hovered
    el.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    el.addEventListener('mouseleave', () => {
        if (interactive) scheduleHide(500);
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
    show(text, x, y, { autoHideMs = 700, label = '', extra = null, interactive: interactiveOpt = false, holdWhile: holdWhileOpt = null, placement = 'above', attachTo = null, onExpand = null } = {}) {
        const tip = ensure();
        interactive = Boolean(interactiveOpt);
        expandable = Boolean(onExpand);
        // While this predicate returns true the tip refuses to auto-hide
        // (e.g. a sequencer column's controls are still active/focused)
        holdWhile = holdWhileOpt;
        // attachTo: the control the tip visually merges with — it carries
        // .value-tip-attached (same surface + outline as the tip) until
        // the tip hides or moves to another control
        if (attached !== attachTo) detach();
        if (attachTo) {
            attached = attachTo;
            attached.classList.add('value-tip-attached');
        }
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
        if (onExpand) {
            // Corner ⤢ opens the full editor for whatever the tip describes.
            // pointer-events: auto in CSS, so it works even on plain
            // (click-through) readout tips.
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'value-tip-expand';
            btn.textContent = '⤢';
            btn.title = 'overtone settings';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                ValueTip.hide();
                onExpand();
            });
            tip.appendChild(btn);
        }
        tip.classList.add('visible');
        // Clamp after content is set so the width is real
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        tip.classList.toggle('attached-left', placement === 'left' && Boolean(attachTo));
        if (placement === 'left' && attachTo) {
            // Merged with the control: exact same top and height as the
            // attached element, flush at its left edge — the pair reads
            // as one panel
            const ar = attachTo.getBoundingClientRect();
            tip.style.height = `${ar.height}px`;
            tip.style.top = `${ar.top}px`;
            tip.style.left = `${Math.max(4, ar.left - w)}px`;
        } else if (placement === 'left') {
            // Beside the control (right edge flush at x, centered on y) —
            // for cramped layouts where "above" would cover the control
            // and an interactive tip would block its pointer events
            tip.style.height = '';
            tip.style.left = `${Math.max(4, x - w)}px`;
            tip.style.top = `${Math.max(4, Math.min(y - h / 2, window.innerHeight - h - 4))}px`;
        } else {
            tip.style.height = '';
            tip.style.left = `${Math.max(4, Math.min(x - w / 2, window.innerWidth - w - 4))}px`;
            tip.style.top = `${Math.max(4, y - h - 8)}px`;
        }
        clearTimeout(hideTimer);
        if (autoHideMs > 0) {
            scheduleHide(autoHideMs);
        }
    },

    hide() {
        clearTimeout(hideTimer);
        holdWhile = null;
        detach();
        el?.classList.remove('visible');
    },

    /**
     * The controlling gesture ended (dial released). Interactive tips get
     * a grace period so the pointer can travel into them; plain tips hide.
     * A holdWhile predicate keeps either kind alive while it returns true.
     */
    release(graceMs = 1200) {
        if (!interactive && !holdWhile && !expandable) {
            this.hide();
            return;
        }
        // Expandable readouts get a short window so the pointer can reach
        // the corner ⤢ (hovering it keeps the tip alive)
        scheduleHide(interactive ? graceMs : 700);
    },
};
