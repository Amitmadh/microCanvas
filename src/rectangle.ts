import { Shape, type ShapeOptions } from "./shape.js";
import type { Point, Rect } from "./types.js";

export interface RectangleOptions extends ShapeOptions {
    width: number;
    height: number;
}

export class Rectangle extends Shape {
    width: number;
    height: number;

    constructor({ width, height, ...options }: RectangleOptions) {
        super(options);
        this.width = width;
        this.height = height;
    }

    getLocalBounds(): Rect {
        // A negative width or height draws to the left of or above the
        // node's position.
        return {
            x: Math.min(this.width, 0),
            y: Math.min(this.height, 0),
            width: Math.abs(this.width),
            height: Math.abs(this.height),
        };
    }

    /**
     * The same answer as Shape's path test, worked out directly, which is
     * several times faster.
     */
    protected containsLocalPoint({ x, y }: Point): boolean {
        const bounds = this.getLocalBounds();
        if (this.fill && isInside(x, y, bounds, 0)) {
            return true;
        }

        if (this.stroke && this.strokeWidth > 0) {
            // The stroke is centred on the outline and has square corners, so
            // it covers the box grown by half its width, minus the box shrunk
            // by half its width.
            const half = this.strokeWidth / 2;
            return isInside(x, y, bounds, half) && !isInside(x, y, bounds, -half);
        }

        return false;
    }

    protected tracePath(context: CanvasRenderingContext2D): void {
        context.rect(0, 0, this.width, this.height);
    }
}

/** Whether a point is in a box grown by margin on every side. */
function isInside(x: number, y: number, box: Rect, margin: number): boolean {
    return x >= box.x - margin && x <= box.x + box.width + margin
        && y >= box.y - margin && y <= box.y + box.height + margin;
}
