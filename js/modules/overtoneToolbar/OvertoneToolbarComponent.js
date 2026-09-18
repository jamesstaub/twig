import BaseComponent from '../base/BaseComponent.js';
import { ShapePanel } from '../shape/ShapePanel.js';

const ICON_SHAPE = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 12c2-7 4-7 6 0s4 7 6 0 2-7 3 0"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-1.3 1.3"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0L5 10.8a3 3 0 0 0 4.2 4.2l1.3-1.3"/></svg>';

/**
 * Overtone toolbar — the fixed bar at the bottom of every per-overtone
 * panel (the drawbar strip, the Sequence panel):
 *
 *   [Reset][Randomize]  [slot]      [ (shape) contour · stepper · cycles ] [link]
 *
 * `slot` is the host panel's own content (the Sequence panel puts its
 * voice stepper there; see `slotEl`). The shape box is always there — its
 * toggle plus the shape panel, whose controls are disabled until shape is
 * in effect — so nothing in the bar ever appears, disappears or moves.
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

        const shapeBox = document.createElement('div');
        shapeBox.className = 'overtone-toolbar-shape';
        shapeBox.append(
            this.button('overtone-mode-btn', 'shape', 'shape', 'Shape: an edit sculpts every overtone along a waveform contour (or hold shift)', ICON_SHAPE),
            this.panel.el,
        );

        const modes = document.createElement('div');
        modes.className = 'overtone-toolbar-group overtone-toolbar-modes';
        modes.append(
            shapeBox,
            this.button('overtone-mode-btn', 'link', 'link', 'Link all: every edit applies to all overtones (or hold cmd/ctrl)', ICON_LINK),
        );

        this.el.append(actions, this.slotEl, modes);
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

    render({ link, shape }) {
        this.q('[data-action="link"]').setAttribute('aria-pressed', String(Boolean(link)));
        this.q('[data-action="shape"]').setAttribute('aria-pressed', String(Boolean(shape)));
        this.panel.refresh();
        this.panel.setEnabled(Boolean(shape));
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
