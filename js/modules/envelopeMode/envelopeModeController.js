import { BaseController } from "../base/BaseController.js";
import { EnvelopeModeToggleComponent } from "./EnvelopeModeToggleComponent.js";
import { OvertoneSignalActions } from "../overtoneSignal/overtoneSignalActions.js";
import { ENVELOPE_MODE_CHANGED } from "../../events.js";

export class EnvelopeModeController extends BaseController {
    createComponent(selector) {
        return new EnvelopeModeToggleComponent(selector);
    }

    getProps() {
        return { mode: OvertoneSignalActions.getEnvelopeMode() };
    }

    bindComponentEvents() {
        this.component.onToggle = () => {
            const mode = OvertoneSignalActions.getEnvelopeMode();
            OvertoneSignalActions.setEnvelopeMode(mode === 'adsr' ? 'open' : 'adsr');
        };
    }

    bindExternalEvents() {
        document.addEventListener(ENVELOPE_MODE_CHANGED, () => this.update());
    }
}
