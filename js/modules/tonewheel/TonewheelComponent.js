import BaseComponent from "../base/BaseComponent.js";

/**
 * The tonewheel's home: a positioned box (#tonewheel-canvas) the sketch
 * draws into. The component owns the box; the sketch (built by
 * TonewheelActions.initVisualization) owns the canvas inside it and its
 * own frame loop.
 */
export class TonewheelComponent extends BaseComponent {
    constructor(selector) {
        super(selector);
        this.canvasId = 'tonewheel-canvas';
    }

    render(props) {
        const container = this.el;
        if (!container) return;

        this._sketch?.destroy();
        this._sketch = null;
        container.querySelector(`#${this.canvasId}`)?.remove();

        const box = document.createElement('div');
        box.id = this.canvasId;
        container.appendChild(box);

        // The box exists now, so the sketch can measure and mount into it
        this._sketch = props?.createSketch?.() ?? null;
    }

    teardown() {
        this._sketch?.destroy();
        this._sketch = null;
        this.el.querySelector(`#${this.canvasId}`)?.remove();
        super.teardown?.();
    }
}
