import BaseComponent from "../base/BaseComponent.js";

export class WaveformSelectorComponent extends BaseComponent {
    render({ currentWaveform } = {}) {
        if (currentWaveform !== undefined) {
            this.el.value = currentWaveform;
        }
    }

    bindRenderedEvents() {
        this.bindEvent(this.el, 'change', (e) => this.onChange?.(e));
    }
}
