import { Node, type NodeOptions } from "./node.js";
import { sharedContextInstance } from "./scratch.js";
import type { Paint, Point } from "./types.js";

export interface ShapeOptions extends NodeOptions {
    fill?: Paint | null;
    stroke?: Paint | null;
    strokeWidth?: number;
}

export abstract class Shape extends Node {
    fill: Paint | null;
    stroke: Paint | null;
    strokeWidth: number;

    constructor({
        fill = "black",
        stroke = null,
        strokeWidth = 1,
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

        // The context ignores a lineWidth of 0 and would keep the previous one.
        if (this.stroke && this.strokeWidth > 0) {
            context.strokeStyle = this.stroke;
            context.lineWidth = this.strokeWidth;
            context.stroke();
        }
    }

    /**
     * @method containsLocalPoint
     * @description Only the painted parts of a shape are hit: inside it if it
     * has a fill, and on its outline if it has a stroke.
     * @param point The point in the shape's own coordinate space.
     * @returns True if the point is on a painted part.
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
     * @method tracePath
     * @description Adds the shape's outline to the current path, in the
     * node's own coordinate space. Filling and stroking are done by Shape.
     * @param context The context whose path to add to.
     */
    protected abstract tracePath(context: CanvasRenderingContext2D): void;
}
