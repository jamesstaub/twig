import BaseComponent from '../base/BaseComponent.js';
import { ShapePanel } from '../shape/ShapePanel.js';

const ICON_SHAPE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 12c2-7 4-7 6 0s4 7 6 0 2-7 3 0"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-1.3 1.3"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0L5 10.8a3 3 0 0 0 4.2 4.2l1.3-1.3"/></svg>';

/**
 * Overtone toolbar — the fixed bar at the bottom of every per-overtone
 * panel (the drawbar strip, the Sequence panel):
 *
 *   [Reset][Randomize]  [slot]  [dock ········]  [link][shape]
 *
 * `slot` is the host panel's own content (the Sequence panel puts its
 * voice stepper there; see `slotEl`). `dock` holds the shape panel while
 * shape mode is on — a reserved flex cell, so nothing in the bar moves
 * when it appears (overtone-toolbar.css explains the narrow layout).
 *
 * Built once (the slot's content must survive re-renders); render() only
 * syncs state. Callbacks: onReset(), onRandomize(), onToggleLink(),
 * onToggleShape().
 */
export class OvertoneToolbarComponent extends BaseComponent {

    constructor(target) {
        super(target);
        this.onReset = null;
        this.onRandomize = null;
        this.onToggleLink = null;
        this.onToggleShape = null;
        this.panel = new ShapePanel();
        this.build();
    }

    build() {
        this.el.classList.add('overtone-toolbar');
        this.el.innerHTML = '';

        const actions = document.createElement('div');
        actions.className = 'overtone-toolbar-group';
        actions.append(
            this.button('action-btn focus-ring', 'reset', 'Reset', 'Reset this panel\'s values for every overtone'),
            this.button('action-btn focus-ring', 'randomize', 'Randomize', 'Randomize this panel\'s values for every overtone'),
        );

        this.slotEl = document.createElement('div');
        this.slotEl.className = 'overtone-toolbar-slot';

        this.dockEl = document.createElement('div');
        this.dockEl.className = 'overtone-toolbar-dock';

        const modes = document.createElement('div');
        modes.className = 'overtone-toolbar-group';
        modes.append(
            this.button('overtone-mode-btn', 'link', 'link', 'Link all: every edit applies to all overtones (or hold cmd/ctrl)', ICON_LINK),
            this.button('overtone-mode-btn', 'shape', 'shape', 'Shape: an edit sculpts every overtone along a waveform contour (or hold shift)', ICON_SHAPE),
        );

        this.el.append(actions, this.slotEl, this.dockEl, modes);
    }

    button(className, action, text, title, icon = '') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = className;
        btn.dataset.action = action;
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.innerHTML = `${icon}<span class="overtone-toolbar-btn-text">${text}</span>`;
        return btn;
    }

    render({ link, shape, panel }) {
        this.q('[data-action="link"]').setAttribute('aria-pressed', String(Boolean(link)));
        this.q('[data-action="shape"]').setAttribute('aria-pressed', String(Boolean(shape)));
        if (panel) {
            this.panel.refresh();
            if (!this.dockEl.contains(this.panel.el)) this.dockEl.appendChild(this.panel.el);
        } else {
            this.panel.el.remove();
        }
    }

    bindRenderedEvents() {
        const handlers = {
            reset: () => this.onReset?.(),
            randomize: () => this.onRandomize?.(),
            link: () => this.onToggleLink?.(),
            shape: () => this.onToggleShape?.(),
        };
        for (const btn of this.qAll('button[data-action]')) {
            const handler = handlers[btn.dataset.action];
            if (handler) this.bindEvent(btn, 'click', handler);
        }
    }
}
