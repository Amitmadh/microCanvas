import { describe, expect, it } from "vitest";
import { Arrow, Cursor, Diamond, Hexagon, Star, Triangle, type Canvas, type Polygon } from "../../src/index.js";
import { addCanvas } from "./test-utils.js";

// The RGBA of the canvas pixel at a point in CSS pixels.
function getPixel(canvas: Canvas, x: number, y: number): number[] {
    const ratio = canvas.pixelRatio;
    return [...canvas.context.getImageData(Math.floor(x * ratio), Math.floor(y * ratio), 1, 1).data];
}

describe("Polygon", () => {
    // ======================================================
    it("fills its outline, stretched to its box", () => {
        const box = { x: 100, y: 50, width: 200, height: 100 };
        // Each with a point inside its outline and one outside, as fractions of the box.
        const cases: [Polygon, [number, number], [number, number]][] = [
            [new Triangle(box), [0.5, 0.9], [0.1, 0.1]],
            [new Diamond(box), [0.5, 0.5], [0.1, 0.1]],
            [new Hexagon(box), [0.5, 0.5], [0.05, 0.1]],
            [new Star(box), [0.5, 0.55], [0.5, 0.9]],
            [new Arrow(box), [0.3, 0.5], [0.3, 0.1]],
            [new Cursor(box), [0.2, 0.4], [0.8, 0.2]],
        ];

        for (const [shape, inside, outside] of cases) {
            const hits = ([x, y]: [number, number]) => shape.containsPoint({ x: box.x + x * box.width, y: box.y + y * box.height });
            expect([hits(inside), hits(outside)], shape.constructor.name).toEqual([true, false]);
        }
    });

    // ======================================================
    it("keeps a thick stroke within its stroked bounds, drawn and hit", () => {
        const canvas = addCanvas();
        const star = new Star({ x: 100, y: 50, width: 100, height: 100, fill: null, stroke: "black", strokeWidth: 20 });
        canvas.add(star);
        canvas.render();

        // Its top point is at (150, 50). A miter corner would reach 32 px above it, not 10.
        expect(getPixel(canvas, 150, 42)).toEqual([0, 0, 0, 255]);
        expect(getPixel(canvas, 150, 38)).toEqual([0, 0, 0, 0]);
        expect(star.containsPoint({ x: 150, y: 42 })).toBe(true);
        expect(star.containsPoint({ x: 150, y: 38 })).toBe(false);
    });

    // ======================================================
    it("resizes to the corner, keeping the anchor in place", () => {
        const arrow = new Arrow({ x: 100, y: 50, width: 120, height: 60, rotation: 0.5 });
        const anchor = arrow.localToBoard({ x: 120, y: 60 });

        arrow.resize({ x: 120, y: 60 }, { x: 20, y: 30 });

        expect([arrow.width, arrow.height]).toEqual([100, 30]);
        const moved = arrow.localToBoard({ x: 100, y: 30 });
        expect(moved.x).toBeCloseTo(anchor.x);
        expect(moved.y).toBeCloseTo(anchor.y);
    });
});
