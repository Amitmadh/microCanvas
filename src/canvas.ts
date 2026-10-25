import { Circle, type CircleJSON } from "./circle.js";
import {
    MAX_WHEEL_ZOOM_STEP,
    MAX_ZOOM,
    MIN_MOVEMENT_PX,
    MIN_ZOOM,
    RESIZE_HANDLE_FILL,
    RESIZE_HANDLE_LINE_WIDTH,
    RESIZE_HANDLE_SIZE,
    SELECTION_COLOR,
    SELECTION_LINE_WIDTH,
    WHEEL_ZOOM_SPEED,
} from "./config.js";
import { McImage, type McImageJSON } from "./image.js";
import type { McNode } from "./node.js";
import { Rectangle, type RectangleJSON } from "./rectangle.js";
import { Shape } from "./shape.js";
import { TextEditor } from "./text-editor.js";
import { McText, type McTextJSON } from "./text.js";
import type { Paint, Point, Rect } from "./types.js";
import { clamp, distance, midpoint, rectCorners, rectsOverlap } from "./util.js";

export interface CanvasOptions {
    width?: number;
    height?: number;
    background?: Paint | null;
}

export type McNodeJSON = RectangleJSON | CircleJSON | McTextJSON | McImageJSON;

export interface CanvasJSON {
    background: Paint | null;
    nodes: McNodeJSON[];
}

interface Gesture {
    update(): void;
    end?(): void;
}

