# HEALPix Games

Board games on spherical HEALPix grids.

Play:

- Home: https://toshiki-ms.github.io/healpix-game/
- Othello: https://toshiki-ms.github.io/healpix-game/othello.html
- Go: https://toshiki-ms.github.io/healpix-game/go.html

## Games

### HEALPix Othello

- HEALPix `NSIDE=2` board with 48 cells
- 3D spherical board with HEALPix pixel boundaries
- NESTED unfolded map synchronized with the sphere
- Human/NPC toggle for black and white
- Per-side NPC difficulty settings
- God-move hint mode
- NEST/RING index overlays
- English and Japanese UI

### HEALPix Go

- Stones are placed on HEALPix pixel vertices
- HEALPix `NSIDE=2` and `NSIDE=4` boards
- Polar vertices are neutral holes
- Captures, suicide check, superko-like position history
- Territory scoring with dead-stone marking
- Human/NPC toggle for black and white
- Per-side NPC difficulty settings
- God-move hint mode
- Vertex-index and move-order overlays
- English and Japanese UI

## Development

```sh
npm ci
npm run dev
```

Open `http://localhost:4173/`.

Pages:

- `index.html`: game selector
- `othello.html`: HEALPix Othello
- `go.html`: HEALPix Go

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
