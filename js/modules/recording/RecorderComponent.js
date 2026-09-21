import BaseComponent from '../base/BaseComponent.js';

// Inline SVG in currentColor, never Unicode symbols: iOS Safari draws ⚙ ▶
// ⏮ ● as full-color emoji, whatever the font stack says.
const svg = (body) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
    record: svg('<circle cx="10" cy="10" r="4.5" fill="currentColor" stroke="none"/>'),
    config: svg('<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6"/>'),
    play: svg('<path d="M6.5 4.5v11l9-5.5z" fill="currentColor"/>'),
    pause: svg('<path d="M7 4.5v11M13 4.5v11" stroke-width="2.4"/>'),
    reset: svg('<path d="M5 4.5v11" stroke-width="2"/><path d="M15.5 4.5v11l-8-5.5z" fill="currentColor"/>'),
    download: svg('<path d="M10 3.5v9M6 9l4 4 4-4M4.5 16.5h11"/>'),
    expand: svg('<path d="M8 5l5 5-5 5"/>'),
    collapse: svg('<path d="M12 5l-5 5 5 5"/>'),
};

/**
 * RecorderComponent — navbar strip: record + elapsed, settings, take menu
 * with prev/next steppers (native selects don't open inside jweb),
 * play/pause, reset, and a download button opening a download menu (custom
 * DOM, not <select>, for the same jweb reason). Pure DOM; callbacks are set by
 * the controller: onRecord, onConfig, onSelect(key), onSelectStep(±1),
 * onTogglePlay, onReset, onDownload('wav'|'mid'|'zip').
 */
export class RecorderComponent extends BaseComponent {

    constructor(target) {
        super(target);
        // Phones collapse the strip to record + an expand button (recorder.css);
        // the choice outlives re-renders
        this.expanded = false;
    }

    render({ status, transport, recordings, selected, stemsAvailable } = {}) {
        this.el.innerHTML = '';
        this.el.classList.toggle('rec-expanded', this.expanded);
        const has = Boolean(selected);
        const recording = status === 'recording';
        const armed = status === 'armed';

        this.el.append(
            this.button('rec-btn' + (recording ? ' recording' : armed ? ' armed' : ''), ICONS.record, 'record',
                recording ? 'Stop recording' : armed ? 'Waiting for beat — click to cancel' : 'Record'),
        );
        if (recording || armed) {
            const elapsed = document.createElement('span');
            elapsed.className = 'rec-elapsed';
            elapsed.textContent = '0:00';
            this.el.appendChild(elapsed);
        }
        const expand = this.button('action-btn rec-icon-btn rec-expand-btn', this.expanded ? ICONS.collapse : ICONS.expand, 'expand',
            this.expanded ? 'Hide recorder controls' : 'Recorder controls');
        expand.setAttribute('aria-expanded', String(this.expanded));
        this.el.appendChild(expand);
        this.el.append(
            this.button('action-btn rec-icon-btn', ICONS.config, 'config', 'Recording settings'),
            this.stepper(recordings, selected),
            this.button('action-btn rec-icon-btn', transport === 'playing' ? ICONS.pause : ICONS.play, 'toggle',
                transport === 'playing' ? 'Pause' : 'Play', !has),
            this.button('action-btn rec-icon-btn', ICONS.reset, 'reset', 'Reset to start', !has),
            this.button('action-btn rec-icon-btn rec-download-btn', ICONS.download, 'download', 'Download take…', !has),
        );
        this.el.appendChild(this.downloadMenu(has, stemsAvailable));
    }

    /** The download button's menu: one item per export format. */
    downloadMenu(has, stemsAvailable) {
        const menu = document.createElement('div');
        menu.className = 'rec-menu hidden';
        const items = [
            ['wav', 'audio (.wav)', has],
            ['mid', 'MIDI (.mid)', has],
            ['zip', 'stems + MIDI (.zip)', has && stemsAvailable],
        ];
        for (const [kind, label, enabled] of items) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'rec-menu-item';
            item.dataset.kind = kind;
            item.textContent = label;
            item.disabled = !enabled;
            if (kind === 'zip' && !stemsAvailable) item.title = 'multitrack takes only';
            menu.appendChild(item);
        }
        return menu;
    }

    toggleMenu(open = null) {
        const menu = this.q('.rec-menu');
        menu?.classList.toggle('hidden', open === null ? undefined : !open);
    }

    /** Tick the elapsed readout in place — no re-render, so open menus survive. */
    setElapsed(seconds) {
        const el = this.q('.rec-elapsed');
        if (!el) return;
        const s = Math.floor(seconds);
        el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    /** `content` is trusted markup: an ICONS entry or a plain label. */
    button(className, content, action, title, disabled = false) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = className;
        btn.innerHTML = content;
        btn.dataset.action = action;
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.disabled = disabled;
        return btn;
    }

    stepper(recordings, selected) {
        const wrap = document.createElement('div');
        wrap.className = 'select-stepper rec-select';
        const select = document.createElement('select');
        select.className = 'control-select rec-select-menu';
        select.id = 'recording-select';
        select.setAttribute('aria-label', 'Recording');
        if (recordings.length === 0) {
            const opt = document.createElement('option');
            opt.textContent = 'no recordings';
            opt.disabled = true;
            opt.selected = true;
            select.appendChild(opt);
            select.disabled = true;
        }
        for (const r of recordings) {
            const opt = document.createElement('option');
            opt.value = r.key;
            opt.textContent = r.name;
            opt.selected = r.key === selected;
            select.appendChild(opt);
        }
        wrap.append(
            this.button('action-btn select-step-btn', '<-', 'prev', 'Previous recording', recordings.length === 0),
            select,
            this.button('action-btn select-step-btn', '->', 'next', 'Next recording', recordings.length === 0),
        );
        return wrap;
    }

    bindRenderedEvents() {
        for (const btn of this.qAll('button[data-action]')) {
            this.bindEvent(btn, 'click', () => this.dispatch(btn.dataset.action));
        }
        this.bindEvent(this.q('#recording-select'), 'change', (e) => this.onSelect?.(e.target.value));
        for (const item of this.qAll('.rec-menu-item')) {
            this.bindEvent(item, 'click', () => {
                this.toggleMenu(false);
                this.onDownload?.(item.dataset.kind);
            });
        }
        // Close the menu from anywhere else: outside click or Escape
        this.bindEvent(document, 'mousedown', (e) => {
            if (!this.q('.rec-menu')?.classList.contains('hidden') &&
                !e.target.closest('.rec-menu') && !e.target.closest('.rec-download-btn')) {
                this.toggleMenu(false);
            }
        });
        this.bindEvent(document, 'keydown', (e) => {
            if (e.key === 'Escape') this.toggleMenu(false);
        });
    }

    dispatch(action) {
        switch (action) {
            case 'record': return this.onRecord?.();
            case 'config': return this.onConfig?.();
            case 'prev': return this.onSelectStep?.(-1);
            case 'next': return this.onSelectStep?.(1);
            case 'toggle': return this.onTogglePlay?.();
            case 'reset': return this.onReset?.();
            case 'download': return this.toggleMenu();
            case 'expand': {
                this.expanded = !this.expanded;
                this.el.classList.toggle('rec-expanded', this.expanded);
                const btn = this.q('.rec-expand-btn');
                if (btn) {
                    btn.innerHTML = this.expanded ? ICONS.collapse : ICONS.expand;
                    btn.setAttribute('aria-expanded', String(this.expanded));
                }
                return undefined;
            }
            default: return undefined;
        }
    }
}
