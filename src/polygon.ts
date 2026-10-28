import { sharedContextInstance } from "./scratch.js";
import { Shape, type ShapeOptions } from "./shape.js";
import type { Point, Rect } from "./types.js";

export interface PolygonOptions extends ShapeOptions {
    width: number;
    height: number;
}

export interface PolygonJSON extends Required<PolygonOptions> {
    type: "triangle" | "diamond" | "hexagon" | "star" | "arrow" | "cursor";
}

/**
 * A shape stretched to fill a box with its top-left corner at the node's
 * position. Its stroke has round corners.
 */
export abstract class Polygon extends Shape {
    width: number;
    height: number;

    constructor({ width, height, ...options }: PolygonOptions) {
        super(options);
        this.width = width;
        this.height = height;
    }

    toJSON(): Required<PolygonOptions> {
        return { ...super.toJSON(), width: this.width, height: this.height };
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

    protected draw(context: CanvasRenderingContext2D): void {
        // Miter corners would pass the bounds.
        context.lineJoin = "round";
        super.draw(context);
    }

    protected containsLocalPoint(point: Point): boolean {
        const context = sharedContextInstance();
        context.save();
        context.lineJoin = "round";
        const hit = super.containsLocalPoint(point);
        context.restore();
        return hit;
    }

    protected tracePath(context: CanvasRenderingContext2D): void {
        for (const [x, y] of this.outline()) {
            context.lineTo(x * this.width, y * this.height);
        }
        context.closePath();
    }

    /**
     * Stretched from a 1 × 1 box to the width and height.
     * @returns The corners in order, as [x, y] from 0 to 1.
     */
    protected abstract outline(): [number, number][];
}

/**
 * A triangle with its top at the middle of its box's top.
 */
export class Triangle extends Polygon {
    toJSON(): PolygonJSON {
        return { ...super.toJSON(), type: "triangle" };
    }

    protected outline(): [number, number][] {
        return [[0.5, 0], [1, 1], [0, 1]];
    }
}

/**
 * A diamond with a corner at the middle of each side of its box.
 */
export class Diamond extends Polygon {
    toJSON(): PolygonJSON {
        return { ...super.toJSON(), type: "diamond" };
    }

    protected outline(): [number, number][] {
        return [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
    }
}

/**
 * A hexagon with a flat top and bottom.
 */
export class Hexagon extends Polygon {
    toJSON(): PolygonJSON {
        return { ...super.toJSON(), type: "hexagon" };
    }

    protected outline(): [number, number][] {
        return [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]];
    }
}

/**
 * A five-pointed star with a point up.
 */
export class Star extends Polygon {
    toJSON(): PolygonJSON {
        return { ...super.toJSON(), type: "star" };
    }

    protected outline(): [number, number][] {
        return [
            [0.5, 0], [0.618, 0.382], [1, 0.382], [0.691, 0.618], [0.809, 1],
            [0.5, 0.764], [0.191, 1], [0.309, 0.618], [0, 0.382], [0.382, 0.382],
        ];
    }
}

/**
 * An arrow pointing right.
 */
export class Arrow extends Polygon {
    toJSON(): PolygonJSON {
        return { ...super.toJSON(), type: "arrow" };
    }

    protected outline(): [number, number][] {
        return [[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]];
    }
}

/**
 * A mouse pointer with its tip at the node's position.
 */
export class Cursor extends Polygon {
    toJSON(): PolygonJSON {
        return { ...super.toJSON(), type: "cursor" };
    }

    protected outline(): [number, number][] {
        return [[0, 0], [0, 0.829], [0.346, 0.634], [0.615, 1], [0.846, 0.927], [0.577, 0.561], [1, 0.561]];
    }
}
