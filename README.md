# Refract

Refract is a light tracing puzzle played on a dark optical bench. Draw a beam from one emitter to the other, thread every matching lens, and spend each crystal's charge exactly once. The board accepts only legal links, so you can explore routes by dragging from node to node.

Play the fixed 24-board Campaign or keep climbing through generated Cascade boards. The interface supports mouse, pen, touch, and keyboard.

## Install and run

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To produce the static production site:

```sh
npm run build
```

The complete site is written to `dist/` and can be served from any static file server.

## Controls

- Drag from an emitter or an existing beam to trace or edit a route.
- Arrow keys or WASD navigate menus; Enter or Space confirms.
- Escape goes back, R clears the current board, and M toggles sound.
