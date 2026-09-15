# Mosaic Gallery

A beginner-friendly React + TypeScript + Vite starter for creating browser-based photo mosaics.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The starter lets you choose an image from your computer, preview it as a grid of tiles, and adjust the tile density. The selected image is read locally in the browser and is never uploaded.

## Useful commands

- `npm run dev` starts the Vite development server with hot reload.
- `npm run build` type-checks and creates a production build in `dist/`.
- `npm run lint` checks the source with Oxlint.
- `npm run preview` serves the production build locally.

## Project files

- `index.html` is the single HTML entry point. It sets the page title, theme color, and the root element where React renders.
- `package.json` lists the project scripts and the small set of React, TypeScript, Vite, and Oxlint dependencies.
- `package-lock.json` records the exact dependency versions installed by npm.
- `vite.config.ts` configures Vite's React plugin.
- `tsconfig.json` references the app and Node-specific TypeScript configurations.
- `tsconfig.app.json` contains TypeScript settings for React source files.
- `tsconfig.node.json` contains TypeScript settings for Vite configuration files.
- `.oxlintrc.json` enables the React, TypeScript, and Oxlint rule sets.
- `src/main.tsx` is the JavaScript entry point. It creates the React root and renders `App` in strict mode.
- `src/App.tsx` contains the main mosaic screen, image picker, tile preview, and density slider.
- `src/App.css` contains styles for the mosaic workspace and responsive layout.
- `src/index.css` contains global styles, colors, fonts, and base element rules.
- `src/assets/` is where Vite keeps imported source assets if the app needs them later.
- `public/` contains files copied directly to the built site, including the default favicon and icon sprite.

## Next steps

The current preview uses repeated crops of the selected image as a visual starting point. A future iteration can replace that rendering with a canvas that samples the source image and assigns a different photo or color tile to each cell.
