import BaseComponent from '../base/BaseComponent.js';
import { midiConfig } from '../../appConfig.js';
import { showStatus } from '../../domUtils.js';
import { cycleStepper } from '../generic/cycleStepper.js';
import { CROSSFADER_MAX, PresetActions } from './presetActions.js';
import { BANK_COUNT, presetStore } from './presetStore.js';

/**
 * The Presets surface: the 32 banks as a grid (click recalls a stored
 * bank, selects an empty one), Store/Clear for the selected bank, the A/B
 * crossfader, and the JSON view. Built once;
 * sync() brings it up to date on PRESETS_CHANGED without rebuilding, so
 * the crossfader mid-sweep and pasted JSON survive. Styles: presets.css.
 */
export class PresetsComponent extends BaseComponent {

    render() {
        this.teardown();
        this.el.innerHTML = '';
        this.banks = [];
        this.el.append(this.buildBanks(), this.buildInterpolation(), this.buildJSON());
        this.sync();
    }

    // ---- banks ----

    buildBanks() {
        const card = this.card('Banks');
        const grid = document.createElement('div');
        grid.className = 'preset-grid';
        grid.setAttribute('role', 'listbox');
        for (let i = 0; i < BANK_COUNT; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'preset-bank';
            btn.dataset.index = i;
            btn.setAttribute('role', 'option');
            const num = document.createElement('span');
            num.className = 'preset-bank-number';
            num.textContent = i + 1;
            const badge = document.createElement('span');
            badge.className = 'preset-bank-badge';
            btn.append(num, badge);
            // A stored bank recalls on click; an empty one is just selected
            // (the target for Store)
            this.bindEvent(btn, 'click', () => (presetStore.has(i) ? PresetActions.recall(i) : PresetActions.select(i)));
            grid.appendChild(btn);
            this.banks.push(btn);
        }

        const actions = document.createElement('div');
        actions.className = 'preset-actions';
        this.nameInput = document.createElement('input');
        this.nameInput.type = 'text';
        this.nameInput.className = 'preset-name-input';
        this.nameInput.placeholder = 'Preset name';
        this.nameInput.maxLength = 40;
        this.bindEvent(this.nameInput, 'change', () => {
            if (presetStore.has(PresetActions.selected)) PresetActions.rename(PresetActions.selected, this.nameInput.value);
        });
        this.storeBtn = this.button('Store', () => PresetActions.store(this.nameInput.value));
        this.clearBtn = this.button('Clear', () => PresetActions.clear());
        actions.append(this.nameInput, this.storeBtn, this.clearBtn);

        this.status = document.createElement('p');
        this.status.className = 'preset-status';
        card.append(grid, actions, this.status);
        return card;
    }

    // ---- interpolation ----

    buildInterpolation() {
        const card = this.card('Interpolate');
        const stored = () => [null, ...presetStore.list().map((b, i) => (b ? i : null)).filter((i) => i !== null)];
        const renderSlot = (el, index) => {
            el.textContent = index === null ? '—' : this.bankLabel(index);
        };
        this.slotA = cycleStepper({
            options: stored, get: () => PresetActions.slotA, set: (i) => PresetActions.setSlotA(i),
            render: renderSlot, className: 'preset-slot-stepper',
        });
        this.slotB = cycleStepper({
            options: stored, get: () => PresetActions.slotB, set: (i) => PresetActions.setSlotB(i),
            render: renderSlot, className: 'preset-slot-stepper',
        });
        const slots = document.createElement('div');
        slots.className = 'preset-slots';
        slots.append(this.slotRow('A', this.slotA), this.slotRow('B', this.slotB));

        const fader = document.createElement('div');
        fader.className = 'preset-crossfader';
        this.fader = document.createElement('input');
        this.fader.type = 'range';
        this.fader.min = 0;
        this.fader.max = CROSSFADER_MAX;
        this.fader.step = 1;
        this.fader.className = 'slider-input preset-crossfader-input';
        this.fader.setAttribute('aria-label', 'Preset crossfader');
        this.bindEvent(this.fader, 'input', () => PresetActions.setCrossfade(this.fader.value));
        this.faderValue = document.createElement('span');
        this.faderValue.className = 'preset-crossfader-value';
        fader.append(this.fader, this.faderValue);

        this.faderHint = document.createElement('p');
        this.faderHint.className = 'settings-hint';
        const actions = document.createElement('div');
        actions.className = 'preset-actions';
        this.clearInterpBtn = this.button('Clear', () => PresetActions.clearInterpolation());
        this.clearInterpBtn.title = 'Unassign A and B and return to the sound before the crossfade';
        actions.append(this.clearInterpBtn);
        card.append(slots, fader, actions, this.faderHint);
        return card;
    }

