/**
 * One stage of a voice's signal chain — the Web Audio realization of a
 * single processing step. A stage builds its nodes in their "off"
 * (passthrough) state, wires them internally, and exposes:
 *
 *   input / output   the nodes the chain connects through
 *   named setters    its parameters (Voice.js maps patch keys onto them)
 *   dispose()        unhook everything it owns
 *
 * Stages know nothing about each other; Voice.js is the only place that
 * composes them.
 */

export class Stage {
    constructor() {
        this.nodes = [];
        this.input = null;
        this.output = null;
    }

    /** Register a node this stage owns, so dispose() can unhook it. */
    own(node) {
        this.nodes.push(node);
        return node;
    }

    dispose() {
        for (const node of this.nodes) node.disconnect();
    }
}

/**
 * Write an AudioParam: over `ramp` seconds (the app-wide slew convention —
 * an exponential approach with time constant ramp / 3), or as a step when
 * ramp is 0.
 */
export function setParam(param, value, time, ramp = 0) {
    if (ramp > 0) param.setTargetAtTime(value, time, ramp / 3);
    else param.setValueAtTime(value, time);
}
