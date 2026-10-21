import seedrandom from "seedrandom";
import { onTestFinished } from "vitest";
import { Canvas, type CanvasOptions } from "../../src/index.js";

/** Adds an empty div to the page, for a test's own layout. It's removed when the test ends. */
export function addContainer(): HTMLElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    onTestFinished(() => div.remove());
    return div;
}

/** Adds a canvas to the page. With {} it fills its parent. */
export function addCanvas(options: CanvasOptions = { width: 600, height: 200 }, parent = addContainer()): Canvas {
    const element = document.createElement("canvas");
    // The browser can't capture the pointers tests make up, so capturing does nothing.
    element.setPointerCapture = () => {};
    parent.appendChild(element);
    const canvas = new Canvas(element, options);
    onTestFinished(() => canvas.destroy());
    return canvas;
}

/** Resolves once the next frame has been drawn. */
export function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** Counts calls to canvas.render() from now on. */
export function countRenders(canvas: Canvas): { count: number } {
    const renders = { count: 0 };
    const render = canvas.render.bind(canvas);
    canvas.render = () => {
        renders.count++;
        render();
    };
    return renders;
}

/** Random numbers from a seed, so a failing test fails the same way every run. */
export function seededRandom(seed: number) {
    const next = seedrandom(String(seed));
    const random = (min = 0, max = 1) => min + next() * (max - min);
    const pick = <T>(...options: T[]): T => options[Math.floor(random(0, options.length))];
    return { random, pick };
}
