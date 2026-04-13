import BaseComponent from "../base/BaseComponent.js";

export class PlayToggleComponent extends BaseComponent {
    render({ isPlaying } = {}) {
        const label = this.q('#play-label');
        const toggle = this.q('#play-toggle');

        if (label) label.textContent = isPlaying ? 'Stop' : 'Play';
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
