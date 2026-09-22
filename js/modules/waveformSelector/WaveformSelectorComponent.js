import BaseComponent from "../base/BaseComponent.js";

export class WaveformSelectorComponent extends BaseComponent {
    /** `morphing`: a preset crossfade is between two waveforms — the menu shows "Interpolated". */
    render({ currentWaveform, morphing = false } = {}) {
        if (currentWaveform !== undefined) {
            this.el.value = morphing ? '' : currentWaveform;
        }
    }

    bindRenderedEvents() {
        this.bindEvent(this.el, 'change', (e) => this.onChange?.(e));
    }
}
