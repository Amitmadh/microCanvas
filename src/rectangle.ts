import { Shape, type ShapeOptions } from "./shape.js";
import type { Point, Rect } from "./types.js";

export interface RectangleOptions extends ShapeOptions {
    width: number;
    height: number;
}

/**
 * @class Rectangle
 * @description A rectangle with its top-left corner at the node's position.
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
        // A negative width or height draws to the left of or above the
        // node's position.
        return {
            x: Math.min(this.width, 0),
            y: Math.min(this.height, 0),
            width: Math.abs(this.width),
            height: Math.abs(this.height),
        };
    }

    protected containsLocalPoint({ x, y }: Point): boolean {
        const bounds = this.getLocalBounds();
        if (this.fill && this._isInside(x, y, bounds)) {
            return true;
        }

        if (this.stroke && this.strokeWidth > 0) {
            const half = this.strokeWidth / 2;
            return this._isInside(x, y, bounds, half) && !this._isInside(x, y, bounds, -half);
        }

        return false;
    }

    protected tracePath(context: CanvasRenderingContext2D): void {
        context.rect(0, 0, this.width, this.height);
    }

    private _isInside(x: number, y: number, box: Rect, margin: number = 0): boolean {
        return x >= box.x - margin && x <= box.x + box.width + margin
            && y >= box.y - margin && y <= box.y + box.height + margin;
    }
}
