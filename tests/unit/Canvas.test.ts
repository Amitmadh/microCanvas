import { describe, expect, it, onTestFinished, vi } from "vitest";
import { Circle, McText, Rectangle, type Canvas } from "../../src/index.js";
import { addCanvas, addContainer, countRenders, nextFrame, seededRandom } from "./test-utils.js";

// The RGBA of the canvas pixel at a point in CSS pixels.
function getPixel(canvas: Canvas, x: number, y: number): number[] {
    const ratio = canvas.pixelRatio;
    return [...canvas.context.getImageData(Math.floor(x * ratio), Math.floor(y * ratio), 1, 1).data];
}

// A node whose drawing fails, like a custom node with a bug.
class FailingNode extends Rectangle {
    protected draw(): void {
        throw new Error("Failed to draw");
    }
}

// A 600 × 300 flex container with a 100 px sidebar and a canvas filling the rest.
function addFlexBoard(direction: "row" | "column") {
    const app = addContainer();
    app.style.cssText = `display: flex; flex-direction: ${direction}; width: 600px; height: 300px`;
    app.innerHTML = `<div style="flex: 0 0 100px"></div><div style="flex: 1"></div>`;
    return { app, canvas: addCanvas({}, app.lastElementChild as HTMLElement) };
}

// Draws 100 views of a random scene twice, with render() and with every node
// drawn, and counts the pixels that differ. Each view puts a node's position
// on its edge, so nodes straddle the edges. The outermost rows and columns of
// pixels count only with { border: true }.
function compareWithEveryNodeDrawn({ border = false } = {}): number {
    const { random, pick } = seededRandom(7);
    const canvas = addCanvas({ width: 800, height: 600, background: "white" });
    const nodes = Array.from({ length: 300 }, (_, i) => {
        const common = {
            x: random(-400, 1200),
            y: random(-300, 900),
            rotation: pick(0, random(-3, 3)),
            scaleX: pick(1, random(0.3, 2.5), -random(0.3, 2.5)),
            scaleY: pick(1, random(0.3, 2.5)),
        };
        if (i % 3 === 0) {
            return new Rectangle({ ...common, width: random(-160, 160), height: random(-120, 120), fill: pick("gold", null), stroke: "black", strokeWidth: pick(1, random(2, 30)) });
        }
        if (i % 3 === 1) {
            return new Circle({ ...common, radius: random(5, 90), fill: pick("tomato", null), stroke: "black", strokeWidth: pick(1, random(2, 40)) });
        }
        return new McText({
            ...common, text: pick("Note", "fjord", "Wyjkq", "שלום עולם", "j"), fontSize: random(10, 60), fill: "slateblue",
            fontStyle: pick("normal", "italic"), fontFamily: pick("sans-serif", "serif", "monospace"),
            align: pick("left", "center", "right"), baseline: pick("alphabetic", "top", "middle", "bottom"),
        });
    });
    canvas.add(...nodes);
    const { context, pixelRatio: ratio } = canvas;
    const { width, height } = canvas.canvas;
    const read = () => context.getImageData(0, 0, width, height).data;

    let differences = 0;
    for (let view = 0; view < 100; view++) {
        const node = pick(...nodes);
        const [screenX, screenY] = pick([0, random(0, 600)], [800, random(0, 600)], [random(0, 800), 0], [random(0, 800), 600]);
        canvas.zoom = Math.exp(random(Math.log(0.1), Math.log(10)));
        canvas.panX = screenX - node.x * canvas.zoom;
        canvas.panY = screenY - node.y * canvas.zoom;

        canvas.render();
        const culled = read();
        context.save();
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.fillStyle = "white";
        context.fillRect(0, 0, 800, 600);
        context.translate(canvas.panX, canvas.panY);
        context.scale(canvas.zoom, canvas.zoom);
        nodes.forEach((each) => each.render(context));
        context.restore();
        const full = read();

        for (let i = 0; i < culled.length; i += 4) {
            const x = (i / 4) % width;
            const y = Math.floor(i / 4 / width);
            const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
            if ((border || !onBorder) && (culled[i] !== full[i] || culled[i + 1] !== full[i + 1] || culled[i + 2] !== full[i + 2])) {
                differences++;
            }
        }
    }
    return differences;
}

