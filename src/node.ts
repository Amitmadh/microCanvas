import type { Canvas } from "./canvas.js";

export interface NodeOptions {
    x?: number;
    y?: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    opacity?: number;
    visible?: boolean;
    layer?: number;
}

export abstract class Node {
    x: number;
    y: number;
    /** Rotation around the node's position, in radians. */
    rotation: number;
    scaleX: number;
    scaleY: number;
    opacity: number;
    visible: boolean;
    /**
     * The canvas this node is in, Kept up to date by Canvas.
     */
    _canvas: Canvas | null = null;
    private _layer: number;

    constructor({
        x = 0,
        y = 0,
        rotation = 0,
        scaleX = 1,
        scaleY = 1,
        opacity = 1,
        visible = true,
        layer = 0,
    }: NodeOptions = {}) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.opacity = opacity;
        this.visible = visible;
        this._layer = layer;
    }

    /**
     * Drawing order. Nodes on higher layers are drawn on top of nodes on lower
     * ones, nodes on the same layer are drawn in the order they were added.
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
     * Draws the node in its own coordinate space, with (0, 0) at the node's
     * position. Any context state changed here is restored after drawing.
     */
    protected abstract draw(context: CanvasRenderingContext2D): void;
}
