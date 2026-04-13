import { BaseController } from "../base/BaseController.js";
import { PlayToggleComponent } from "./PlayToggleComponent.js";
import { PlayToggleActions } from "./playToggleActions.js";
import { AppState } from "../../config.js";
import { PLAY_STATE_CHANGED } from "../../events.js";

export class PlayToggleController extends BaseController {
    createComponent(selector) {
        return new PlayToggleComponent(selector);
    }

    getProps() {
        return { isPlaying: AppState.isPlaying };
    }

    bindComponentEvents() {
        this.component.onToggle = () => PlayToggleActions.toggle();
    }

    bindExternalEvents() {
        document.addEventListener(PLAY_STATE_CHANGED, () => this.update());
    }
}
