import { DEFAULT_FILL, DEFAULT_STROKE_WIDTH } from "./config.js";
import { McNode, type McNodeOptions } from "./node.js";
import { sharedContextInstance } from "./scratch.js";
import type { Paint, Point } from "./types.js";

export interface ShapeOptions extends McNodeOptions {
    fill?: Paint | null;
    stroke?: Paint | null;
    strokeWidth?: number;
}

/**
 * A node drawn from a path, with an optional fill and stroke.
 */
export abstract class Shape extends McNode {
    fill: Paint | null;
    stroke: Paint | null;
    strokeWidth: number;

    constructor({
        fill = DEFAULT_FILL,
        stroke = null,
        strokeWidth = DEFAULT_STROKE_WIDTH,
        ...options
    }: ShapeOptions = {}) {
        super(options);
        this.fill = fill;
        this.stroke = stroke;
        this.strokeWidth = strokeWidth;
    }

    protected draw(context: CanvasRenderingContext2D): void {
        context.beginPath();
        this.tracePath(context);

        if (this.fill) {
            context.fillStyle = this.fill;
            context.fill();
        }

        // The context ignores a lineWidth of 0.
        if (this.stroke && this.strokeWidth > 0) {
            context.strokeStyle = this.stroke;
            context.lineWidth = this.strokeWidth;
            context.stroke();
        }
    }

    /**
     * Only the fill and stroke are hit.
     * @param point The point in the shape's own space.
     * @returns Whether the point is hit.
     */
    protected containsLocalPoint({ x, y }: Point): boolean {
        const context = sharedContextInstance();
        context.beginPath();
        this.tracePath(context);

        if (this.fill && context.isPointInPath(x, y)) {
            return true;
        }

        if (this.stroke && this.strokeWidth > 0) {
            context.lineWidth = this.strokeWidth;
            return context.isPointInStroke(x, y);
        }

        return false;
    }

    /**
     * Adds the shape's outline to the current path, in its own
     * space. Shape fills and strokes it.
     * @param context The context whose path to add to.
     */
    protected abstract tracePath(context: CanvasRenderingContext2D): void;
}
