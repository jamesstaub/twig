import BaseComponent from '../base/BaseComponent.js';

/**
 * RecorderComponent — navbar strip: record, settings, take menu with
 * prev/next steppers (native selects don't open inside jweb), play/pause,
 * reset, and wav/mid downloads. Pure DOM; callbacks are set by the
 * controller: onRecord, onConfig, onSelect(key), onSelectStep(±1),
 * onTogglePlay, onReset, onDownload('wav'|'mid').
 */
export class RecorderComponent extends BaseComponent {

    render({ status, transport, recordings, selected } = {}) {
        this.el.innerHTML = '';
        const has = Boolean(selected);
        const recording = status === 'recording';
        const armed = status === 'armed';

        this.el.append(
            this.button('rec-btn' + (recording ? ' recording' : armed ? ' armed' : ''), '●', 'record',
                recording ? 'Stop recording' : armed ? 'Waiting for beat — click to cancel' : 'Record'),
            this.button('action-btn rec-icon-btn', '⚙', 'config', 'Recording settings'),
            this.stepper(recordings, selected),
            this.button('action-btn rec-icon-btn', transport === 'playing' ? '❚❚' : '▶', 'toggle',
                transport === 'playing' ? 'Pause' : 'Play', !has),
            this.button('action-btn rec-icon-btn', '⏮', 'reset', 'Reset to start', !has),
            this.button('action-btn rec-save-btn', 'wav', 'wav', 'Download audio (.wav)', !has),
            this.button('action-btn rec-save-btn', 'mid', 'mid', 'Download MIDI (.mid)', !has),
        );
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
    }

    dispatch(action) {
        switch (action) {
            case 'record': return this.onRecord?.();
            case 'config': return this.onConfig?.();
            case 'prev': return this.onSelectStep?.(-1);
            case 'next': return this.onSelectStep?.(1);
            case 'toggle': return this.onTogglePlay?.();
            case 'reset': return this.onReset?.();
            case 'wav': return this.onDownload?.('wav');
            case 'mid': return this.onDownload?.('mid');
            default: return undefined;
        }
    }
}
