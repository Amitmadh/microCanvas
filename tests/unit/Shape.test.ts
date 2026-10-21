import { describe, expect, it } from "vitest";
import { Circle, Rectangle, Shape, type Point, type ShapeOptions } from "../../src/index.js";
import { seededRandom } from "./test-utils.js";

// Rectangle and Circle hit-test with exact math. Checks it against the
// browser's isPointInPath and isPointInStroke (Shape's default) on random
// shapes and points: they may only disagree at an edge, where the browser
// approximates curves with short lines.
function expectHitsLikeTheBrowser(createShape: (random: (min?: number, max?: number) => number, options: ShapeOptions) => Shape): void {
    const { random, pick } = seededRandom(1);
    // Bracket access reaches the protected method.
    const exact = (shape: Shape, point: Point) => shape["containsLocalPoint"](point);
    const browser = (shape: Shape, point: Point) => Shape.prototype["containsLocalPoint"].call(shape, point);
    const nearby = [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]];

    for (let i = 0; i < 200; i++) {
        const shape = createShape(random, {
            rotation: random(-3, 3),
            scaleX: pick(1, random(0.3, 3), -random(0.3, 3)),
            scaleY: pick(1, random(0.3, 3)),
            fill: pick("red", null),
            stroke: "blue",
            strokeWidth: pick(0, 1, random(2, 30)),
        });
        for (let j = 0; j < 500; j++) {
            const point = shape.boardToLocal({ x: random(-250, 250), y: random(-250, 250) });
            const hit = exact(shape, point);
            if (hit !== browser(shape, point)) {
                const atEdge = nearby.some(([dx, dy]) => exact(shape, { x: point.x + dx, y: point.y + dy }) !== hit);
                expect(atEdge, `shape ${i} disagrees with the browser at (${point.x}, ${point.y}), away from any edge`).toBe(true);
            }
        }
    }
}

describe("Shape", () => {
    // ======================================================
    it("hit-tests rotated, scaled and stroked rectangles like the browser", () => {
        expectHitsLikeTheBrowser((random, options) => new Rectangle({ ...options, width: random(-150, 150), height: random(-150, 150) }));
    });

    // ======================================================
    it("hit-tests rotated, scaled and stroked circles like the browser", () => {
        // Radii stay above half the widest stroke: Chrome leaves a wider stroke hollow.
        expectHitsLikeTheBrowser((random, options) => new Circle({ ...options, radius: random(16, 100) }));
    });
});
