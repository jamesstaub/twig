/**
 * BaseController
 * ---------------
 * A thin orchestrator between AppState and a visual Component.
 * Controllers do NOT touch DOM directly — they:
 *   - create a component instance
 *   - compute props via getProps()
 *   - call component.render(props)
 *   - bind component-level events (via component.onX assignments)
 *   - bind global events (document/window listeners)
 *
 * Lifecycle:
 *   1. constructor() → createComponent() (must return a BaseComponent subclass)
 *   2. init()
 *       - bindComponentEvents()
 *       - bindExternalEvents()
 *       - update()   (renders with fresh props)
 *
 * You can safely call update() whenever app state changes.
 */

export class BaseController {
    constructor(selector) {
        if (typeof this.createComponent !== "function") {
            throw new Error("Subclass must implement createComponent(selector)");
        }

        this.selector = selector;
        this.component = this.createComponent(selector);

        if (!this.component) {
            throw new Error("createComponent() must return a component instance");
        }
    }


    /**
     * Initialize controller lifecycle. Call this once after construction.
     */
    init() {
        this.bindComponentEvents();
        this.bindExternalEvents();
        this.update(); // first render with fresh props
    }


    /**
     * Subclasses MUST implement this to return props derived from app state.
     */
    getProps() {
        throw new Error("Subclass must implement getProps()");
    }


    /**
     * Re-render the component with fresh props.
     * Safe to call any time state changes.
     */
    update() {
        const props = this.getProps();
        if (this.component.teardown) this.component.teardown();
        this.component.render(props);
        if (typeof this.component.bindRenderedEvents === 'function') {
            this.component.bindRenderedEvents();
        }
        return props; // <-- return so child can reuse
    }



    /**
     * Subclasses MAY override this to wire component-level events, e.g.:
     *   this.component.onChange = (value) => {...}
     * 
     *   TODO: consider instead passing in functions as props to the render method
     */
    bindComponentEvents() { }


    /**
     * Subclasses MAY override this to bind global events (ex: document listeners)
     * TODO: need to add cleanup for events bound here. 
     * almost always calls this.update() so it could be streamlined
     */
    bindExternalEvents() { }


    /**
     * Optional destruction (future-proofing)
     */
    destroy() {
        if (this.component.teardown) {
            this.component.teardown();
        }
    }
}
