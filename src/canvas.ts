import type { McNode } from "./node.js";
import type { Paint, Point } from "./types.js";

export interface CanvasOptions {
    width?: number;
    height?: number;
    background?: Paint | null;
}

/**
 * @class Canvas
 * @description A canvas element that nodes are drawn on. Sizes are in CSS
 * pixels, and drawing stays sharp at any pixel ratio. It gets a fixed size
 * if both width and height are passed. Otherwise it fills its parent element
 * and follows its size, or keeps its current size if it has no parent.
 * @param canvas The canvas element to draw on.
 * @param options Width and height in CSS pixels, and the background.
 */
export class Canvas {
    readonly canvas: HTMLCanvasElement;
    readonly context: CanvasRenderingContext2D;
    background: Paint | null;

    private readonly _nodes = new Set<McNode>();
    // The nodes in draw order.
    private _sorted: McNode[] = [];
    // Set when nodes are added or removed, and by McNode when a node's layer changes
    _needsSort = false;
    private readonly _abortController = new AbortController();
    private _resizeObserver: ResizeObserver | null = null;
    private _width = 0;
    private _height = 0;
    private _pixelRatio = 0;

    constructor(canvas: HTMLCanvasElement, {
        width,
        height,
        background = null,
    }: CanvasOptions = {}) {
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Could not get a 2D context for this canvas.");
        }

        this.canvas = canvas;
        this.context = context;
        this.background = background;

        if (width !== undefined && height !== undefined) {
            this._setSize(width, height);
        } else if (canvas.parentElement) {
            this._fitToParent(canvas.parentElement);
        } else {
            this._setSize(canvas.width, canvas.height);
        }

        this._watchPixelRatio();
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    get pixelRatio(): number {
        return this._pixelRatio;
    }

    /**
     * @method add
     * @description Adds nodes to the canvas. A node can be in one canvas at a
     * time, so this takes it out of any other.
     * @param nodes The nodes to add.
     * @returns The canvas, for chaining.
     */
    add(...nodes: McNode[]): this {
        for (const node of nodes) {
            if (node._canvas !== this) {
                node._canvas?.remove(node);
                node._canvas = this;
                this._nodes.add(node);
            }
        }
        this._needsSort = true;
        return this;
    }

    remove(...nodes: McNode[]): this {
        for (const node of nodes) {
            if (node._canvas === this) {
                node._canvas = null;
                this._nodes.delete(node);
            }
        }
        this._needsSort = true;
        return this;
    }

    render(): void {
        this.context.clearRect(0, 0, this._width, this._height);

        if (this.background) {
            this.context.save();
            this.context.fillStyle = this.background;
            this.context.fillRect(0, 0, this._width, this._height);
            this.context.restore();
        }

        for (const node of this._sortedNodes()) {
            node.render(this.context);
        }
    }

    /**
     * @method pointFromEvent
     * @description Converts a mouse, pointer or touch event's position to
     * canvas coordinates, the space nodes are positioned in.
     * @param event The event, or anything with clientX and clientY.
     * @returns The point in canvas coordinates.
     */
    pointFromEvent(event: { clientX: number; clientY: number }): Point {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left - this.canvas.clientLeft,
            y: event.clientY - rect.top - this.canvas.clientTop,
        };
    }

    /**
     * @method nodeAt
     * @description Finds the topmost node at a point in canvas coordinates.
     * Nodes that render() skips are skipped here too, and so are nodes the
     * filter rejects, which lets it look through overlays such as a selection
     * outline.
     * @param point The point in canvas coordinates.
     * @param filter Returns false for nodes to look through.
     * @returns The topmost node, or null if there is none.
     */
    nodeAt(point: Point, filter?: (node: McNode) => boolean): McNode | null {
        const nodes = this._sortedNodes();
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            if (!node.visible || node.opacity <= 0 || (filter && !filter(node))) {
                continue;
            }
            if (node.containsPoint(point)) {
                return node;
            }
        }
        return null;
    }

    /**
     * @method resize
     * @description Gives the canvas a fixed size, so it stops following its
     * parent's size.
     * @param width The new width in CSS pixels.
     * @param height The new height in CSS pixels.
     */
    resize(width: number, height: number): void {
        this._stopFitting();
        this._setSize(width, height);
    }

    destroy(): void {
        this._stopFitting();
        this._abortController.abort();

        // Nodes link back to their canvas, so unlink them, or a node that's kept
        // after this canvas is gone would keep it alive.
        for (const node of this._nodes) {
            node._canvas = null;
        }
        this._nodes.clear();
        this._needsSort = true;
    }

    private _listen<E extends Event>(
        target: EventTarget,
        type: string,
        listener: (event: E) => void,
        options: AddEventListenerOptions = {},
    ): void {
        target.addEventListener(type, listener as EventListener, {
            ...options,
            signal: this._abortController.signal,
        });
    }

    private _sortedNodes(): McNode[] {
        if (this._needsSort) {
            this._sorted = [...this._nodes].sort((a, b) => a.layer - b.layer);
            this._needsSort = false;
        }
        return this._sorted;
    }

    private _fitToParent(parent: HTMLElement): void {
        // An inline canvas leaves a descender gap below it, which would grow an
        // auto-height parent on every resize.
        this.canvas.style.display = "block";
        this.canvas.style.position = "absolute";
        this._resizeObserver = new ResizeObserver(([entry]) => {
            this._setSize(entry.contentRect.width, entry.contentRect.height);
        });
        this._resizeObserver.observe(parent);
    }

    private _stopFitting(): void {
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
    }

    private _watchPixelRatio(): void {
        const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        this._listen(query, "change", () => {
            this._setSize(this._width, this._height);
            this._watchPixelRatio();
        }, { once: true });
    }

    private _setSize(width: number, height: number): void {
        const pixelRatio = window.devicePixelRatio;
        if (width === this._width && height === this._height && pixelRatio === this._pixelRatio) {
            return;
        }

        this._width = width;
        this._height = height;
        this._pixelRatio = pixelRatio;

        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.width = Math.round(width * pixelRatio);
        this.canvas.height = Math.round(height * pixelRatio);
        // Resizing the backing store resets the context state, so the scale
        // has to be reapplied every time.
        this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        // Resizing also clears the canvas, so the nodes are redrawn right away.
        this.render();
    }
}
