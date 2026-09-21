import BaseComponent from "../base/BaseComponent.js";

export class PlayToggleComponent extends BaseComponent {
    render({ isPlaying } = {}) {
        const label = this.q('#play-label');
        const toggle = this.q('#play-toggle');

        // Names the current STATE, like every label + switch in the app
        // (Trigger/Drone): on = Playing, off = Stopped
        if (label) label.textContent = isPlaying ? 'Playing' : 'Stopped';
        if (toggle) {
            toggle.classList.toggle('active', isPlaying);
            toggle.setAttribute('aria-checked', String(isPlaying));
        }
    }

    bindRenderedEvents() {
        const toggle = this.q('#play-toggle');
        this.bindEvent(toggle, 'click', () => this.onToggle?.());
    }
}
