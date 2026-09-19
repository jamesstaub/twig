import { BaseController } from '../base/BaseController.js';
import { ToolbarComponent } from './ToolbarComponent.js';
import { SurfaceShellComponent } from './SurfaceShellComponent.js';
import { SideToggleComponent } from './SideToggleComponent.js';
import { SURFACES, surfaceState } from './surfaceState.js';
import { layoutMode } from '../layout/layoutMode.js';
import { LAYOUT_MODE_CHANGED, SURFACE_CHANGED } from '../../events.js';

/**
 * Wires the surface toolbar and the side-column toggle to surfaceState,
 * and re-applies the shell (panel visibility + body attributes) whenever
 * the active surface, the side column, or the layout shell changes.
 */
export class SurfacesController extends BaseController {

    constructor(toolbarSelector, shellSelector, sideToggleSelector) {
        super(toolbarSelector);
        this.shell = new SurfaceShellComponent(shellSelector);
        this.sideToggle = new SideToggleComponent(sideToggleSelector);
        this.sideToggle.onToggle = () => surfaceState.toggleSide();
    }

    createComponent(selector) {
        return new ToolbarComponent(selector);
    }

    getProps() {
        return {
            surfaces: SURFACES,
            active: surfaceState.active,
            embed: layoutMode.isEmbed,
            visibleRoots: surfaceState.visibleRoots(),
            allRoots: surfaceState.allRoots(),
        };
    }

    update() {
        const props = super.update();
        this.shell.render(props);
        this.sideToggle.render({ open: surfaceState.side });
        return props;
    }

    bindComponentEvents() {
        this.component.onSelect = (id) => surfaceState.show(id);
    }

    bindExternalEvents() {
        document.addEventListener(SURFACE_CHANGED, () => this.update());
        document.addEventListener(LAYOUT_MODE_CHANGED, () => this.update());
    }
}
