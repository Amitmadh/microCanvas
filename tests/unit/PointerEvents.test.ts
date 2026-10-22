import { describe, expect, it } from "vitest";
import { Circle, McText, Rectangle, type Canvas } from "../../src/index.js";
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
    it("stops moving a node that's removed mid-drag", () => {
        const canvas = addCanvas();
        const rect = addRect(canvas);
        let changing = 0;
        let changes = 0;
        canvas.whileChange = () => changing++;
        canvas.onChange = () => changes++;

        simulatePointerDown(canvas, { x: 150, y: 70 });
        simulatePointerMove(canvas, { x: 170, y: 70 });
        // As when a collaborator deletes it.
        canvas.remove(rect);
        simulatePointerMove(canvas, { x: 230, y: 70 });
        simulatePointerUp(canvas, { x: 230, y: 70 });

        expect([rect.x, rect.y]).toEqual([120, 50]);
        expect([changing, changes]).toEqual([1, 0]);
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

    // ======================================================
    it("resizes the selection by a corner, keeping the opposite corner in place", () => {
        const canvas = addCanvas();
        const rect = addRect(canvas);
        rect.resizable = true;
        canvas.selected = rect;
        let changing = 0;
        let changes = 0;
        canvas.whileChange = () => changing++;
        canvas.onChange = () => changes++;

        simulatePointerDown(canvas, { x: 200, y: 90 });
        simulatePointerMove(canvas, { x: 250, y: 120 });
        simulatePointerUp(canvas, { x: 250, y: 120 });
        expect([rect.x, rect.y, rect.width, rect.height]).toEqual([100, 50, 150, 70]);
        expect([changing, changes]).toEqual([1, 1]);

        simulatePointerDown(canvas, { x: 100, y: 50 });
        simulatePointerMove(canvas, { x: 80, y: 40 });
        simulatePointerUp(canvas, { x: 80, y: 40 });
        expect([rect.x, rect.y, rect.width, rect.height]).toEqual([80, 40, 170, 80]);
    });

    // ======================================================
    it("resizes a rotated, scaled and stroked node along its own sides", () => {
        const canvas = addCanvas();
        const rect = new Rectangle({
            x: 200, y: 60, width: 80, height: 40, rotation: Math.PI / 6, scaleX: 1.5, scaleY: 0.8,
            stroke: "black", strokeWidth: 10, resizable: true,
        });
        canvas.add(rect);
        canvas.selected = rect;
        const anchor = rect.localToBoard({ x: 0, y: 0 });
        const corner = rect.localToBoard({ x: 80, y: 40 });
        // The handle sits on the outline, half the stroke past the corner.
        const handle = rect.localToBoard({ x: 85, y: 45 });

        simulatePointerDown(canvas, handle);
        simulatePointerMove(canvas, { x: handle.x + 30, y: handle.y + 20 });
        simulatePointerUp(canvas, { x: handle.x + 30, y: handle.y + 20 });

        const newAnchor = rect.localToBoard({ x: 0, y: 0 });
        const newCorner = rect.localToBoard({ x: rect.width, y: rect.height });
        expect(newAnchor.x).toBeCloseTo(anchor.x, 9);
        expect(newAnchor.y).toBeCloseTo(anchor.y, 9);
        expect(newCorner.x).toBeCloseTo(corner.x + 30, 9);
        expect(newCorner.y).toBeCloseTo(corner.y + 20, 9);
    });

    // ======================================================
    it("keeps a circle round, and resizes text by its font size", () => {
        const canvas = addCanvas();
        const circle = new Circle({ x: 300, y: 100, radius: 40, resizable: true });
        const text = new McText({ text: "Note", x: 100, y: 120, fontSize: 20, resizable: true });
        canvas.add(circle, text);

        canvas.selected = circle;
        simulatePointerDown(canvas, { x: 340, y: 140 });
        simulatePointerMove(canvas, { x: 380, y: 150 });
        simulatePointerUp(canvas, { x: 380, y: 150 });
        expect([circle.x, circle.y, circle.radius]).toEqual([320, 120, 60]);

        canvas.selected = text;
        const bounds = text.getLocalBounds();
        const anchor = text.localToBoard({ x: bounds.x, y: bounds.y });
        const handle = text.localToBoard({ x: bounds.x + bounds.width, y: bounds.y + bounds.height });
        simulatePointerDown(canvas, handle);
        simulatePointerMove(canvas, { x: handle.x + bounds.width, y: handle.y });
        simulatePointerUp(canvas, { x: handle.x + bounds.width, y: handle.y });

        expect(text.fontSize).toBeCloseTo(40, 9);
        // Font metrics are rounded, so text only grows about in proportion.
        const after = text.getLocalBounds();
        const newAnchor = text.localToBoard({ x: after.x, y: after.y });
        expect(Math.abs(newAnchor.x - anchor.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(newAnchor.y - anchor.y)).toBeLessThanOrEqual(1);
    });

    // ======================================================
    it("doesn't flip a node or shrink it below a handle", () => {
        const canvas = addCanvas();
        const rect = addRect(canvas);
        rect.resizable = true;
        canvas.selected = rect;

        simulatePointerDown(canvas, { x: 200, y: 90 });
        simulatePointerMove(canvas, { x: 20, y: 10 });
        simulatePointerUp(canvas, { x: 20, y: 10 });

        expect([rect.x, rect.y, rect.width, rect.height]).toEqual([100, 50, 8, 8]);
    });

    // ======================================================
    it("only resizes the selection, and only when it's resizable", () => {
        const canvas = addCanvas();
        const rect = addRect(canvas);
        rect.resizable = true;

        // Not selected yet, so pressing its corner selects it and drags it.
        simulatePointerDown(canvas, { x: 198, y: 88 });
        simulatePointerMove(canvas, { x: 248, y: 118 });
        simulatePointerUp(canvas, { x: 248, y: 118 });
        expect(canvas.selected).toBe(rect);
        expect([rect.x, rect.y, rect.width, rect.height]).toEqual([150, 80, 100, 40]);

        rect.resizable = false;
        simulatePointerDown(canvas, { x: 248, y: 118 });
        simulatePointerMove(canvas, { x: 298, y: 148 });
        simulatePointerUp(canvas, { x: 298, y: 148 });
        expect([rect.x, rect.y, rect.width, rect.height]).toEqual([200, 110, 100, 40]);
    });

    // ======================================================
    it("selects draggable and resizable nodes, even with selectable off", () => {
        const canvas = addCanvas();
        const draggable = new Rectangle({ x: 20, y: 20, width: 40, height: 40, draggable: true });
        const resizable = new Rectangle({ x: 100, y: 20, width: 40, height: 40, resizable: true });
        const neither = new Rectangle({ x: 180, y: 20, width: 40, height: 40 });
        canvas.add(draggable, resizable, neither);

        simulatePointerDown(canvas, { x: 40, y: 40 });
        simulatePointerUp(canvas, { x: 40, y: 40 });
        expect(canvas.selected).toBe(draggable);

        simulatePointerDown(canvas, { x: 120, y: 40 });
        simulatePointerUp(canvas, { x: 120, y: 40 });
        expect(canvas.selected).toBe(resizable);

        simulatePointerDown(canvas, { x: 200, y: 40 });
        simulatePointerUp(canvas, { x: 200, y: 40 });
        expect(canvas.selected).toBe(null);
        expect([draggable, resizable, neither].map((node) => node.selectable)).toEqual([false, false, false]);
    });
});
