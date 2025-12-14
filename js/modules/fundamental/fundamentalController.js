import { updateAudioProperties } from "../../audio.js";
import { FUNDAMENTAL_CHANGED } from "../../events.js";
import { BaseController } from "../base/BaseController";
import { FundamentalActions } from "./fundamentalActions";
import { FundamentalComponent } from "./fundamentalComponent.js";

export class FundamentalController extends BaseController {
    createComponent(selector) {
        return new FundamentalComponent(selector);
    }

    getProps() {
        return {};
    }

    bindComponentEvents() {
        this.component.onOctaveUp = () => { FundamentalActions.changeOctave(1); };
        this.component.onOctaveDown = () => { FundamentalActions.changeOctave(-1); };

        this.component.onClickKey = (index) => {
            FundamentalActions.setFundamentalByNoteIndex(index);
        };

        this.component.onChangeInput = (value) => {
            FundamentalActions.handleFundamentalChange(value);
        };
    }

    bindExternalEvents() {
        document.addEventListener(FUNDAMENTAL_CHANGED, () => {
            FundamentalActions.updateFundamentalDisplay();
            FundamentalActions.updateKeyboardUI();
            updateAudioProperties();
        });
    }
}