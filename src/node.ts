import type { Canvas } from "./canvas.js";
import type { Point, Rect } from "./types.js";

export interface McNodeOptions {
    x?: number;
    y?: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    opacity?: number;
    visible?: boolean;
    layer?: number;
    selectable?: boolean;
    draggable?: boolean;
}

/**
 * @class McNode
 * @description The base of everything drawn on a canvas.
 */
export abstract class McNode {
    x: number;
    y: number;
    /** In radians, around the node's position. */
    rotation: number;
    scaleX: number;
    scaleY: number;
    opacity: number;
    visible: boolean;
    /**
     * @internal
     * Kept up to date by Canvas.
     */
    _canvas: Canvas | null = null;
    private _layer: number;
    private _selectable: boolean;
    private _draggable: boolean;

    constructor({
        x = 0,
        y = 0,
        rotation = 0,
        scaleX = 1,
        scaleY = 1,
        opacity = 1,
        visible = true,
        layer = 0,
        selectable = false,
        draggable = false,
    }: McNodeOptions = {}) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.opacity = opacity;
        this.visible = visible;
        this._layer = layer;
        this._draggable = draggable;
        // A draggable node is always selectable.
        this._selectable = selectable || draggable;
    }

    /**
     * Higher layers draw on top; within a layer, nodes draw in the order added.
     */
    get layer(): number {
        return this._layer;
    }

    set layer(layer: number) {
        if (layer !== this._layer) {
            this._layer = layer;
            if (this._canvas) {
                this._canvas._needsSort = true;
            }
        }
    }

    /** Turning this off also turns off draggable. */
    get selectable(): boolean {
        return this._selectable;
    }

    set selectable(selectable: boolean) {
        this._selectable = selectable;
        if (!selectable) {
            this._draggable = false;
        }
    }

    /** Turning this on also turns on selectable. */
    get draggable(): boolean {
        return this._draggable;
    }

    set draggable(draggable: boolean) {
        this._draggable = draggable;
        if (draggable) {
            this._selectable = true;
        }
    }

    render(context: CanvasRenderingContext2D): void {
        if (!this.visible || this.opacity <= 0) {
            return;
        }

        context.save();
        context.translate(this.x, this.y);
        context.rotate(this.rotation);
        context.scale(this.scaleX, this.scaleY);
        context.globalAlpha *= this.opacity;
        this.draw(context);
        context.restore();
    }

    /**
     * @method getLocalBounds
     * @description The box around the node in its own space, before rotation
     * and scale. For shapes it leaves out the stroke.
     * @returns The box in the node's own space.
     */
    abstract getLocalBounds(): Rect;

    localToBoard({ x, y }: Point): Point {
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        const scaledX = x * this.scaleX;
        const scaledY = y * this.scaleY;
        return {
            x: this.x + scaledX * cos - scaledY * sin,
            y: this.y + scaledX * sin + scaledY * cos,
        };
    }

    boardToLocal({ x, y }: Point): Point {
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        const dx = x - this.x;
        const dy = y - this.y;
        return {
            x: (dx * cos + dy * sin) / this.scaleX,
            y: (dy * cos - dx * sin) / this.scaleY,
        };
    }

    /**
     * @method containsPoint
     * @description Ignores visibility, so a hidden node still contains points.
     * @param point The point in board coordinates.
     * @returns Whether the point is on the node.
     */
    containsPoint(point: Point): boolean {
        return this.containsLocalPoint(this.boardToLocal(point));
    }

    /**
     * @method draw
     * @description Draws the node in its own space, with (0, 0) at its
     * position. Context changes are restored afterwards.
     * @param context The context to draw on.
     */
    protected abstract draw(context: CanvasRenderingContext2D): void;

    /**
     * @method containsLocalPoint
     * @description Uses the local bounds; override it for shapes that aren't
     * boxes.
     * @param point The point in the node's own space.
     * @returns Whether the point is on the node.
     */
    protected containsLocalPoint({ x, y }: Point): boolean {
        const bounds = this.getLocalBounds();
        return x >= bounds.x && x < bounds.x + bounds.width
            && y >= bounds.y && y < bounds.y + bounds.height;
    }
}
