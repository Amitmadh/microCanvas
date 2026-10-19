# microCanvas

A small TypeScript library for drawing shapes, text and images on an HTML canvas, with layers and hit-testing.

## Usage

```ts
import { Canvas, Rectangle, Circle, McText, McImage } from "microcanvas";

const canvas = new Canvas(document.querySelector("canvas")!);

canvas.add(
    new Rectangle({ x: 40, y: 40, width: 120, height: 80, fill: "tomato" }),
    new Circle({ x: 260, y: 80, radius: 40, fill: null, stroke: "navy", strokeWidth: 4 }),
    new McText({ text: "Hello", x: 40, y: 170, fontSize: 24 }),
    await McImage.load("photo.jpg", { x: 340, y: 40, width: 160, height: 100 }),
);
canvas.render();

canvas.canvas.addEventListener("pointerdown", (event) => {
    const node = canvas.nodeAt(canvas.pointFromEvent(event)); // topmost node, or null
});
```

- Call `canvas.render()` after changing nodes. The canvas only redraws by itself when it resizes.
- Every node has `x`, `y`, `rotation`, `scaleX`, `scaleY`, `opacity`, `visible` and `layer`. Higher layers draw on top.
- Without `width` and `height`, the canvas fills its parent and follows its size, so the parent needs a size of its own.

## Install

Not on npm yet. Build it, then install it into your app from its folder:

```sh
npm install
npm run build
npm install path/to/microCanvas   # in your app
```

## Tests

Visual tests: run `npx serve .` and open `/tests/*.html`.

## License

MIT
