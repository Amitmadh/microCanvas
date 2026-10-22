import { Shape, type ShapeOptions } from "./shape.js";
import type { Point, Rect } from "./types.js";
import { isInsideRect } from "./util.js";

export interface RectangleOptions extends ShapeOptions {
    width: number;
    height: number;
}

/**
 * A rectangle with its top-left corner at the node's position.
 */
export class Rectangle extends Shape {
    width: number;
    height: number;

    constructor({ width, height, ...options }: RectangleOptions) {
        super(options);
        this.width = width;
        this.height = height;
    }

    getLocalBounds(): Rect {
        // A negative width or height draws left of or above the position.
        return {
            x: Math.min(this.width, 0),
            y: Math.min(this.height, 0),
            width: Math.abs(this.width),
            height: Math.abs(this.height),
        };
    }

    resize(anchor: Point, corner: Point): void {
        const topLeft = this.localToBoard({ x: Math.min(anchor.x, corner.x), y: Math.min(anchor.y, corner.y) });
        this.x = topLeft.x;
        this.y = topLeft.y;
        this.width = Math.abs(corner.x - anchor.x);
        this.height = Math.abs(corner.y - anchor.y);
    }

    protected containsLocalPoint({ x, y }: Point): boolean {
        const bounds = this.getLocalBounds();
        if (this.fill && isInsideRect(x, y, bounds)) {
            return true;
        }

        if (this.stroke && this.strokeWidth > 0) {
            const half = this.strokeWidth / 2;
            return isInsideRect(x, y, bounds, half) && !isInsideRect(x, y, bounds, -half);
        }

        return false;
    }

    protected tracePath(context: CanvasRenderingContext2D): void {
        context.rect(0, 0, this.width, this.height);
    }
}
