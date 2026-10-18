import { Node, type NodeOptions } from "./node.js";
import type { Paint } from "./types.js";

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
     * Adds the shape's outline to the current path, in the node's own
     * coordinate space. Filling and stroking are done by Shape.
     */
    protected abstract tracePath(context: CanvasRenderingContext2D): void;
}
