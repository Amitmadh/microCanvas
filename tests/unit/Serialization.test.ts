import { describe, expect, it, vi } from "vitest";
import { Circle, McImage, McText, Rectangle, type Canvas, type CanvasJSON, type McNode } from "../../src/index.js";
import { addCanvas } from "./test-utils.js";

// A red 20 × 20 picture.
function redImageURL(): string {
    const source = document.createElement("canvas");
    source.width = source.height = 20;
    const context = source.getContext("2d")!;
    context.fillStyle = "red";
    context.fillRect(0, 0, 20, 20);
    return source.toDataURL();
}

// A board with one of each node, none left at its defaults.
async function addBoard(): Promise<Canvas> {
    const canvas = addCanvas({ width: 600, height: 200, background: "ivory" });
    canvas.add(
        new Rectangle({
            id: "rect", x: 20, y: 90, width: 120, height: -60, rotation: 0.3, scaleX: 1.5, opacity: 0.8, layer: 2,
            fill: null, stroke: "navy", strokeWidth: 6, draggable: true, resizable: true,
        }),
        new Circle({ id: "circle", x: 250, y: 100, radius: 40, scaleY: 0.5, layer: -1, fill: "tomato", selectable: true }),
        new McText({
            id: "text", text: "שלום", x: 400, y: 60, fontSize: 30, fontFamily: "serif", fontWeight: 700,
            fontStyle: "italic", fill: "slateblue", align: "center", baseline: "top", direction: "rtl",
        }),
        await McImage.load(redImageURL(), { id: "image", x: 480, y: 120, width: 80, height: 40 }),
        new Rectangle({ id: "hidden", x: 0, y: 0, width: 10, height: 10, visible: false }),
    );
    return canvas;
}

describe("Serialization", () => {
    // ======================================================
    it("loads every node and the background that toJSON() saved, through JSON", async () => {
        const saved = await addBoard();
        const loaded = addCanvas();

        loaded.fromJSON(JSON.parse(JSON.stringify(saved)));

        expect(loaded.toJSON()).toEqual(saved.toJSON());
    });

    // ======================================================
    it("draws a loaded board as the saved one, once its images load", async () => {
        const saved = await addBoard();
        const loaded = addCanvas();

        loaded.fromJSON(JSON.parse(JSON.stringify(saved)));
        // An image can be hit once it has loaded.
        await vi.waitFor(() => expect(loaded.nodeAt({ x: 520, y: 140 })).toBeInstanceOf(McImage));
        saved.render();
        loaded.render();

        expect(loaded.canvas.toDataURL()).toBe(saved.canvas.toDataURL());
    });

    // ======================================================
    it("replaces the nodes it had, and drops the selection", () => {
        const canvas = addCanvas();
        const old = new Rectangle({ x: 10, y: 10, width: 50, height: 50 });
        canvas.add(old);
        canvas.selected = old;
        const selections: (McNode | null)[] = [];
        canvas.onSelect = (node) => selections.push(node);

        canvas.fromJSON({ background: null, nodes: [new Circle({ x: 100, y: 100, radius: 20 }).toJSON()] });

        expect(canvas.nodeAt({ x: 30, y: 30 })).toBeNull();
        expect(canvas.nodeAt({ x: 100, y: 100 })).toBeInstanceOf(Circle);
        expect(canvas.selected).toBeNull();
        expect(selections).toEqual([null]);
    });

    // ======================================================
    it("skips node types it doesn't know, such as a later version's", () => {
        const canvas = addCanvas();
        canvas.add(new Rectangle({ id: "old", x: 0, y: 0, width: 50, height: 50 }));
        const saved = {
            background: null,
            nodes: [
                new Rectangle({ id: "rect", x: 10, y: 10, width: 20, height: 20 }).toJSON(),
                { type: "line", id: "line", x: 0, y: 0 },
                new Circle({ id: "circle", x: 100, y: 100, radius: 10 }).toJSON(),
            ],
        };

        canvas.fromJSON(saved as unknown as CanvasJSON);

        expect(canvas.toJSON().nodes.map((node) => node.id).sort()).toEqual(["circle", "rect"]);
    });

    // ======================================================
    it("keeps its board when the saved one can't be read", () => {
        const canvas = addCanvas();
        const old = new Rectangle({ x: 10, y: 10, width: 50, height: 50 });
        canvas.add(old);

        expect(() => canvas.fromJSON({ background: "red", nodes: null } as unknown as CanvasJSON)).toThrow();

        expect(canvas.background).toBeNull();
        expect(canvas.nodeAt({ x: 30, y: 30 })).toBe(old);
    });
});
