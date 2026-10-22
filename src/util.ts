import type { Point, Rect } from "./types.js";

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function distance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
    return a.x <= b.x + b.width && b.x <= a.x + a.width
        && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

export function isInsideRect(x: number, y: number, rect: Rect, margin = 0): boolean {
    return x >= rect.x - margin && x <= rect.x + rect.width + margin
        && y >= rect.y - margin && y <= rect.y + rect.height + margin;
}

/** Clockwise from the top-left. */
export function rectCorners({ x, y, width, height }: Rect): Point[] {
    return [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
    ];
}
