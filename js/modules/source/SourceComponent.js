import BaseComponent from "../base/BaseComponent.js";

/**
 * SourceComponent — the signal-source picker: mode select, the ADC device/
 * channel selectors (adc mode), the sound-file picker (soundfile mode),
 * and drag-drop of audio files anywhere on the section. The oscillator
 * waveform picker and its preview stay visible only in oscillator mode.
 *
 * Callbacks set by the controller:
 *  - onModeChange(mode)
 *  - onAdcDeviceChange(deviceId), onAdcChannelChange(channel)
 *  - onFile(file)
 */
export default class SourceComponent extends BaseComponent {

    constructor(elementId) {
        super(elementId);
        this.onModeChange = null;
        this.onAdcDeviceChange = null;
        this.onAdcChannelChange = null;
        this.onFile = null;
    }

    render({ sourceMode, adcDeviceId, adcChannel, adcDevices, soundfileName }) {
        const modeSelect = this.q('#source-mode-select');
        if (modeSelect && modeSelect.value !== sourceMode) modeSelect.value = sourceMode;

        this.q('#source-adc-controls')?.classList.toggle('hidden', sourceMode !== 'adc');
        this.q('#source-file-controls')?.classList.toggle('hidden', sourceMode !== 'soundfile');
        // Waveform picker + preview only mean something for oscillators
        this.q('#oscillator-picker')?.classList.toggle('hidden', sourceMode !== 'oscillators');
        this.q('#current-waveform-canvas-area')?.classList.toggle('hidden', sourceMode !== 'oscillators');

        if (sourceMode === 'adc') this.renderAdcSelectors({ adcDeviceId, adcChannel, adcDevices });

        const nameEl = this.q('#soundfile-name');
        if (nameEl) nameEl.textContent = soundfileName || 'no file loaded';
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
