import type { Node } from "./node.js";
import type { Paint } from "./types.js";

export interface GridOptions {
    style?: "lines" | "dots";
    /** Distance between lines or dots, in CSS pixels. */
    size?: number;
    color?: string;
    /** Line width, or dot diameter for the "dots" style, in CSS pixels. */
    lineWidth?: number;
}

export interface CanvasOptions {
    width?: number;
    height?: number;
    background?: Paint | null;
    grid?: boolean | GridOptions;
}

export class Canvas {
    readonly canvas: HTMLCanvasElement;
    readonly context: CanvasRenderingContext2D;
    background: Paint | null;
    grid: boolean | GridOptions;

    private readonly _nodes = new Set<Node>();
    // The nodes in draw order.
    private _sorted: Node[] = [];
    // Set when nodes are added or removed, and by Node when a node's layer changes
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
        grid = false,
    }: CanvasOptions = {}) {
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Could not get a 2D context for this canvas.");
        }

        this.canvas = canvas;
        this.context = context;
        this.background = background;
        this.grid = grid;

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

    add(...nodes: Node[]): this {
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

    remove(...nodes: Node[]): this {
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

        if (this.grid) {
            this._drawGrid(this.grid === true ? {} : this.grid);
        }

        for (const node of this._sortedNodes()) {
            node.render(this.context);
        }
    }

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

    private _sortedNodes(): Node[] {
        // Sorting only after nodes are added or removed, or a layer changes
        if (this._needsSort) {
            this._sorted = [...this._nodes].sort((a, b) => a.layer - b.layer);
            this._needsSort = false;
        }
        return this._sorted;
    }

    private _drawGrid({
        size = 20,
        color = "#F0F0F0",
        style = "lines",
        lineWidth = style === "dots" ? 2 : 1,
    }: GridOptions): void {
        if (size <= 0) {
            return;
        }

        // Draw in device pixels, snapped to whole pixels, so the grid stays
        // sharp at any pixel ratio.
        const ratio = this._pixelRatio;
        const thickness = Math.max(1, Math.round(lineWidth * ratio));
        const snap = (position: number) => Math.round(position * ratio - thickness / 2);

        this.context.save();
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.fillStyle = color;

        if (style === "dots") {
            const radius = thickness / 2;
            this.context.beginPath();
            for (let x = 0; x <= this._width; x += size) {
                for (let y = 0; y <= this._height; y += size) {
                    const centerX = snap(x) + radius;
                    const centerY = snap(y) + radius;
                    this.context.moveTo(centerX + radius, centerY);
                    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
                }
            }
            this.context.fill();
        } else {
            for (let x = 0; x <= this._width; x += size) {
                this.context.fillRect(snap(x), 0, thickness, this.canvas.height);
            }
            for (let y = 0; y <= this._height; y += size) {
                this.context.fillRect(0, snap(y), this.canvas.width, thickness);
            }
        }

        this.context.restore();
    }

    private _fitToParent(parent: HTMLElement): void {
        // An inline canvas leaves a descender gap below it, which would grow an
        // auto-height parent on every resize.
        this.canvas.style.display = "block";
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
