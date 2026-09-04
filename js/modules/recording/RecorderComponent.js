import BaseComponent from '../base/BaseComponent.js';

/**
 * RecorderComponent — navbar strip: record + elapsed, settings, take menu
 * with prev/next steppers (native selects don't open inside jweb),
 * play/pause, reset, and a ↓ button opening a download menu (custom DOM,
 * not <select>, for the same jweb reason). Pure DOM; callbacks are set by
 * the controller: onRecord, onConfig, onSelect(key), onSelectStep(±1),
 * onTogglePlay, onReset, onDownload('wav'|'mid'|'zip').
 */
export class RecorderComponent extends BaseComponent {

    render({ status, transport, recordings, selected, stemsAvailable } = {}) {
        this.el.innerHTML = '';
        const has = Boolean(selected);
        const recording = status === 'recording';
        const armed = status === 'armed';

        this.el.append(
            this.button('rec-btn' + (recording ? ' recording' : armed ? ' armed' : ''), '●', 'record',
                recording ? 'Stop recording' : armed ? 'Waiting for beat — click to cancel' : 'Record'),
        );
        if (recording || armed) {
            const elapsed = document.createElement('span');
            elapsed.className = 'rec-elapsed';
            elapsed.textContent = '0:00';
            this.el.appendChild(elapsed);
        }
        this.el.append(
            this.button('action-btn rec-icon-btn', '⚙', 'config', 'Recording settings'),
            this.stepper(recordings, selected),
            this.button('action-btn rec-icon-btn', transport === 'playing' ? '❚❚' : '▶', 'toggle',
                transport === 'playing' ? 'Pause' : 'Play', !has),
            this.button('action-btn rec-icon-btn', '⏮', 'reset', 'Reset to start', !has),
            this.button('action-btn rec-icon-btn rec-download-btn', '↓', 'download', 'Download take…', !has),
        );
        this.el.appendChild(this.downloadMenu(has, stemsAvailable));
    }

    /** The ↓ button's menu: one item per export format. */
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

    button(className, text, action, title, disabled = false) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = className;
        btn.textContent = text;
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
            default: return undefined;
        }
    }
}
