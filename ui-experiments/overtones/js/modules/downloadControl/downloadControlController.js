import { BaseController } from "../base/BaseController.js";
import { DownloadControlComponent } from "./DownloadControlComponent.js";
import { DownloadControlActions } from "./downloadControlActions.js";
import { AppState } from "../../config.js";
import { ROUTING_MODE_CHANGED } from "../../events.js";

export class DownloadControlController extends BaseController {
    createComponent(selector) {
        return new DownloadControlComponent(selector);
    }

    getProps() {
        return {
            routingMode: AppState.audioRoutingMode
        };
    }

    bindComponentEvents() {
        // Bind DOM events for routing mode and download button
        this.component.onRoutingChange = (mode) => {
            DownloadControlActions.setRoutingMode(mode);
        };

        this.component.onDownload = () => {
            DownloadControlActions.handleExportWAV(this.getProps().routingMode);
        };
    }

    bindExternalEvents() {
        document.addEventListener(ROUTING_MODE_CHANGED, () => this.update());
    }
}