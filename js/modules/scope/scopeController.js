import { AppState } from '../../config.js';
import { PLAY_STATE_CHANGED } from '../../events.js';
import { BaseController } from '../base/BaseController.js';
import ScopeComponent from './ScopeComponent.js';

/**
 * ScopeController — wires the master-output oscilloscope to play state.
 * No other app state affects it: the component reads the live analyser
 * itself, frame by frame, once playing.
 */
export class ScopeController extends BaseController {

    createComponent(selector) {
        return new ScopeComponent(selector);
    }

    getProps() {
        return { playing: AppState.isPlaying };
    }

    bindExternalEvents() {
        document.addEventListener(PLAY_STATE_CHANGED, () => this.update());
    }
}
