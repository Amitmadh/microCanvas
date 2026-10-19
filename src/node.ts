import type { Canvas } from "./canvas.js";
import type { Point, Rect } from "./types.js";

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
     * The box around the node's shape in its own coordinate space, before
     * rotation and scale. For shapes it leaves out the stroke.
     */
    abstract getLocalBounds(): Rect;

    /**
     * The smallest axis-aligned box around the node in canvas coordinates,
     * after its position, rotation and scale.
     */
    getBounds(): Rect {
        const { x, y, width, height } = this.getLocalBounds();
        const corners = [
            this.localToCanvas({ x: x, y: y }),
            this.localToCanvas({ x: x + width, y: y }),
            this.localToCanvas({ x: x, y: y + height }),
            this.localToCanvas({ x: x + width, y: y + height }),
        ];
        const xs = corners.map((corner) => corner.x);
        const ys = corners.map((corner) => corner.y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
    }

    /** Converts a point from the node's own coordinate space to canvas coordinates. */
    localToCanvas({ x, y }: Point): Point {
        // The same steps as render(): scale, then rotate, then move to the
        // node's position.
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        const scaledX = x * this.scaleX;
        const scaledY = y * this.scaleY;
        return {
            x: this.x + scaledX * cos - scaledY * sin,
            y: this.y + scaledX * sin + scaledY * cos,
        };
    }

    /**
     * Converts a point from canvas coordinates to the node's own coordinate
     * space, where (0, 0) is the node's position. An axis with a scale of 0
     * has no inverse, so it comes out as NaN or Infinity.
     */
    canvasToLocal({ x, y }: Point): Point {
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
     * Whether a point in canvas coordinates is on the node. Only the node's
     * shape counts, so a hidden node still contains points; Canvas.nodeAt()
     * is what skips nodes that aren't drawn.
     */
    containsPoint(point: Point): boolean {
        return this.containsLocalPoint(this.canvasToLocal(point));
    }

    /**
     * Draws the node in its own coordinate space, with (0, 0) at the node's
     * position. Any context state changed here is restored after drawing.
     */
    protected abstract draw(context: CanvasRenderingContext2D): void;

    /**
     * Whether a point in the node's own coordinate space is on the node. Uses
     * the local bounds; override it where the shape is more exact than a box.
     */
    protected containsLocalPoint({ x, y }: Point): boolean {
        const bounds = this.getLocalBounds();
        return x >= bounds.x && x < bounds.x + bounds.width
            && y >= bounds.y && y < bounds.y + bounds.height;
    }
}
