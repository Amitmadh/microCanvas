import { describe, expect, it } from "vitest";
import { Rectangle, type Canvas } from "../../src/index.js";
import { addCanvas, countRenders, nextFrame } from "./test-utils.js";

interface PointerOptions {
    x: number;
    y: number;
    pointerId?: number;
}

interface WheelOptions {
    x: number;
    y: number;
    deltaX?: number;
    deltaY?: number;
    ctrlKey?: boolean;
}

function simulatePointer(type: string, canvas: Canvas, { x, y, pointerId = 1 }: PointerOptions): void {
    const rect = canvas.canvas.getBoundingClientRect();
    canvas.canvas.dispatchEvent(new PointerEvent(type, { clientX: rect.left + x, clientY: rect.top + y, pointerId }));
}

function simulatePointerDown(canvas: Canvas, pos: PointerOptions): void {
    simulatePointer("pointerdown", canvas, pos);
}

function simulatePointerMove(canvas: Canvas, pos: PointerOptions): void {
    simulatePointer("pointermove", canvas, pos);
}

// Ends a pointer the way a browser does after pointerup: with lostpointercapture.
function simulatePointerUp(canvas: Canvas, pos: PointerOptions): void {
    simulatePointer("lostpointercapture", canvas, pos);
}

function simulateWheel(canvas: Canvas, { x, y, deltaX = 0, deltaY = 0, ctrlKey = false }: WheelOptions): void {
    const rect = canvas.canvas.getBoundingClientRect();
    canvas.canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: rect.left + x, clientY: rect.top + y, deltaX, deltaY, ctrlKey, cancelable: true,
    }));
}

// A draggable 100 × 40 rectangle at (100, 50).
function addRect(canvas: Canvas): Rectangle {
    const rect = new Rectangle({ x: 100, y: 50, width: 100, height: 40, fill: "tomato", draggable: true });
    canvas.add(rect);
    return rect;
}

describe("Pointer events", () => {
    // ======================================================
    it("pans with the wheel, and zooms around the cursor with Ctrl+wheel", () => {
        const canvas = addCanvas();

        simulateWheel(canvas, { x: 300, y: 100, deltaX: 80, deltaY: 120 });
        expect([canvas.panX, canvas.panY]).toEqual([-80, -120]);

        const before = canvas.screenToBoard({ x: 300, y: 100 });
        simulateWheel(canvas, { x: 300, y: 100, deltaY: -100, ctrlKey: true });
        const after = canvas.screenToBoard({ x: 300, y: 100 });
        expect(canvas.zoom).toBeCloseTo(Math.exp(0.1), 9);
        expect(after.x).toBeCloseTo(before.x, 9);
        expect(after.y).toBeCloseTo(before.y, 9);
    });

    // ======================================================
    it("drags a node at 2× zoom half as far as the pointer moves", () => {
        const canvas = addCanvas();
        const rect = addRect(canvas);
        const changes: number[][] = [];
        canvas.onChange = (node) => changes.push([node.x, node.y]);
        canvas.zoom = 2;

        simulatePointerDown(canvas, { x: 250, y: 120 });
        simulatePointerMove(canvas, { x: 350, y: 180 });
        simulatePointerUp(canvas, { x: 350, y: 180 });

        expect([rect.x, rect.y]).toEqual([150, 80]);
        expect(canvas.selected).toBe(rect);
        expect(changes.at(-1)).toEqual([150, 80]);
    });

    // ======================================================
    it("doesn't move a node on a tap or 2 px of jitter", () => {
        const canvas = addCanvas();
        const rect = addRect(canvas);
        let changes = 0;
        canvas.onChange = () => changes++;

        simulatePointerDown(canvas, { x: 150, y: 70 });
        simulatePointerUp(canvas, { x: 150, y: 70 });
        simulatePointerDown(canvas, { x: 150, y: 70 });
        simulatePointerMove(canvas, { x: 152, y: 71 });
        simulatePointerUp(canvas, { x: 152, y: 71 });

        expect([rect.x, rect.y]).toEqual([100, 50]);
        expect(changes).toBe(0);
    });

    // ======================================================
    it("zooms around the middle of a two-finger pinch, rendering once per frame", async () => {
        const canvas = addCanvas();
        const renders = countRenders(canvas);
        simulatePointerDown(canvas, { x: 200, y: 100, pointerId: 1 });
        simulatePointerDown(canvas, { x: 300, y: 100, pointerId: 2 });
        await nextFrame();
        renders.count = 0;

        simulatePointerMove(canvas, { x: 150, y: 100, pointerId: 1 });
        simulatePointerMove(canvas, { x: 350, y: 100, pointerId: 2 });
        await nextFrame();

        const middle = canvas.screenToBoard({ x: 250, y: 100 });
        expect(canvas.zoom).toBeCloseTo(2, 9);
        expect(middle.x).toBeCloseTo(250, 9);
        expect(middle.y).toBeCloseTo(100, 9);
        expect(renders.count).toBe(1);
    });

    // ======================================================
    it("stays usable after a pinch whose fingers start together", () => {
        const canvas = addCanvas();
        const rect = addRect(canvas);

        simulatePointerDown(canvas, { x: 300, y: 100, pointerId: 1 });
        simulatePointerDown(canvas, { x: 300, y: 100, pointerId: 2 });
        simulatePointerMove(canvas, { x: 400, y: 100, pointerId: 2 });
        simulatePointerUp(canvas, { x: 300, y: 100, pointerId: 1 });
        simulatePointerUp(canvas, { x: 400, y: 100, pointerId: 2 });
        expect(canvas.zoom).toBe(1);

        simulatePointerDown(canvas, { x: 150, y: 70, pointerId: 3 });
        simulatePointerUp(canvas, { x: 150, y: 70, pointerId: 3 });
        expect(canvas.selected).toBe(rect);
    });

    // ======================================================
    it("pans with the finger left after a pinch", () => {
        const canvas = addCanvas();

        simulatePointerDown(canvas, { x: 200, y: 100, pointerId: 1 });
        simulatePointerDown(canvas, { x: 300, y: 100, pointerId: 2 });
        simulatePointerMove(canvas, { x: 350, y: 100, pointerId: 2 });
        simulatePointerUp(canvas, { x: 350, y: 100, pointerId: 2 });
        const panX = canvas.panX;
        simulatePointerMove(canvas, { x: 100, y: 100, pointerId: 1 });

        expect(canvas.panX - panX).toBeCloseTo(-100, 9);
    });
});
