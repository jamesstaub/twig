import BaseComponent from '../base/BaseComponent.js';

/**
 * Left toolbar: one button per surface plus the viz-dock toggle. Pure
 * presentation — renders from props and reports clicks through
 * onSelect(id) / onToggleDock(). Icons are inline SVG in currentColor so
 * the theme owns their color like any other text.
 */

const ICONS = {
    play: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="4" width="15" height="12" rx="1.5"/><path d="M6.5 4v7M10 4v7M13.5 4v7"/></svg>',
    mix: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 16V6M8 16v-3M12 16V9M16 16v-6"/></svg>',
    voice: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="3"/><path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3"/></svg>',
    system: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 4h14M3 8.5h14M3 11.5h14M3 13.5h14M3 15h14"/></svg>',
    wavetable: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 17V7M6.5 17v-4M10 17v-7M13.5 17V9M17 17v-3"/><path d="M3 5c3 0 4 8 14 9"/></svg>',
    settings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/></svg>',
    dock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="3.5" width="15" height="13" rx="1.5"/><path d="M12 3.5v13"/></svg>',
};

export class ToolbarComponent extends BaseComponent {

    constructor(selector) {
        super(selector);
        this.onSelect = null;
        this.onToggleDock = null;
    }

    render({ surfaces, active, dock }) {
        this.el.innerHTML = '';
        for (const s of surfaces) {
            this.el.appendChild(this.button({
                id: s.id, label: s.label, pressed: s.id === active,
                onClick: () => this.onSelect?.(s.id),
            }));
        }
        const spacer = document.createElement('span');
        spacer.className = 'surface-toolbar-spacer';
        this.el.appendChild(spacer);
        this.el.appendChild(this.button({
            id: 'dock', label: 'Viz', pressed: dock, title: 'Show visualizations beside the current surface',
            onClick: () => this.onToggleDock?.(),
        }));
    }

    button({ id, label, pressed, title, onClick }) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'surface-toolbar-btn';
        btn.dataset.surface = id;
        btn.setAttribute('aria-pressed', String(pressed));
        btn.title = title || label;
        btn.innerHTML = ICONS[id] || '';
        const text = document.createElement('span');
        text.className = 'surface-toolbar-label';
        text.textContent = label;
        btn.appendChild(text);
        this.bindEvent(btn, 'click', onClick);
        return btn;
    }
}
