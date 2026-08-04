import BaseComponent from "../../base/BaseComponent.js";

/**
 * Generic, minimal slider component
 * Props: { min, max, step, value, label, onChange }
 */
export default class SliderComponent extends BaseComponent {
    constructor(target) {
        super(target);
        this.input = null;
        this.labelEl = null;
    }

    /**
     * Render the slider UI
     * @param {object} props - { min, max, step, value, label, onChange }
     */
    render(props = {}) {
        this.teardown();
        this.props = props;
        this.el.innerHTML = "";

        // Label
        if (props.label) {
            this.labelEl = document.createElement("label");
            this.labelEl.textContent = props.label;
            this.labelEl.className = "slider-label";
            this.el.appendChild(this.labelEl);
        }

        // Input
        this.input = document.createElement("input");
        this.input.type = "range";
        this.input.min = props.min ?? 0;
        this.input.max = props.max ?? 1;
        this.input.step = props.step ?? 0.01;
        this.input.value = props.value ?? 0;
        this.input.className = "slider-input";
        this.el.appendChild(this.input);

        // Value display (optional, for accessibility)
        this.valueDisplay = document.createElement("span");
        this.valueDisplay.className = "slider-value";
        const formatValue = typeof props.formatValue === "function" ? props.formatValue : (v) => v;
        // Always coerce to number for formatting
        const displayValue = props.value !== undefined && props.value !== null ? parseFloat(props.value) : 0;
        this.valueDisplay.textContent = formatValue(displayValue);
        this.el.appendChild(this.valueDisplay);

        // Event binding
        if (typeof props.onChange === "function") {
            this.bindEvent(this.input, "input", (e) => {
                // Always coerce to number for formatting
                const inputValue = e.target.value ?? "";
                const numValue = parseFloat(inputValue);
                this.valueDisplay.textContent = formatValue(numValue);
                props.onChange(numValue);
            });
        }
    }

    teardown() {
        super.teardown();
        this.input = null;
        this.labelEl = null;
        this.valueDisplay = null;
    }
}
