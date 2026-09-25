import BaseComponent from "../base/BaseComponent.js";

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
 *  - onFile(file)
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
        this.onSoundfileMode = null;
        this.onSoundfileTune = null;
        this.onSoundfileFundamental = null;
        this.onSoundfileRange = null;
    }

    render({ sourceMode, adcDeviceId, adcChannel, adcDevices, soundfileName, soundfile }) {
        this.props = { sourceMode, soundfileName, soundfile };
        const modeSelect = this.q('#source-mode-select');
        if (modeSelect && modeSelect.value !== sourceMode) modeSelect.value = sourceMode;

        this.q('#source-adc-controls')?.classList.toggle('hidden', sourceMode !== 'adc');
        this.q('#source-file-controls')?.classList.toggle('hidden', sourceMode !== 'soundfile');
        // The waveform picker only means something for oscillators; the
        // preview draws the oscillator wave or the loaded sound file
        this.q('#oscillator-picker')?.classList.toggle('hidden', sourceMode !== 'oscillators');
        this.q('#current-waveform-canvas-area')?.classList.toggle('hidden', sourceMode !== 'oscillators' && sourceMode !== 'soundfile');

        if (sourceMode === 'adc') this.renderAdcSelectors({ adcDeviceId, adcChannel, adcDevices });

        const nameEl = this.q('#soundfile-name');
        if (nameEl) nameEl.textContent = soundfileName || 'no file loaded';
        if (sourceMode === 'soundfile') this.renderSoundfile(soundfile);
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

    /** Mono/Poly, tune, fundamental — tune and fundamental only apply to poly. */
    renderSoundfile({ mode, tune, fundamental, detectedHz }) {
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
        const detected = detectedHz ? detectedHz.toFixed(detectedHz >= 100 ? 1 : 2) : null;
        const hzEl = this.q('#soundfile-fundamental');
        if (hzEl) {
            if (document.activeElement !== hzEl) hzEl.value = fundamental ?? '';
            hzEl.placeholder = detected ? `auto ${detected}` : 'auto';
            hzEl.disabled = !(poly && tune);
        }
        // While a typed value overrides the detected one, a button offers it back
        const reset = this.q('#soundfile-fundamental-reset');
        if (reset) {
            const show = fundamental !== null && fundamental !== undefined && detected !== null;
            reset.classList.toggle('hidden', !show);
            reset.textContent = detected ? `↺ ${detected}` : '';
            reset.disabled = !(poly && tune);
        }
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
        this.bindEvent(this.q('#soundfile-mode-switch'), 'click', (e) => {
            this.onSoundfileMode?.(e.currentTarget.classList.contains('active') ? 'mono' : 'poly');
        });
        this.bindEvent(this.q('#soundfile-tune'), 'click', (e) => {
            if (e.currentTarget.getAttribute('aria-disabled') === 'true') return;
            this.onSoundfileTune?.(!e.currentTarget.classList.contains('active'));
        });
        this.bindEvent(this.q('#soundfile-fundamental'), 'change', (e) => this.onSoundfileFundamental?.(parseFloat(e.target.value)));
        this.bindEvent(this.q('#soundfile-fundamental-reset'), 'click', (e) => {
            e.preventDefault(); // inside the field's <label>: don't refocus the input
            this.onSoundfileFundamental?.(null);
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
