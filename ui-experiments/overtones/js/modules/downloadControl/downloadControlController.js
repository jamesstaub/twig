import { BaseController } from "../base/BaseController.js";
import { DownloadControlComponent } from "./DownloadControlComponent.js";
import { DownloadControlActions } from "./downloadControlActions.js";
import { AppState } from "../../config.js";
import { ROUTING_MODE_CHANGED } from "../../events.js";
import { handleAddToWaveforms } from "../waveform/waveformActions.js";

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
            const { routingMode, isSubharmonic } = this.getProps();
            handleAddToWaveforms(routingMode, isSubharmonic);
        };
    }

    bindExternalEvents() {
        document.addEventListener(ROUTING_MODE_CHANGED, () => this.update());
    }
}