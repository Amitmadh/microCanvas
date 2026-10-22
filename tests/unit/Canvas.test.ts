import { describe, expect, it } from "vitest";
import { Circle, McText, Rectangle, type Canvas } from "../../src/index.js";
import { addCanvas, addContainer, countRenders, nextFrame, seededRandom } from "./test-utils.js";

// The RGBA of the canvas pixel at a point in CSS pixels.
function getPixel(canvas: Canvas, x: number, y: number): number[] {
    const ratio = canvas.pixelRatio;
    return [...canvas.context.getImageData(Math.floor(x * ratio), Math.floor(y * ratio), 1, 1).data];
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
    it("draws what drawing every node draws, at any zoom and pan", () => {
        expect(compareWithEveryNodeDrawn()).toBe(0);
    });

    // ======================================================
    it("draws what drawing every node draws, on the outermost pixels too", () => {
        expect(compareWithEveryNodeDrawn({ border: true })).toBe(0);
    });
});
