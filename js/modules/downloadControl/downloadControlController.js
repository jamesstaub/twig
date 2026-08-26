import { BaseController } from "../base/BaseController.js";
import { DownloadControlComponent } from "./DownloadControlComponent.js";
import { DownloadControlActions } from "./downloadControlActions.js";
import { AppState, IR_RING_MAX_SECONDS } from "../../config.js";
import { IR_RING_CHANGED, ROUTING_MODE_CHANGED, SOURCE_CHANGED } from "../../events.js";
import { Dial } from "../generic/dial/Dial.js";
import { handleAddToWaveforms } from "../waveform/waveformActions.js";
import { ConvolutionActions } from "../convolution/convolutionActions.js";

export class DownloadControlController extends BaseController {
    createComponent(selector) {
        return new DownloadControlComponent(selector);
    }

    getProps() {
        return {
            routingMode: AppState.audioRoutingMode,
            isSubharmonic: AppState.isSubharmonic
        };
    }

    bindComponentEvents() {
        // Bind DOM events for routing mode and download button
        this.component.onRoutingChange = (mode) => {
            DownloadControlActions.setRoutingMode(mode);
        };

        this.component.onDownload = () => {
            const { routingMode, isSubharmonic } = this.getProps();
            DownloadControlActions.handleExportWAV(routingMode, isSubharmonic);
        };

        this.component.onAddToWaveforms = () => {
            // The baked oscillator is inherently mono — routing mode only
            // affects WAV export
            handleAddToWaveforms(this.getProps().isSubharmonic);
        };

        document.getElementById('create-ir-button')?.addEventListener('click', () => {
            ConvolutionActions.createIRFromCurrent();
        });

        // Ring-time dial for the next Create IR: 0 = one loop, else seconds
        // of exponential decay (a modal resonator)
        const ringRoot = document.getElementById('ir-ring-root');
        if (ringRoot) {
            this._ringDial = new Dial({
                min: 0, max: IR_RING_MAX_SECONDS, step: 0.1, value: AppState.irRingSeconds, size: 22, label: 'ring',
                format: (v) => (v === 0 ? 'one loop' : `ring ${v.toFixed(1)}s`),
                onChange: (v) => ConvolutionActions.setRingSeconds(v),
            });
            ringRoot.appendChild(this._ringDial.el);
            document.addEventListener(IR_RING_CHANGED, () => this._ringDial.setValue(AppState.irRingSeconds));
        }
    }

    bindExternalEvents() {
        document.addEventListener(ROUTING_MODE_CHANGED, () => this.update());

        // The wavetable preview/actions bake the oscillator bank — hidden
        // in external source modes. Applied at init too (bridge bootstrap
        // replays before controllers bind).
        const applySourceGating = () => {
            document.getElementById('result-control-root')
                ?.classList.toggle('hidden', AppState.sourceMode !== 'oscillators');
        };
        document.addEventListener(SOURCE_CHANGED, applySourceGating);
        applySourceGating();
    }
}