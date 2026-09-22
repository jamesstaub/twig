import BaseComponent from '../base/BaseComponent.js';

/**
 * The surface toolbar — a left rail, or a row across the top of the embed
 * band: one button per surface, a divider after the ones that toggle
 * independently (Source), and a collapse button (shown where the toolbar
 * can collapse — surfaces.embed.css). Pure presentation — renders from
 * props and reports clicks through onSelect(id) / onToggleCollapsed().
 * Icons are inline SVG in currentColor so
 * the theme owns their color like any other text.
 */

const ICONS = {
    trigger: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="6" height="6" rx="1.2"/><rect x="11" y="3" width="6" height="6" rx="1.2"/><rect x="3" y="11" width="6" height="6" rx="1.2"/><rect x="11" y="11" width="6" height="6" rx="1.2"/></svg>',
    source: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 10c2-6 4-6 6 0s4 6 6 0 2-6 3 0"/></svg>',
    gain: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 16V6M8 16v-3M12 16V9M16 16v-6"/></svg>',
    filter: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 7h7c2 0 3 1.5 4 4s2 5 3 5"/><path d="M3 16h14"/></svg>',
    sequence: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3V8h3v6h3V5h3v9h2"/></svg>',
    convolution: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 16V4M7.5 16V9M11 16v-4M14.5 16v-2.5M17.5 16v-1.5"/></svg>',
    adsr: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16l3-11 3 6h5l3 5"/></svg>',
    presets: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="12" y="3" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><rect x="12" y="12" width="5" height="5" rx="1"/><path d="M8 5.5h4M5.5 8v4M14.5 8v4M8 14.5h4"/></svg>',
    settings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/></svg>',
};

const ICON_CHEVRON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 7.5l5 5"/></svg>';

export class ToolbarComponent extends BaseComponent {

    constructor(selector) {
        super(selector);
        this.onSelect = null;
        this.onToggleCollapsed = null;
    }

    render({ surfaces, collapsed }) {
        this.el.innerHTML = '';
        for (const s of surfaces) {
            this.el.appendChild(this.button({
                id: s.id, label: s.label, title: s.title, pressed: s.showing,
                onClick: () => this.onSelect?.(s.id),
            }));
            // Source toggles on its own, apart from the surfaces below it
            if (s.independent) {
                const divider = document.createElement('span');
                divider.className = 'surface-toolbar-divider';
                this.el.appendChild(divider);
            }
        }

        const collapse = document.createElement('button');
        collapse.type = 'button';
        collapse.className = 'surface-toolbar-collapse';
        collapse.setAttribute('aria-expanded', String(!collapsed));
        collapse.title = collapse.ariaLabel = collapsed ? 'Show the toolbar' : 'Hide the toolbar';
        collapse.innerHTML = ICON_CHEVRON;
        this.bindEvent(collapse, 'click', () => this.onToggleCollapsed?.());
        this.el.appendChild(collapse);
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
