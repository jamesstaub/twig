import { updateAudioProperties } from "../../audio.js";
import { AppState } from "../../config.js";
import { FUNDAMENTAL_CHANGED, SOURCE_CHANGED } from "../../events.js";
import { BaseController } from "../base/BaseController";
import { FundamentalActions } from "./fundamentalActions";
import { FundamentalComponent } from "./FundamentalComponent.js";


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

        // External source modes hide the fundamental UI (the state stays
        // live — it still tunes the filter bank). Applied once at init too:
        // the bridge bootstrap replays state before controllers bind.
        const applySourceGating = () => {
            this.component.el.classList.toggle('hidden', AppState.sourceMode !== 'oscillators');
        };
        document.addEventListener(SOURCE_CHANGED, applySourceGating);
        applySourceGating();
    }
}