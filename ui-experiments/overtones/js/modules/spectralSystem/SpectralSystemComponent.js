import BaseComponent from "../base/BaseComponent.js";

export class SpectralSystemComponent extends BaseComponent {
    constructor(selectors) {
        super();
        this.selectors = selectors;
        this.selectEl = selectors.selectEl;
        this.descriptionEl = selectors.descriptionEl;
        this.onChange = null;
    }

    render({ systems, currentSystem }) {
        if (!this.selectEl) return;

        // Populate selector
        this.selectEl.innerHTML = '';
        systems.forEach((system, index) => {
            const option = document.createElement('option');
            option.textContent = system.name;
            option.value = index;
            if (system === currentSystem) option.selected = true;
            this.selectEl.appendChild(option);
        });

        // Update description
        this.updateContent(this.descriptionEl, currentSystem?.description || '', { asHTML: true });

        // Update subharmonic toggle UI
        this.renderSubharmonicToggle({ isSubharmonic: currentSystem?.isSubharmonic });

        // Bind change event
        this.bindChange(this.selectEl, (val) => this.onChange(val));
    }

    renderSubharmonicToggle({ isSubharmonic }) {
        const { subharmonicToggle, subharmonicLabel, overtoneLabels } = this.selectors;
        if (subharmonicToggle) {
            subharmonicToggle.classList.toggle('active', isSubharmonic);
            subharmonicToggle.setAttribute('aria-checked', isSubharmonic);
        }
        if (subharmonicLabel) {
            subharmonicLabel.textContent = isSubharmonic ? 'Subharmonic' : 'Harmonic';
        }
        if (overtoneLabels && overtoneLabels.length) {
            overtoneLabels.forEach(overtoneLabel => {
                overtoneLabel.textContent = isSubharmonic ? 'Undertone' : 'Overtone';
            });
        }
    }
}