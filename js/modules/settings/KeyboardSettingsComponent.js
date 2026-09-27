import BaseComponent from '../base/BaseComponent.js';
import { SHORTCUTS } from '../../KeyboardShortcuts.js';

/**
 * Settings › Shortcuts: the keyboard, printed. A pure view over SHORTCUTS
 * (KeyboardShortcuts.js), which is where the keys are defined — so this
 * panel cannot describe a binding the app does not have.
 *
 * It is also the one place the app explains itself in words, which is why
 * the screen-reader intro in index.html points here.
 */
export class KeyboardSettingsComponent extends BaseComponent {

    render() {
        this.teardown();
        this.el.innerHTML = '';
        const sections = document.createElement('div');
        sections.className = 'settings-sections';
        for (const { group, items } of SHORTCUTS) sections.appendChild(this.section(group, items));
        const note = document.createElement('p');
        note.className = 'settings-hint';
        note.textContent = 'Keys do nothing while a text field has focus — typing belongs to the field. '
            + 'Letting go of a held overtone releases its envelope, and leaving the window releases them all.';
        this.el.append(sections, note);
    }

    section(group, items) {
        const sec = document.createElement('section');
        sec.className = 'settings-section';
        const heading = document.createElement('div');
        heading.className = 'settings-section-title';
        heading.textContent = group;
        const list = document.createElement('dl');
        list.className = 'shortcut-list';
        for (const { keys, what } of items) {
            const term = document.createElement('dt');
            for (const key of keys) {
                // "…" is a span of keys, not a key
                const el = document.createElement(key === '…' ? 'span' : 'kbd');
                el.textContent = key;
                term.appendChild(el);
            }
            const description = document.createElement('dd');
            description.textContent = what;
            list.append(term, description);
        }
        sec.append(heading, list);
        return sec;
    }
}
