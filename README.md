# HEALPix Othello

Othello played on a spherical HEALPix `NSIDE=2` board. The app shows both a 3D sphere and a NESTED unfolded map, and moves can be played from either view.

Play:

- English: https://toshiki-ms.github.io/healpix-othello/?lang=en
- Japanese: https://toshiki-ms.github.io/healpix-othello/?lang=ja

## Features

- HEALPix `NSIDE=2` board with 48 cells
- 3D spherical board with official HEALPix pixel boundaries
- NESTED unfolded map synchronized with the sphere
- Human/NPC toggle for black and white
- Per-side NPC difficulty settings
- God-move hint mode
- English and Japanese UI

## Development

```sh
npm ci
npm run dev
```

Open `http://localhost:4173/`.

## Checks

```sh
npm run test:logic
npm run build
```

## Deployment

This repository is published with GitHub Pages from a GitHub Actions artifact. No `gh-pages` branch is required.

1. Push changes to `main`.
2. The GitHub Actions workflow builds the Vite app.
3. The generated `dist/` output is uploaded as a Pages artifact and deployed.

If Pages is not enabled automatically, open the repository settings, go to Pages, and set the source to GitHub Actions.
