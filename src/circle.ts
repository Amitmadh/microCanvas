import { Shape, type ShapeOptions } from "./shape.js";
import type { Point, Rect } from "./types.js";

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

    getLocalBounds(): Rect {
        const radius = Math.max(this.radius, 0);
        return { x: -radius, y: -radius, width: radius * 2, height: radius * 2 };
    }

    /**
     * The same answer as Shape's path test, worked out directly, which is
     * several times faster.
     */
    protected containsLocalPoint({ x, y }: Point): boolean {
        const radius = Math.max(this.radius, 0);
        const distance = Math.hypot(x, y);
        if (this.fill && distance <= radius) {
            return true;
        }

        // The stroke is centred on the outline, half inside and half outside.
        if (this.stroke && this.strokeWidth > 0) {
            return Math.abs(distance - radius) <= this.strokeWidth / 2;
        }

        return false;
    }

    protected tracePath(context: CanvasRenderingContext2D): void {
        // arc() throws on a negative radius, which would stop the whole render.
        context.arc(0, 0, Math.max(this.radius, 0), 0, Math.PI * 2);
    }
}
