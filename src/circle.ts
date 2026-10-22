import { Shape, type ShapeOptions } from "./shape.js";
import type { Point, Rect } from "./types.js";

export interface CircleOptions extends ShapeOptions {
    radius: number;
}

export interface CircleJSON extends Required<CircleOptions> {
    type: "circle";
}

/**
 * A circle centred on the node's position.
 */
export class Circle extends Shape {
    radius: number;

    constructor({ radius, ...options }: CircleOptions) {
        super(options);
        this.radius = radius;
    }

    toJSON(): CircleJSON {
        return { ...super.toJSON(), type: "circle", radius: this.radius };
    }

    getLocalBounds(): Rect {
        const radius = Math.max(this.radius, 0);
        return { x: -radius, y: -radius, width: radius * 2, height: radius * 2 };
    }

    resize(anchor: Point, corner: Point): void {
        // A circle stays round, as wide as the larger side.
        const radius = Math.max(Math.abs(corner.x - anchor.x), Math.abs(corner.y - anchor.y)) / 2;
        const center = this.localToBoard({
            x: anchor.x + Math.sign(corner.x - anchor.x) * radius,
            y: anchor.y + Math.sign(corner.y - anchor.y) * radius,
        });
        this.x = center.x;
        this.y = center.y;
        this.radius = radius;
    }

    protected containsLocalPoint({ x, y }: Point): boolean {
        const radius = Math.max(this.radius, 0);
        const distance = Math.hypot(x, y);
        if (this.fill && distance <= radius) {
            return true;
        }

        if (this.stroke && this.strokeWidth > 0) {
            return Math.abs(distance - radius) <= this.strokeWidth / 2;
        }

        return false;
    }

    protected tracePath(context: CanvasRenderingContext2D): void {
        context.arc(0, 0, Math.max(this.radius, 0), 0, Math.PI * 2);
    }
}
