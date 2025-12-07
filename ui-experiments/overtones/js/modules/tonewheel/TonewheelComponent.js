import BaseComponent from "../base/BaseComponent.js";


export class TonewheelComponent extends BaseComponent {
    constructor(selector) {
        super(selector);
        this.canvasId = 'tonewheel-canvas';
    }

    render(props) {
        // Ensure the canvas container exists
        let container = this.el;
        if (!container) return;

        // Remove any previous canvas
        const oldCanvas = container.querySelector('canvas');
        if (oldCanvas) {
            oldCanvas.remove();
        }

        // Remove any previous p5 instance
        if (this._p5Instance && this._p5Instance.remove) {
            this._p5Instance.remove();
            this._p5Instance = null;
        }

        // Create a new canvas element for p5 to use
        const canvas = document.createElement('div');
        canvas.id = this.canvasId;
        container.appendChild(canvas);

        // Attach the p5 instance if provided
        if (props && props.p5Instance) {
            this._p5Instance = props.p5Instance;
            // Move the canvas DOM node into our container if needed
            if (this._p5Instance.canvas && this._p5Instance.canvas.parentNode !== canvas) {
                canvas.appendChild(this._p5Instance.canvas);
            }
        }
    }

    teardown() {
        // Remove the p5 instance if it exists
        if (this._p5Instance && this._p5Instance.remove) {
            this._p5Instance.remove();
            this._p5Instance = null;
        }
        // Remove the canvas on teardown
        const canvas = this.el.querySelector(`#${this.canvasId}`);
        if (canvas) {
            canvas.remove();
        }
        super.teardown?.();
    }
}
