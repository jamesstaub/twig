import { BaseController } from "../base/BaseController.js";
import { DownloadControlComponent } from "./DownloadControlComponent.js";
import { DownloadControlActions } from "./downloadControlActions.js";
import { AppState } from "../../config.js";
import { ROUTING_MODE_CHANGED, SOURCE_CHANGED } from "../../events.js";
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