    slotRow(letter, stepper) {
        const row = document.createElement('div');
        row.className = 'preset-slot';
        const label = document.createElement('span');
        label.className = 'preset-slot-letter';
        label.textContent = letter;
        row.append(label, stepper);
        return row;
    }

    // ---- JSON ----

    buildJSON() {
        const card = this.card('JSON');
        const bar = document.createElement('div');
        bar.className = 'preset-actions';
        this.jsonToggle = this.button('Show state', () => this.toggleJSON());
        this.jsonToggle.setAttribute('aria-pressed', 'false');
        const copy = this.button('Copy', () => this.copyJSON());
        const apply = this.button('Apply', () => this.applyJSON());
        bar.append(this.jsonToggle, copy, apply);

        this.json = document.createElement('textarea');
        this.json.className = 'preset-json';
        this.json.spellcheck = false;
        this.json.placeholder = 'Paste a twig state or preset here and Apply';
        this.json.hidden = true;
        this.json.rows = 12;

        card.append(bar, this.json, this.hint('Show state fills the box with the current sound; edit or paste JSON and Apply to load it.'));
        return card;
    }

    toggleJSON() {
        const show = this.json.hidden;
        if (show) this.json.value = PresetActions.toJSON();
        this.json.hidden = !show;
        this.jsonToggle.textContent = show ? 'Refresh state' : 'Show state';
        this.jsonToggle.setAttribute('aria-pressed', String(show));
    }

    async copyJSON() {
        const text = this.json.hidden || !this.json.value ? PresetActions.toJSON() : this.json.value;
        try {
            await navigator.clipboard.writeText(text);
            showStatus('Copied state JSON', 'success');
        } catch {
            // Clipboard API unavailable (jweb): leave it selected in the box
            this.json.hidden = false;
            this.json.value = text;
            this.json.select();
            showStatus('Select-all and copy from the box', 'info');
        }
    }

    applyJSON() {
        if (this.json.hidden || !this.json.value.trim()) {
            this.json.hidden = false;
            this.json.focus();
            return;
        }
        PresetActions.applyJSON(this.json.value);
    }

    // ---- sync ----

    /** Bring every control in line with the actions' state. */
    sync() {
        const selected = PresetActions.selected;
        const loaded = PresetActions.loaded;
        const { slotA, slotB } = PresetActions;
        this.banks.forEach((btn, i) => {
            const bank = presetStore.get(i);
            btn.classList.toggle('stored', Boolean(bank));
            btn.classList.toggle('selected', i === selected);
            btn.classList.toggle('loaded', i === loaded);
            btn.setAttribute('aria-selected', String(i === selected));
            btn.title = bank ? `${i + 1}: ${bank.name || 'untitled'}` : `${i + 1}: empty`;
            btn.lastChild.textContent = i === slotA && i === slotB ? 'AB' : i === slotA ? 'A' : i === slotB ? 'B' : '';
        });
        const selectedBank = presetStore.get(selected);
        if (document.activeElement !== this.nameInput) this.nameInput.value = selectedBank?.name || '';
        this.clearBtn.disabled = !selectedBank;

        if (loaded === null) {
            this.status.textContent = 'No preset loaded';
            this.status.classList.remove('dirty');
        } else {
            const dirty = PresetActions.dirty;
            this.status.textContent = `${this.bankLabel(loaded)}${dirty ? ' · modified' : ''}`;
            this.status.classList.toggle('dirty', dirty);
        }

        this.slotA._refresh();
        this.slotB._refresh();
        const can = PresetActions.canCrossfade;
        this.fader.disabled = !can;
        this.clearInterpBtn.disabled = !(PresetActions.crossfading || slotA !== null || slotB !== null);
        const position = PresetActions.position;
        if (String(position) !== this.fader.value) this.fader.value = position;
        this.faderValue.textContent = `${position}`;
        this.faderHint.textContent = can
            ? `MIDI CC ${midiConfig.crossfaderCC} sweeps A → B (Settings › MIDI)`
            : 'Assign two stored banks to A and B to crossfade between them';
    }

    // ---- helpers ----

    bankLabel(index) {
        const bank = presetStore.get(index);
        return `${index + 1}${bank?.name ? ` · ${bank.name}` : ''}`;
    }

    card(title) {
        const sec = document.createElement('section');
        sec.className = 'settings-section preset-card';
        const h = document.createElement('div');
        h.className = 'settings-section-title';
        h.textContent = title;
        sec.appendChild(h);
        return sec;
    }

    button(text, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preset-btn';
        btn.textContent = text;
        this.bindEvent(btn, 'click', onClick);
        return btn;
    }

    hint(text) {
        const p = document.createElement('p');
        p.className = 'settings-hint';
        p.textContent = text;
        return p;
    }
}
