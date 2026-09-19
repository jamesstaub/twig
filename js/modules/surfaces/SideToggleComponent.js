import BaseComponent from '../base/BaseComponent.js';

const ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="3.5" width="15" height="13" rx="1.5"/><path d="M12 3.5v13"/></svg>';

/**
 * Side-column toggle: the icon button in the header of a panel whose
 * surfaces have a side column (the drawbar strip). Opens and closes the
 * whole column — visualization panel and tonewheel. Pure presentation:
 * `render({ open })`, clicks through onToggle().
 */
export class SideToggleComponent extends BaseComponent {

    constructor(selector) {
        super(selector);
        this.onToggle = null;
        this.el.innerHTML = ICON;
        this.el.addEventListener('click', () => this.onToggle?.());
    }

    render({ open }) {
        const label = open ? 'Hide the visualizations' : 'Show the visualizations';
        this.el.setAttribute('aria-pressed', String(open));
        this.el.setAttribute('aria-label', label);
        this.el.title = label;
    }
}
