import { BaseController } from '../base/BaseController.js';
import { ToolbarComponent } from './ToolbarComponent.js';
import { SurfaceShellComponent } from './SurfaceShellComponent.js';
import { SURFACES, surfaceState } from './surfaceState.js';
import { layoutMode } from '../layout/layoutMode.js';
import { LAYOUT_MODE_CHANGED, SURFACE_CHANGED } from '../../events.js';

/**
 * Wires the surface toolbar to surfaceState, and re-applies the shell
 * (panel visibility + body attributes) whenever the active surface, the
 * dock, or the layout shell changes.
 */
export class SurfacesController extends BaseController {

    constructor(toolbarSelector, shellSelector) {
        super(toolbarSelector);
        this.shell = new SurfaceShellComponent(shellSelector);
    }

    createComponent(selector) {
        return new ToolbarComponent(selector);
    }

    getProps() {
        return {
            surfaces: SURFACES,
            active: surfaceState.active,
            dock: surfaceState.dock,
            embed: layoutMode.isEmbed,
            visibleRoots: surfaceState.visibleRoots(),
            allRoots: surfaceState.allRoots(),
        };
    }

    update() {
        const props = super.update();
        this.shell.render(props);
        return props;
    }

    bindComponentEvents() {
        this.component.onSelect = (id) => surfaceState.show(id);
        this.component.onToggleDock = () => surfaceState.toggleDock();
    }

    bindExternalEvents() {
        document.addEventListener(SURFACE_CHANGED, () => this.update());
        document.addEventListener(LAYOUT_MODE_CHANGED, () => this.update());
    }
}
