import BaseComponent from "../base/BaseComponent.js";

export class EnvelopeModeToggleComponent extends BaseComponent {
    render({ mode } = {}) {
        this.teardown();
        this.el.innerHTML = '';

        const isAdsr = mode === 'adsr';

        const label = document.createElement('span');
        label.className = 'toggle-label active envelope-mode-label';
        label.textContent = isAdsr ? 'Trigger' : 'Drone';

        const toggle = document.createElement('div');
        toggle.className = 'toggle-switch envelope-mode-switch';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', String(isAdsr));
        toggle.setAttribute('aria-label', 'Envelope mode: trigger or drone');
        toggle.classList.toggle('active', isAdsr);

        this.el.appendChild(label);
        this.el.appendChild(toggle);

        this.bindEvent(toggle, 'click', () => this.onToggle?.());
    }
}
