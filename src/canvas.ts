import {
    MAX_WHEEL_ZOOM_STEP,
    MAX_ZOOM,
    MIN_MOVEMENT_PX,
    MIN_ZOOM,
    SELECTION_COLOR,
    SELECTION_LINE_WIDTH,
    WHEEL_ZOOM_SPEED,
} from "./config.js";
import type { McNode } from "./node.js";
import { Shape } from "./shape.js";
import type { Paint, Point } from "./types.js";

export interface CanvasOptions {
    width?: number;
    height?: number;
    background?: Paint | null;
}

interface Gesture {
    update(): void;
    end?(): void;
}

/**
 * @class Canvas
 * @description Draws nodes on a canvas element. Without both width and
 * height, it fills its parent element and follows its size. Nodes are
 * positioned in board coordinates, which zoom and panX/panY map to screen
 * coordinates: CSS pixels from the canvas's top-left. The user selects nodes
 * by pressing them, drags draggable ones, pans by dragging elsewhere or
 * scrolling, and zooms with a pinch or Ctrl+wheel.
 * @param canvas The canvas element.
 * @param options Width and height in CSS pixels, and the background.
 */
export class Canvas {
    readonly canvas: HTMLCanvasElement;
    readonly context: CanvasRenderingContext2D;
    background: Paint | null;
    zoom = 1;
    panX = 0;
    panY = 0;
    
    selected: McNode | null = null;
    selectionColor: Paint = SELECTION_COLOR;
    /**
     * Called after each render with the context in screen coordinates, to
     * draw other users' selections, cursors and the like.
     */
    drawOverlay: ((context: CanvasRenderingContext2D) => void) | null = null;
    onSelect: ((node: McNode | null) => void) | null = null;
    /** Called after the user moves a node. */
    onChange: ((node: McNode) => void) | null = null;

    private readonly _nodes = new Set<McNode>();
    // The nodes in draw order.
    private _sorted: McNode[] = [];
    /**
     * @internal
     * Set when nodes are added or removed, or a layer changes.
     */
    _needsSort = false;
    private readonly _abortController = new AbortController();
    private _resizeObserver: ResizeObserver | null = null;
    private _width = 0;
    private _height = 0;
    private _pixelRatio = 0;
    // Screen positions of the pressed pointers, by pointer ID.
    private readonly _pointers = new Map<number, Point>();
    // Moving a node, panning or pinching.
    private _gesture: Gesture | null = null;
    private _pendingFrame = 0;

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
        this._watchPointer();
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
     * @description Adds nodes, taking each out of any other canvas.
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
                if (node === this.selected) {
                    this.selected = null;
                }
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

        this.context.save();
        this.context.translate(this.panX, this.panY);
        this.context.scale(this.zoom, this.zoom);
        for (const node of this._sortedNodes()) {
            node.render(this.context);
        }
        this.context.restore();

        if (this.selected) {
            this.drawOutline(this.selected, this.selectionColor);
        }

