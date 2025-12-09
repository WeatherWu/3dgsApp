import { type AppBase, Color, Entity, Layer, Mesh, Script, StandardMaterial, Texture, type Quat, Vec3 } from 'playcanvas';
/**
 * A script for creating interactive 3D annotations in a scene. Each annotation consists of:
 *
 * - A 3D hotspot that maintains constant screen-space size. The hotspot is rendered with muted
 * appearance when obstructed by geometry but is still clickable. The hotspot relies on an
 * invisible DOM element that matches the hotspot's size and position to detect clicks.
 * - An annotation panel that shows title and description text.
 */
export declare class Annotation extends Script {
    static scriptName: string;
    static hotspotSize: number;
    static hotspotColor: Color;
    static hoverColor: Color;
    static parentDom: HTMLElement | null;
    static styleSheet: HTMLStyleElement | null;
    static camera: Entity | null;
    static tooltipDom: HTMLDivElement | null;
    static titleDom: HTMLDivElement | null;
    static textDom: HTMLDivElement | null;
    static layers: Layer[];
    static mesh: Mesh | null;
    static activeAnnotation: Annotation | null;
    static hoverAnnotation: Annotation | null;
    static opacity: number;
    /**
     * @attribute
     */
    label: string;
    /**
     * @attribute
     */
    title: string;
    /**
     * @attribute
     */
    text: string;
    /**
     * @private
     */
    hotspotDom: HTMLDivElement | null;
    /**
     * @private
     */
    texture: Texture | null;
    /**
     * @private
     */
    materials: StandardMaterial[];
    /**
     * Injects required CSS styles into the document.
     * @param {number} size - The size of the hotspot in screen pixels.
     * @private
     */
    static _injectStyles(size: number): void;
    /**
     * Initialize static resources.
     * @param {AppBase} app - The application instance
     * @private
     */
    static _initializeStatic(app: AppBase): void;
    /**
     * Creates a circular hotspot texture.
     * @param {AppBase} app - The PlayCanvas AppBase
     * @param {string} label - Label text to draw on the hotspot
     * @param {number} [size] - The texture size (should be power of 2)
     * @param {number} [borderWidth] - The border width in pixels
     * @returns {Texture} The hotspot texture
     * @private
     */
    static _createHotspotTexture(app: AppBase, label: string, size?: number, borderWidth?: number): Texture;
    /**
     * Creates a material for hotspot rendering.
     * @param {Texture} texture - The texture to use for emissive and opacity
     * @param {object} [options] - Material options
     * @param {number} [options.opacity] - Base opacity multiplier
     * @param {boolean} [options.depthTest] - Whether to perform depth testing
     * @param {boolean} [options.depthWrite] - Whether to write to depth buffer
     * @returns {StandardMaterial} The configured material
     * @private
     */
    static _createHotspotMaterial(texture: Texture, { opacity, depthTest, depthWrite }?: {
        opacity?: number;
        depthTest?: boolean;
        depthWrite?: boolean;
    }): StandardMaterial;
    initialize(): void;
    /**
     * Set the hover state of the annotation.
     * @param hover - Whether the annotation is hovered
     * @private
     */
    setHover(hover: boolean): void;
    /**
     * @private
     */
    showTooltip(): void;
    /**
     * @private
     */
    hideTooltip(): void;
    /**
     * Hide all elements when annotation is behind camera.
     * @private
     */
    _hideElements(): void;
    /**
     * Update screen-space positions of HTML elements.
     * @param {Vec3} screenPos - Screen coordinate
     * @private
     */
    _updatePositions(screenPos: Vec3): void;
    /**
     * Update 3D rotation and scale of hotspot planes.
     * @private
     */
    _updateRotationAndScale(): void;
    /**
     * Update rotation of a single hotspot entity.
     * @param {Entity} hotspot - The hotspot entity to update
     * @param {Quat} cameraRotation - The camera's current rotation
     * @private
     */
    _updateHotspotTransform(hotspot: Entity, cameraRotation: Quat): void;
    /**
     * Calculate scale factor to maintain constant screen-space size.
     * @returns {number} The scale to apply to hotspot entities
     * @private
     */
    _calculateScreenSpaceScale(): number;
}
//# sourceMappingURL=annotation.d.ts.map