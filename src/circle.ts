import { Shape, type ShapeOptions } from "./shape.js";

export interface CircleOptions extends ShapeOptions {
    radius: number;
}

/** A circle centred on the node's position. */
export class Circle extends Shape {
    radius: number;

    constructor({ radius, ...options }: CircleOptions) {
        super(options);
        this.radius = radius;
    }

    protected tracePath(context: CanvasRenderingContext2D): void {
        // arc() throws on a negative radius, which would stop the whole render.
        context.arc(0, 0, Math.max(this.radius, 0), 0, Math.PI * 2);
    }
}