        if (this.drawOverlay) {
            this.context.save();
            this.drawOverlay(this.context);
            this.context.restore();
        }
    }

    /**
     * @method requestRender
     * @description Renders on the next frame, once however often it's called.
     */
    requestRender(): void {
        if (!this._pendingFrame) {
            this._pendingFrame = requestAnimationFrame(() => {
                this._pendingFrame = 0;
                this.render();
            });
        }
    }

    /**
     * @method drawOutline
     * @description Outlines a node as the selection is outlined, for use in
     * drawOverlay. Hidden nodes get no outline.
     * @param node The node to outline.
     * @param color The outline's colour.
     */
    drawOutline(node: McNode, color: Paint): void {
        if (!node.visible || node.opacity <= 0) {
            return;
        }

        this.context.save();
        this.context.beginPath();
        for (const corner of this._outlineCorners(node)) {
            this.context.lineTo(corner.x, corner.y);
        }
        this.context.closePath();
        this.context.strokeStyle = color;
        this.context.lineWidth = SELECTION_LINE_WIDTH;
        this.context.stroke();
        this.context.restore();
    }

    /**
     * @method pointFromEvent
     * @description Converts an event's position to board coordinates.
     * @param event Anything with clientX and clientY.
     * @returns The point in board coordinates.
     */
    pointFromEvent(event: { clientX: number; clientY: number }): Point {
        return this.screenToBoard(this._screenPoint(event));
    }

    screenToBoard({ x, y }: Point): Point {
        return { x: (x - this.panX) / this.zoom, y: (y - this.panY) / this.zoom };
    }

    boardToScreen({ x, y }: Point): Point {
        return { x: x * this.zoom + this.panX, y: y * this.zoom + this.panY };
    }

    /**
     * @method zoomAt
     * @description Zooms, within MIN_ZOOM and MAX_ZOOM, keeping the board
     * under a screen point in place.
     * @param point The screen point to zoom at.
     * @param zoom The new zoom.
     */
    zoomAt(point: Point, zoom: number): void {
        this._setView(zoom, this.screenToBoard(point), point);
    }

    /**
     * @method nodeAt
     * @description Finds the topmost visible node at a point.
     * @param point The point in board coordinates.
     * @param filter Returns false for nodes to skip.
     * @returns The node, or null.
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
     * @description Sets a fixed size, so it stops following its parent.
     * @param width In CSS pixels.
     * @param height In CSS pixels.
     */
    resize(width: number, height: number): void {
        this._stopFitting();
        this._setSize(width, height);
    }

    destroy(): void {
        this._stopFitting();
        this._abortController.abort();
        cancelAnimationFrame(this._pendingFrame);

        // Unlink nodes, or one kept after this canvas is gone keeps it alive.
        for (const node of this._nodes) {
            node._canvas = null;
        }
        this._nodes.clear();
        this._needsSort = true;
        this.selected = null;
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

    private _outlineCorners(node: McNode): Point[] {
        const { x, y, width, height } = node.getLocalBounds();
        // A stroke reaches half its width outside the bounds.
        let half = 0;
        if (node instanceof Shape && node.stroke) {
            half = node.strokeWidth / 2;
        }
        
        return [
            { x: x - half, y: y - half },
            { x: x + width + half, y: y - half },
            { x: x + width + half, y: y + height + half },
            { x: x - half, y: y + height + half },
        ].map((corner) => this.boardToScreen(node.localToBoard(corner)));
    }

    private _fitToParent(parent: HTMLElement): void {
        // Block, so a parent's text-align doesn't shift the canvas.
        this.canvas.style.display = "block";
        this.canvas.style.position = "absolute";
        this._resizeObserver = new ResizeObserver(([entry]) => {
            this._setSize(entry.contentRect.width, entry.contentRect.height);
        });
        this._setSize(parent.clientWidth, parent.clientHeight);
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

    private _watchPointer(): void {
        // The canvas handles every touch itself.
        this.canvas.style.touchAction = "none";

        this._listen<PointerEvent>(this.canvas, "pointerdown", (event) => {
            if (event.button !== 0 || this._pointers.size === 2) {
                return;
            }

            this._pointers.set(event.pointerId, this._screenPoint(event));
            this.canvas.setPointerCapture(event.pointerId);
            this._gesture?.end?.();
            this._gesture = this._pointers.size === 2 ? this._pinch() : this._press();
            this.requestRender();
        });

        this._listen<PointerEvent>(this.canvas, "pointermove", (event) => {
            if (this._pointers.has(event.pointerId)) {
                this._pointers.set(event.pointerId, this._screenPoint(event));
                this._gesture?.update();
                this.requestRender();
            }
        });

        // Fires when the pointer is released or cancelled.
        this._listen<PointerEvent>(this.canvas, "lostpointercapture", (event) => {
            if (this._pointers.delete(event.pointerId)) {
                this._gesture?.end?.();
                this._gesture = this._pointers.size === 1 ? this._pan() : null;
            }
        });

        this._listen<WheelEvent>(this.canvas, "wheel", (event) => {
            event.preventDefault();
            // Trackpad pinches arrive as wheel events with ctrlKey set.
            if (event.ctrlKey) {
                const step = event.deltaY * WHEEL_ZOOM_SPEED;
                const capped = Math.max(-MAX_WHEEL_ZOOM_STEP, Math.min(MAX_WHEEL_ZOOM_STEP, step));
                this.zoomAt(this._screenPoint(event), this.zoom * Math.exp(-capped));
            } else {
                this.panX -= event.deltaX;
                this.panY -= event.deltaY;
            }
            this.requestRender();
        }, { passive: false });
    }

    private _press(): Gesture {
        const [screenPoint] = this._pointers.values();
        const point = this.screenToBoard(screenPoint);
        const pressed = this.nodeAt(point, (node) => node.selectable);
        if (pressed !== this.selected) {
            this.selected = pressed;
            this.onSelect?.(pressed);
        }
        return pressed?.draggable ? this._moveNode(pressed, point) : this._pan();
    }

    private _moveNode(node: McNode, from: Point): Gesture {
        const [start] = this._pointers.values();
        const offsetX = node.x - from.x;
        const offsetY = node.y - from.y;
        let moved = false;
        return {
            update: () => {
                const [screenPoint] = this._pointers.values();
                if (!moved && Math.abs(screenPoint.x - start.x) + Math.abs(screenPoint.y - start.y) < MIN_MOVEMENT_PX) {
                    return;
                }
                moved = true;
                const to = this.screenToBoard(screenPoint);
                node.x = to.x + offsetX;
                node.y = to.y + offsetY;
                this.onChange?.(node);
            },
            end: () => {
                if (moved && node === this.selected) {
                    this.onChange?.(node);
                }
            },
        };
    }

    private _pan(): Gesture {
        const [screenPoint] = this._pointers.values();
        const boardPoint = this.screenToBoard(screenPoint);
        return {
            update: () => {
                const [to] = this._pointers.values();
                this._setView(this.zoom, boardPoint, to);
            },
        };
    }

    private _pinch(): Gesture {
        const span = () => {
            const [a, b] = this._pointers.values();
            return {
                distance: Math.hypot(b.x - a.x, b.y - a.y),
                center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            };
        };
        const start = span();
        const startZoomDivDist = this.zoom / start.distance
        const boardPoint = this.screenToBoard(start.center);
        return {
            update: () => {
                const { distance, center } = span();
                this._setView(startZoomDivDist * distance, boardPoint, center);
            },
        };
    }

    private _screenPoint(event: { clientX: number; clientY: number }): Point {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left - this.canvas.clientLeft,
            y: event.clientY - rect.top - this.canvas.clientTop,
        };
    }

    private _setView(zoom: number, boardPoint: Point, screenPoint: Point): void {
        if (!Number.isFinite(zoom)) {
            return;
        }
        this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
        this.panX = screenPoint.x - boardPoint.x * this.zoom;
        this.panY = screenPoint.y - boardPoint.y * this.zoom;
    }

    private _setSize(width: number, height: number): void {
        const pixelRatio = window.devicePixelRatio;
        if (width === this._width && height === this._height &&
             pixelRatio === this._pixelRatio) {
            return;
        }

        this._width = width;
        this._height = height;
        this._pixelRatio = pixelRatio;

        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.width = Math.round(width * pixelRatio);
        this.canvas.height = Math.round(height * pixelRatio);
        // Resizing resets the context, so the scale is reapplied.
        this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        // Resizing also clears the canvas.
        this.render();
    }
}