/**
 * Draws nodes on a canvas element. Without both width and
 * height, it fills its parent element and follows its size. Nodes are
 * positioned in board coordinates, which zoom and panX/panY map to screen
 * coordinates: CSS pixels from the canvas's top-left. The user selects nodes
 * by pressing them, drags draggable ones, resizes resizable ones by the
 * corners of the selection, pans by dragging elsewhere or scrolling, and
 * zooms with a pinch or Ctrl+wheel. Double-clicking a writable text edits it
 * in place, until Escape or a press elsewhere; Enter adds a line.
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
     * draw more outlines, cursors and the like on top.
     */
    drawOverlay: ((context: CanvasRenderingContext2D) => void) | null = null;
    onSelect: ((node: McNode | null) => void) | null = null;
    /** Called once the user finishes moving, resizing or editing a node. */
    onChange: ((node: McNode) => void) | null = null;
    /** Called while the user moves, resizes or edits a node. */
    whileChange: ((node: McNode) => void) | null = null;

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
    // Moving or resizing a node, panning or pinching.
    private _gesture: Gesture | null = null;
    private _pendingFrame = 0;
    // Open while the user edits a text.
    private _editor: TextEditor | null = null;

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
     * Adds nodes, taking each out of any other canvas.
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
                if (node === this._editor?.node) {
                    this._stopEditing();
                }
                if (node === this.selected) {
                    this.selected = null;
                    this.onSelect?.(null);
                }
            }
        }
        this._needsSort = true;
        return this;
    }

    /**
     * Puts each node on a new layer above the topmost one.
     * @param nodes The nodes to raise, lowest first.
     * @returns The canvas, for chaining.
     */
    bringToFront(...nodes: McNode[]): this {
        const sorted = this._sortedNodes();
        let top = sorted.length > 0 ? sorted[sorted.length - 1].layer : 0;
        for (const node of nodes) {
            top += 1;
            node.layer = top;
        }
        return this;
    }

    /** The background and nodes, without the view or selection. */
    toJSON(): CanvasJSON {
        return {
            background: this.background,
            nodes: this._sortedNodes().map((node) => node.toJSON() as McNodeJSON),
        };
    }

    /**
     * Replaces the background and every node with saved ones.
     * Nodes of unknown type are skipped.
     * @param json What toJSON() returned.
     */
    fromJSON({ background, nodes }: CanvasJSON): void {
        const loaded = nodes.map(nodeFromJSON).filter((node) => node !== null);
        this.remove(...this._nodes);
        this.background = background;
        this.add(...loaded);
    }

    render(): void {
        this.context.clearRect(0, 0, this._width, this._height);

        if (this.background) {
            this.context.save();
            this.context.fillStyle = this.background;
            this.context.fillRect(0, 0, this._width, this._height);
            this.context.restore();
        }

        // Only nodes overlapping the visible part of the board are drawn. It's
        // padded by a screen pixel, as a thin stroke is painted past its box.
        const pad = 1 / this.zoom;
        const view = {
            x: -this.panX / this.zoom - pad,
            y: -this.panY / this.zoom - pad,
            width: this._width / this.zoom + 2 * pad,
            height: this._height / this.zoom + 2 * pad,
        };
        this.context.save();
        this.context.translate(this.panX, this.panY);
        this.context.scale(this.zoom, this.zoom);
        for (const node of this._sortedNodes()) {
            try {
                if (rectsOverlap(this._boardRect(node), view)) {
                    node.render(this.context);
                }
            } catch (error) {
                reportError(error);
            }
        }
        this.context.restore();

        // Text drawn in a fallback font is drawn again once its web font loads.
        if (document.fonts.status === "loading") {
            document.fonts.ready.then(() => {
                if (!this._abortController.signal.aborted) {
                    this.requestRender();
                }
            });
        }

        if (this.selected) {
            this.drawOutline(this.selected, this.selectionColor);
        }
        this._editor?.place();

        if (this.drawOverlay) {
            this.context.save();
            try {
                this.drawOverlay(this.context);
            } finally {
                this.context.restore();
            }
        }
    }

    /**
     * Renders on the next frame, once however often it's called.
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
     * Outlines a node as the selection is outlined, with resize
     * handles if it's resizable, for use in drawOverlay. Hidden nodes get no
     * outline.
     * @param node The node to outline.
     * @param color The outline's colour.
     */
    drawOutline(node: McNode, color: Paint): void {
        if (!node.visible || node.opacity <= 0) {
            return;
        }

        const corners = this._outlineCorners(node);
        this.context.save();
        this.context.beginPath();
        for (const corner of corners) {
            this.context.lineTo(corner.x, corner.y);
        }
        this.context.closePath();
        this.context.strokeStyle = color;
        this.context.lineWidth = SELECTION_LINE_WIDTH;
        this.context.stroke();

        if (node.resizable) {
            const half = RESIZE_HANDLE_SIZE / 2;
            this.context.fillStyle = RESIZE_HANDLE_FILL;
            this.context.lineWidth = RESIZE_HANDLE_LINE_WIDTH;
            for (const { x, y } of corners) {
                this.context.fillRect(x - half, y - half, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
                this.context.strokeRect(x - half, y - half, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
            }
        }
        this.context.restore();
    }

    /**
     * Converts an event's position to board coordinates.
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
     * Zooms, within MIN_ZOOM and MAX_ZOOM, keeping the board
     * under a screen point in place.
     * @param point The screen point to zoom at.
     * @param zoom The new zoom.
     */
    zoomAt(point: Point, zoom: number): void {
        this._setView(zoom, this.screenToBoard(point), point);
    }

    /**
     * Finds the topmost visible node at a point.
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
     * Sets a fixed size, so it stops following its parent.
     * @param width In CSS pixels.
     * @param height In CSS pixels.
     */
    resize(width: number, height: number): void {
        this._stopFitting();
        this._setSize(width, height);
    }

    destroy(): void {
        this._stopEditing();
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
            // Ties go by id, the same way on every board.
            this._sorted = [...this._nodes].sort((a, b) =>
                a.layer - b.layer || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            this._needsSort = false;
        }
        return this._sorted;
    }

    private _outlineCorners(node: McNode): Point[] {
        return rectCorners(this._strokedBounds(node)).map((corner) => this.boardToScreen(node.localToBoard(corner)));
    }

    private _resizableSelection(): McNode | null {
        const node = this.selected;
        return node?.resizable && node.visible && node.opacity > 0 ? node : null;
    }

    private _strokedBounds(node: McNode): Rect {
        const { x, y, width, height } = node.getLocalBounds();
        // A stroke reaches half its width outside the bounds.
        const half = node instanceof Shape && node.stroke ? node.strokeWidth / 2 : 0;
        return { x: x - half, y: y - half, width: width + 2 * half, height: height + 2 * half };
    }

    // The node's box on the board, along the board's axes.
    private _boardRect(node: McNode): Rect {
        const bounds = this._strokedBounds(node);
        const cos = Math.cos(node.rotation);
        const sin = Math.sin(node.rotation);

        // Where the box's centre lands on the board, as localToBoard() would put it.
        const localX = (bounds.x + bounds.width / 2) * node.scaleX;
        const localY = (bounds.y + bounds.height / 2) * node.scaleY;
        const centerX = node.x + localX * cos - localY * sin;
        const centerY = node.y + localX * sin + localY * cos;

        const scaledWidth = Math.abs(bounds.width * node.scaleX);
        const scaledHeight = Math.abs(bounds.height * node.scaleY);
        // A box turned by an angle needs this much room along each axis.
        const width = scaledWidth * Math.abs(cos) + scaledHeight * Math.abs(sin);
        const height = scaledWidth * Math.abs(sin) + scaledHeight * Math.abs(cos);

        return { x: centerX - width / 2, y: centerY - height / 2, width, height };
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
            this._stopEditing();
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
                const capped = clamp(step, -MAX_WHEEL_ZOOM_STEP, MAX_WHEEL_ZOOM_STEP);
                this.zoomAt(this._screenPoint(event), this.zoom * Math.exp(-capped));
            } else {
                this.panX -= event.deltaX;
                this.panY -= event.deltaY;
            }
            this.requestRender();
        }, { passive: false });

        this._listen<MouseEvent>(this.canvas, "dblclick", (event) => {
            const node = this.nodeAt(this.pointFromEvent(event));
            if (node instanceof McText && node.writable) {
                this._edit(node);
            }
        });
    }

    private _edit(node: McText): void {
        this._stopEditing();
        this._editor = new TextEditor(this, node, () => this._stopEditing());
        this.requestRender();
    }

    private _stopEditing(): void {
        const editor = this._editor;
        this._editor = null;
        editor?.close();
    }

    private _press(): Gesture {
        const [screenPoint] = this._pointers.values();
        const resizable = this._resizableSelection();
        if (resizable) {
            const handle = this._outlineCorners(resizable).findIndex((corner) =>
                Math.abs(corner.x - screenPoint.x) <= RESIZE_HANDLE_SIZE
                && Math.abs(corner.y - screenPoint.y) <= RESIZE_HANDLE_SIZE);
            if (handle >= 0) {
                return this._resizeNode(resizable, handle);
            }
        }

        const point = this.screenToBoard(screenPoint);
        const pressed = this.nodeAt(point, (node) => node.selectable || node.draggable || node.resizable);
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
                if (node !== this.selected) {
                    return;
                }
                const [screenPoint] = this._pointers.values();
                if (!moved && distance(start, screenPoint) < MIN_MOVEMENT_PX) {
                    return;
                }
                moved = true;
                const to = this.screenToBoard(screenPoint);
                node.x = to.x + offsetX;
                node.y = to.y + offsetY;
                this.whileChange?.(node);
            },
            end: () => {
                if (moved && node === this.selected) {
                    this.onChange?.(node);
                }
            },
        };
    }

    private _resizeNode(node: McNode, handle: number): Gesture {
        const [start] = this._pointers.values();
        const corners = rectCorners(node.getLocalBounds());
        // Opposite corner from handle.
        const anchor = node.localToBoard(corners[(handle + 2) % 4]);

        const pressed = node.boardToLocal(this.screenToBoard(start));
        const offsetX = corners[handle].x - pressed.x;
        const offsetY = corners[handle].y - pressed.y;

        const directionX = handle === 1 || handle === 2 ? 1 : -1;
        const directionY = handle >= 2 ? 1 : -1;
        let resized = false;
        return {
            update: () => {
                if (node !== this.selected) {
                    return;
                }
                const [screenPoint] = this._pointers.values();
                if (!resized && distance(start, screenPoint) < MIN_MOVEMENT_PX) {
                    return;
                }
                resized = true;
                const from = node.boardToLocal(anchor);
                const to = node.boardToLocal(this.screenToBoard(screenPoint));
                // It can't be flipped, or made smaller than a handle on screen.
                const width = Math.max((to.x + offsetX - from.x) * directionX, RESIZE_HANDLE_SIZE / Math.abs(this.zoom * node.scaleX));
                const height = Math.max((to.y + offsetY - from.y) * directionY, RESIZE_HANDLE_SIZE / Math.abs(this.zoom * node.scaleY));
                node.resize(from, { x: from.x + directionX * width, y: from.y + directionY * height });
                this.whileChange?.(node);
            },
            end: () => {
                if (resized && node === this.selected) {
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
        const [a, b] = this._pointers.values();
        const startZoomDivDist = this.zoom / distance(a, b);
        const boardPoint = this.screenToBoard(midpoint(a, b));
        return {
            update: () => {
                const [a, b] = this._pointers.values();
                this._setView(startZoomDivDist * distance(a, b), boardPoint, midpoint(a, b));
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
        this.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
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

function nodeFromJSON(json: McNodeJSON): McNode | null {
    switch (json.type) {
        case "rectangle":
            return new Rectangle(json);
        case "circle":
            return new Circle(json);
        case "text":
            return new McText(json);
        case "image": {
            const { src, ...options } = json;
            const image = document.createElement("img");
            image.src = src;
            return new McImage({ ...options, image });
        }
        default:
            return null;
    }
}