describe("Canvas", () => {
    // ======================================================
    it("fills a flex row item at once and shrinks with it", async () => {
        const { app, canvas } = addFlexBoard("row");
        expect([canvas.width, canvas.height]).toEqual([500, 300]);

        app.style.width = "300px";
        await nextFrame();
        expect([canvas.width, canvas.height]).toEqual([200, 300]);
    });

    // ======================================================
    it("fills a flex column item at once and shrinks with it", async () => {
        const { app, canvas } = addFlexBoard("column");
        expect([canvas.width, canvas.height]).toEqual([600, 200]);

        app.style.height = "200px";
        await nextFrame();
        expect([canvas.width, canvas.height]).toEqual([600, 100]);
    });

    // ======================================================
    it("covers every device pixel when its CSS size is fractional", () => {
        // Its device size rounds up, at a pixel ratio of 1 or 2.
        const canvas = addCanvas({ width: 100.8, height: 40.8, background: "white" });
        canvas.render();

        const { width, height } = canvas.canvas;
        expect([...canvas.context.getImageData(width - 1, height - 1, 1, 1).data]).toEqual([255, 255, 255, 255]);
    });

    // ======================================================
    it("renders once per frame, however often requestRender() is called", async () => {
        const canvas = addCanvas();
        const renders = countRenders(canvas);

        canvas.requestRender();
        canvas.requestRender();
        canvas.requestRender();
        await nextFrame();

        expect(renders.count).toBe(1);
    });

    // ======================================================
    it("outlines the selection around its stroke, and not when it's hidden", () => {
        const canvas = addCanvas();
        const rect = new Rectangle({ x: 100, y: 50, width: 100, height: 40, fill: "gold", stroke: "black", strokeWidth: 12 });
        canvas.add(rect);
        canvas.selectionColor = "rgb(0, 0, 255)";
        canvas.selected = rect;

        // The stroke reaches 6 px past x = 100, so the 2 px outline is centred on x = 94.
        canvas.render();
        expect(getPixel(canvas, 94, 70)).toEqual([0, 0, 255, 255]);

        rect.visible = false;
        canvas.render();
        expect(getPixel(canvas, 94, 70)).toEqual([0, 0, 0, 0]);
    });

    // ======================================================
    it("draws resize handles on any outline of a resizable node", () => {
        const canvas = addCanvas();
        const rect = new Rectangle({ x: 100, y: 50, width: 100, height: 40, fill: "gold", resizable: true });
        canvas.add(rect);
        canvas.selected = rect;

        // The top-left handle reaches 4 px past the corner, outside the outline.
        canvas.render();
        expect(getPixel(canvas, 98, 48)).toEqual([255, 255, 255, 255]);

        canvas.selected = null;
        canvas.drawOverlay = () => canvas.drawOutline(rect, "orange");
        canvas.render();
        expect(getPixel(canvas, 98, 48)).toEqual([255, 255, 255, 255]);

        rect.resizable = false;
        canvas.render();
        expect(getPixel(canvas, 98, 48)).toEqual([0, 0, 0, 0]);
    });

    // ======================================================
    it("skips nodes out of view", () => {
        const canvas = addCanvas();
        const inView = new Rectangle({ x: 10, y: 10, width: 50, height: 50 });
        const outOfView = new Rectangle({ x: 1000, y: 10, width: 50, height: 50 });
        canvas.add(inView, outOfView);
        const drawn: Rectangle[] = [];
        for (const node of [inView, outOfView]) {
            const render = node.render.bind(node);
            node.render = (context) => {
                drawn.push(node);
                render(context);
            };
        }

        canvas.render();

        expect(drawn).toEqual([inView]);
    });

    // ======================================================
    it("keeps draw order as layers change and nodes are removed", () => {
        const canvas = addCanvas();
        const below = new Rectangle({ x: 10, y: 10, width: 50, height: 50, fill: "rgb(255, 0, 0)" });
        const above = new Rectangle({ x: 30, y: 30, width: 50, height: 50, fill: "rgb(0, 0, 255)" });
        canvas.add(below, above);

        canvas.render();
        expect(getPixel(canvas, 45, 45)).toEqual([0, 0, 255, 255]);
        expect(canvas.nodeAt({ x: 45, y: 45 })).toBe(above);

        below.layer = 1;
        canvas.render();
        expect(getPixel(canvas, 45, 45)).toEqual([255, 0, 0, 255]);
        expect(canvas.nodeAt({ x: 45, y: 45 })).toBe(below);

        canvas.remove(below);
        canvas.render();
        expect(getPixel(canvas, 45, 45)).toEqual([0, 0, 255, 255]);
        expect(canvas.nodeAt({ x: 45, y: 45 })).toBe(above);
    });

    // ======================================================
    it("brings nodes to the front, each on a layer of its own", () => {
        const canvas = addCanvas();
        const [a, b, c] = [10, 20, 30].map((offset) => new Rectangle({ x: offset, y: offset, width: 50, height: 50 }));
        canvas.add(a, b, c);

        canvas.bringToFront(a);
        expect(canvas.nodeAt({ x: 45, y: 45 })).toBe(a);

        canvas.bringToFront(c, b);
        expect(canvas.nodeAt({ x: 45, y: 45 })).toBe(b);
        expect([a.layer, c.layer, b.layer]).toEqual([1, 2, 3]);
    });

    // ======================================================
    it("stacks nodes alike on two boards that raise them at the same moment", () => {
        const make = () => ["note-1", "note-2"].map((id, i) => new Rectangle({ id, x: 10 + 20 * i, y: 10, width: 50, height: 50 }));
        const [a1, a2] = make();
        const [b1, b2] = make();
        // The boards added the same two nodes in opposite orders.
        const boardA = addCanvas().add(a1, a2);
        const boardB = addCanvas().add(b2, b1);

        // Each raises a different node to the same layer, then receives the other's change.
        boardA.bringToFront(a1);
        boardB.bringToFront(b2);
        a2.layer = b2.layer;
        b1.layer = a1.layer;

        expect(boardA.nodeAt({ x: 45, y: 30 })?.id).toBe("note-2");
        expect(boardB.nodeAt({ x: 45, y: 30 })?.id).toBe("note-2");
    });

    // ======================================================
    it("draws the rest of the board when a node throws, and reports the error", () => {
        const reported = vi.spyOn(window, "reportError").mockImplementation(() => {});
        onTestFinished(() => reported.mockRestore());
        const canvas = addCanvas({ width: 600, height: 200, background: "white" });
        canvas.zoom = 2;
        canvas.panX = 30;
        // The failing node draws first. The rectangle covers x = 50 to 90 on screen.
        canvas.add(
            new FailingNode({ x: 100, y: 10, width: 20, height: 20, layer: -1 }),
            new Rectangle({ x: 10, y: 10, width: 20, height: 20, fill: "rgb(255, 0, 0)" }),
        );

        canvas.render();

        expect(getPixel(canvas, 70, 40)).toEqual([255, 0, 0, 255]);
        expect(reported).toHaveBeenCalledOnce();
        expect(reported).toHaveBeenCalledWith(new Error("Failed to draw"));
    });

    // ======================================================
    it("draws in the right place after the overlay throws", () => {
        const canvas = addCanvas({ width: 600, height: 200, background: "white" });
        canvas.zoom = 2;
        canvas.panX = 130;
        // On screen it covers x = 150 to 190 at panX 130, and x = 50 to 90 at panX 30.
        canvas.add(new Rectangle({ x: 10, y: 10, width: 20, height: 20, fill: "rgb(255, 0, 0)" }));
        canvas.drawOverlay = (context) => {
            context.translate(200, 0);
            throw new Error("Failed to draw the overlay");
        };
        expect(() => canvas.render()).toThrow("Failed to draw the overlay");

        // Panned, so pixels left over from the failed render would show.
        canvas.drawOverlay = null;
        canvas.panX = 30;
        canvas.render();

        expect([getPixel(canvas, 70, 40), getPixel(canvas, 170, 40)]).toEqual([[255, 0, 0, 255], [255, 255, 255, 255]]);
    });

    // ======================================================
    it("draws what drawing every node draws, at any zoom and pan", () => {
        expect(compareWithEveryNodeDrawn()).toBe(0);
    });

    // ======================================================
    it("draws what drawing every node draws, on the outermost pixels too", () => {
        expect(compareWithEveryNodeDrawn({ border: true })).toBe(0);
    });
});
