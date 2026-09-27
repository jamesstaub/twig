import BaseComponent from "../base/BaseComponent.js";
import { octaveField } from "../generic/octaveField.js";
import { MANAGE_FILES_OPTION } from "../settings/settingsSurface.js";

/**
 * SourceComponent — the signal-source picker: mode select, the ADC device/
 * channel selectors (adc mode), the sound-file controls (soundfile mode:
 * the file picker, Mono/Poly, tune-to-overtone and the file's fundamental
 * — disabled in place where they don't apply), and drag-drop of audio
 * files anywhere on the section. The oscillator waveform picker and its
 * preview stay visible only in oscillator mode.
 *
 * Callbacks set by the controller:
 *  - onModeChange(mode)
 *  - onAdcDeviceChange(deviceId), onAdcChannelChange(channel)
 *  - onFile(file), onLibraryPick({ kind, id, name }), onManageFiles()
 *  - onSoundfileMode(mode), onSoundfileTune(on), onSoundfileFundamental(hz)
 *  - onSoundfileRange([start, end] | null) — a drag across the preview
 */
export default class SourceComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.onModeChange = null;
        this.onAdcDeviceChange = null;
        this.onAdcChannelChange = null;
        this.onFile = null;
        this.onLibraryPick = null;
        this.onManageFiles = null;
        this.onSoundfileMode = null;
        this.onSoundfileTune = null;
        this.onSoundfileFundamental = null;
        this.onSoundfileRange = null;
    }

    render({ sourceMode, adcDeviceId, adcChannel, adcDevices, soundfileName, soundfile, library }) {
        this.props = { sourceMode, soundfileName, soundfile, library };
        const modeSelect = this.q('#source-mode-select');
        if (modeSelect && modeSelect.value !== sourceMode) modeSelect.value = sourceMode;

        this.q('#source-adc-controls')?.classList.toggle('hidden', sourceMode !== 'adc');
        this.q('#source-file-controls')?.classList.toggle('hidden', sourceMode !== 'soundfile');
        // The waveform picker only means something for oscillators; the
        // preview draws the oscillator wave or the loaded sound file
        this.q('#oscillator-picker')?.classList.toggle('hidden', sourceMode !== 'oscillators');
        this.q('#current-waveform-canvas-area')?.classList.toggle('hidden', sourceMode !== 'oscillators' && sourceMode !== 'soundfile');

        if (sourceMode === 'adc') this.renderAdcSelectors({ adcDeviceId, adcChannel, adcDevices });

        if (sourceMode === 'soundfile') {
            this.mountFundamentalField();
            this.renderLibrary(library, soundfile.source, soundfileName);
            this.renderSoundfile(soundfile);
        }
        this.renderRange(sourceMode === 'soundfile' && soundfileName ? soundfile.range : null, sourceMode === 'soundfile' && Boolean(soundfileName));
    }

    /**
     * The chosen part of the file over the preview: shades outside it, and
     * the whole-file button while a range is set. Also used mid-drag.
     */
    renderRange(range, active) {
        const overlay = this.q('#source-range-overlay');
        if (!overlay) return;
        overlay.classList.toggle('hidden', !active);
        const [start, end] = range || [0, 1];
        overlay.querySelector('.source-range-dim-left').style.width = `${start * 100}%`;
        overlay.querySelector('.source-range-dim-right').style.width = `${(1 - end) * 100}%`;
        this.q('#source-range-reset')?.classList.toggle('hidden', !range);
    }

    /**
     * The library menu: every file on the machine that can be played as a
     * sample, grouped by where it came from, and naming what is loaded.
     *
     * The options are rebuilt only when the library itself changes — this
     * panel re-renders on every fundamental step and range drag, and
     * rewriting a <select> under the pointer closes it mid-choice.
     *
     * @param {Array} groups - sourceLibrary.samplerLibrary()
     * @param {?{kind: string, id: string}} current - what is loaded
     * @param {?string} name - its name, for a file the library no longer has
     */
    renderLibrary(groups, current, name) {
        const select = this.q('#soundfile-library-select');
        if (!select) return;
        const value = current ? `${current.kind}:${current.id}` : '';
        const known = (groups || []).some((g) => g.items.some((i) => `${g.kind}:${i.id}` === value));
        const signature = [known ? '' : name, ...(groups || [])
            .map((g) => `${g.kind}=${g.items.map((i) => i.id).join(',')}`)].join('|');
        if (select.dataset.signature !== signature) {
            select.dataset.signature = signature;
            select.innerHTML = '';
            // A loaded sample the library has no entry for (its file was
            // deleted, or the name came from the bridge with nothing
            // loaded) still has to be what the menu reads. Disabled, so it
            // is a readout rather than somewhere the ‹ › can land.
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.disabled = true;
            placeholder.textContent = known ? 'Choose a file…' : (name || 'No file loaded');
            select.appendChild(placeholder);
            let files = 0;
            for (const group of groups || []) {
                if (!group.items.length) continue;
                const optgroup = document.createElement('optgroup');
                optgroup.label = group.label;
                for (const item of group.items) {
                    const option = document.createElement('option');
                    option.value = `${group.kind}:${item.id}`;
                    option.textContent = item.name;
                    optgroup.appendChild(option);
                    files++;
                }
                select.appendChild(optgroup);
            }
            if (files) {
                const manage = document.createElement('option');
                manage.value = MANAGE_FILES_OPTION;
                manage.dataset.role = 'action';
                manage.textContent = 'Manage files…';
                select.appendChild(manage);
            }
        }
        select.value = known ? value : '';
    }

    /** Mono/Poly, tune, fundamental — tune and fundamental only apply to poly. */
    renderSoundfile({ mode, tune }) {
        const poly = mode === 'poly';
        const modeSwitch = this.q('#soundfile-mode-switch');
        if (modeSwitch) {
            modeSwitch.classList.toggle('active', poly);
            modeSwitch.setAttribute('aria-checked', String(poly));
        }
        const modeLabel = this.q('#soundfile-mode-label');
        if (modeLabel) modeLabel.textContent = poly ? 'Poly' : 'Mono';
        const tuneEl = this.q('#soundfile-tune');
        if (tuneEl) {
            tuneEl.classList.toggle('active', Boolean(tune));
            tuneEl.setAttribute('aria-checked', String(Boolean(tune)));
            tuneEl.setAttribute('aria-disabled', String(!poly));
            tuneEl.parentElement.classList.toggle('disabled', !poly);
        }
        // The fundamental field reads the props it was mounted with, so it
        // is always showing this render's numbers
        this.fundamentalField?.sync();
        this.fundamentalField?.setEnabled(poly && tune);
    }

    /**
     * The sample's fundamental: ÷2 · Hz · ×2 · auto — the same control as
     * the filter bank's multiplier, because a detected pitch is wrong by an
     * OCTAVE when it is wrong, and halving or doubling is the whole repair.
     * `auto` is the pitch YIN found; it is lit while nothing overrides it.
     *
     * Built once (the props it reads are re-read on every sync), and only
     * when its host is in the DOM.
     */
    mountFundamentalField() {
        const host = this.q('#soundfile-fundamental-field');
        if (!host || this.fundamentalField) return;
        host.innerHTML = '';
        // What sounds: the typed value, or the detected one behind it
        const effective = () => this.props?.soundfile?.fundamental ?? this.props?.soundfile?.detectedHz ?? null;
        this.fundamentalField = octaveField({
            label: 'Fundamental',
            unit: 'Hz',
            className: 'soundfile-fundamental',
            ariaLabel: "The sample's fundamental pitch in Hz",
            min: 0,
            max: 20000,
            format: (v) => String(Number(v.toFixed(v >= 100 ? 1 : 2))),
            autoTitle: 'The pitch detected in the sample',
            get: effective,
            set: (v) => this.onSoundfileFundamental?.(v),
            autoValue: () => this.props?.soundfile?.detectedHz ?? null,
            isAuto: () => (this.props?.soundfile?.fundamental ?? null) === null,
            // null hands it back to the detected pitch
            setAuto: () => this.onSoundfileFundamental?.(null),
        });
        host.appendChild(this.fundamentalField.el);
    }

    renderAdcSelectors({ adcDeviceId, adcChannel, adcDevices }) {
        const deviceSelect = this.q('#adc-device-select');
        if (deviceSelect) {
            deviceSelect.innerHTML = '';
            const def = document.createElement('option');
            def.value = '';
            def.textContent = 'Default input';
            deviceSelect.appendChild(def);
            for (const dev of adcDevices || []) {
                const opt = document.createElement('option');
                opt.value = dev.id;
                opt.textContent = dev.label;
                if (dev.id === adcDeviceId) opt.selected = true;
                deviceSelect.appendChild(opt);
            }
        }

        const channelSelect = this.q('#adc-channel-select');
        if (channelSelect) {
            channelSelect.innerHTML = '';
            for (let ch = 0; ch < 8; ch++) {
                const opt = document.createElement('option');
                opt.value = ch;
                opt.textContent = `Ch ${ch + 1}`;
                if (ch === (adcChannel || 0)) opt.selected = true;
                channelSelect.appendChild(opt);
            }
        }
    }

    /**
     * Drag across the preview to choose the part of the file that plays.
     * The shades follow the pointer; the range is committed on release
     * (a commit restarts the players, so not per move). A press without
     * travel leaves the range alone.
     */
    bindRangeDrag() {
        const area = this.q('#current-waveform-canvas-area');
        const overlay = this.q('#source-range-overlay');
        if (!area || !overlay) return;
        let anchor = null;
        const frac = (e) => {
            const r = area.getBoundingClientRect();
            return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        };
        this.bindEvent(overlay, 'pointerdown', (e) => {
            if (e.button !== 0 || e.target.closest('#source-range-reset')) return;
            anchor = { x: frac(e), clientX: e.clientX };
            try { overlay.setPointerCapture(e.pointerId); } catch { /* synthetic event: no pointer to capture */ }
            e.preventDefault();
        });
        this.bindEvent(overlay, 'pointermove', (e) => {
            if (!anchor) return;
            const x = frac(e);
            this.renderRange([Math.min(anchor.x, x), Math.max(anchor.x, x)], true);
        });
        const finish = (e) => {
            if (!anchor) return;
            const a = anchor;
            anchor = null;
            if (Math.abs(e.clientX - a.clientX) < 3) {
                this.renderRange(this.props?.soundfile?.range ?? null, true);
                return;
            }
            const x = frac(e);
            this.onSoundfileRange?.([Math.min(a.x, x), Math.max(a.x, x)]);
        };
        this.bindEvent(overlay, 'pointerup', finish);
        this.bindEvent(overlay, 'pointercancel', finish);
    }

    /**
     * Re-bound after every render (BaseController.update tears down all
     * bindEvent listeners before rendering).
     */
    bindRenderedEvents() {
        this.bindEvent(this.q('#source-mode-select'), 'change', (e) => {
            this.onModeChange?.(e.target.value);
        });
        this.bindEvent(this.q('#adc-device-select'), 'change', (e) => {
            this.onAdcDeviceChange?.(e.target.value || null);
        });
        this.bindEvent(this.q('#adc-channel-select'), 'change', (e) => {
            this.onAdcChannelChange?.(parseInt(e.target.value, 10) || 0);
        });
        this.bindEvent(this.q('#soundfile-input'), 'change', (e) => {
            const file = e.target.files?.[0];
            if (file) this.onFile?.(file);
        });
        this.bindEvent(this.q('#soundfile-library-select'), 'change', (e) => {
            if (e.target.value === MANAGE_FILES_OPTION) {
                // Not a file: put the menu back on what is loaded and open
                // the library
                const current = this.props?.soundfile?.source;
                e.target.value = current ? `${current.kind}:${current.id}` : '';
                this.onManageFiles?.();
                return;
            }
            const [kind, id] = e.target.value.split(':');
            if (!id) return; // the placeholder is not a choice
            this.onLibraryPick?.({ kind, id, name: e.target.selectedOptions[0]?.textContent || '' });
        });
        this.bindEvent(this.q('#soundfile-mode-switch'), 'click', (e) => {
            this.onSoundfileMode?.(e.currentTarget.classList.contains('active') ? 'mono' : 'poly');
        });
        this.bindEvent(this.q('#soundfile-tune'), 'click', (e) => {
            if (e.currentTarget.getAttribute('aria-disabled') === 'true') return;
            this.onSoundfileTune?.(!e.currentTarget.classList.contains('active'));
        });
        this.bindRangeDrag();
        this.bindEvent(this.q('#source-range-reset'), 'click', () => this.onSoundfileRange?.(null));

        // Drop an audio file anywhere on the section → soundfile mode
        this.bindEvent(this.el, 'dragover', (e) => {
            e.preventDefault();
            this.el.classList.add('drop-target');
        });
        this.bindEvent(this.el, 'dragleave', () => {
            this.el.classList.remove('drop-target');
        });
        this.bindEvent(this.el, 'drop', (e) => {
            e.preventDefault();
            this.el.classList.remove('drop-target');
            const file = [...(e.dataTransfer?.files || [])].find((f) =>
                f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aif|aiff|m4a)$/i.test(f.name));
            if (file) this.onFile?.(file);
        });
    }
}
