/**
 * BaseComponent
 * -----------------------------------------------------------------------------
 * A minimal foundation for UI components that manage their own DOM subtree.
 *
 * Responsibilities:
 *   - Owns a root element in the DOM.
 *   - Can render static DOM structure once via render().
 *   - Gives subclasses utility helpers for querying and updating their DOM.
 *
 * What it does *not* do:
 *   - It does NOT handle state.
 *   - It does NOT talk to the AppState.
 *   - It does NOT auto-bind event listeners.
 *     (Controllers decide how and when events get attached.)
 *
 * Design Reasoning:
 *   This keeps components stupid and predictable. They know only:
 *      “Here is my DOM, here is how I render.”
 *
 *   Controllers adapt components to the application state.
 *   Components never reach outward or look at global data.
 *
 *   This avoids tangled two-way bindings and keeps updates controlled.
 */
export default class BaseComponent {
    /**
        * @param {HTMLElement|string} target - Element or query selector.
        */
    constructor(target) {
        this.el = typeof target === "string"
            ? document.querySelector(target)
            : target;

        if (!this.el) {
            throw new Error(`BaseComponent: Target element "${target}" not found.`);
        }

        /** Registry of all event listeners bound via bindEvent() */
        this._boundEvents = [];
    }


    /**
     * Bind an event handler and automatically track it for cleanup.
     * @param {HTMLElement} el
     * @param {string} evt
     * @param {Function} handler
     */
    bindEvent(el, evt, handler) {
        if (!el) return;

        el.addEventListener(evt, handler);
        this._boundEvents.push({ el, evt, handler });
    }


    /**
     * Remove all events previously bound via bindEvent().
     */
    unbindAll() {
        for (const { el, evt, handler } of this._boundEvents) {
            el.removeEventListener(evt, handler);
        }
        this._boundEvents.length = 0;
    }


    /**
     * Called automatically before every render and when a controller tears
     * down a component. Subclasses can override for additional cleanup.
     */
    teardown() {
        this.unbindAll();  // Always safe to call first
    }


    /**
     * Optional helper to update text or HTML content.
     * @param {HTMLElement} el
     * @param {string} content
     * @param {object} options
     * @param {boolean} options.asHTML
     */
    updateContent(el, content = "", { asHTML = false } = {}) {
        if (!el) return;
        if (asHTML) el.innerHTML = content;
        else el.textContent = content;
    }


    /**
     * Subclasses MUST implement:
     *    render(props)
     *
     * Should update DOM inside this.el. Call teardown() before rewriting DOM
     * if render() replaces or regenerates child elements.
     *
     * Subclasses MAY optionally implement:
     *    bindRenderedEvents()
     *    teardown()
     */
    render(_props) {
        throw new Error("render() must be implemented in subclass");
    }
    /**
     * q(selector)
     * -----------------------------------------------------------------------------
     * Convenience wrapper for querySelector(), scoped to this component's root.
     *
     * @param {string} selector  CSS selector
     * @return {Element|null}
     */
    q(selector) {
        return this.el.querySelector(selector);
    }

    /**
     * qAll(selector)
     * -----------------------------------------------------------------------------
     * querySelectorAll(), returned as a normal Array instead of a NodeList.
     *
     * @param {string} selector  CSS selector
     * @return {Array<Element>}
     */
    qAll(selector) {
        return Array.from(this.el.querySelectorAll(selector));
    }
}
