# HEALPix Games

Board games on spherical HEALPix grids.

Play:

- Home: https://toshiki-ms.github.io/healpix-game/
- Othello: https://toshiki-ms.github.io/healpix-game/othello.html
- Go: https://toshiki-ms.github.io/healpix-game/go.html
- Asteroid Garden: https://toshiki-ms.github.io/healpix-game/asteroid.html

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

### HEALPix Asteroid Garden

- Small spherical asteroid care game on HEALPix cells
- Asteroid and Earth presets with selectable HEALPix resolution up to `NSIDE=64` in the public web build
- RBF-FD-based water, nutrient, and vegetation transport on the HEALPix sphere
- Baobab, rose, volcano ash, soil water, groundwater, sunlight, and carbon diagnostics
- Earth terrain and climate are sampled from gridded reference data

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
- `asteroid.html`: HEALPix Asteroid Garden

The public web build ships precomputed RBF-FD operator assets through `NSIDE=64`.
For local high-resolution experiments, generate additional operator and land-mask
assets after cloning:

```sh
npm run generate:rbf-fd -- 128 256
npm run generate:earth-land -- 128 256
```

## Checks

```sh
npm run test:logic
npm run test:native-sim
npm run test:asteroid-balance
npm run build
```

## License

This project is licensed under the BSD 2-Clause License. See [LICENSE](./LICENSE).

The original HEALPix software package is a separate project and is not included in this repository.

## Data Sources

- [NOAA NGDC ETOPO1](https://www.ncei.noaa.gov/products/etopo-global-relief-model) for Earth elevation sampled to a 1 degree grid and derived land/ocean masks.
- [WorldClim 2.1](https://www.worldclim.org/data/worldclim21.html) [BIO1, BIO2, and BIO12](https://www.worldclim.org/data/bioclim.html) for Earth annual mean temperature, mean diurnal temperature range, and land precipitation sampled to a 1 degree grid.
- ERA5 monthly total cloud cover is used as a low-resolution cloud reference for Earth cloud display. Ocean precipitation and cells missing WorldClim data currently use analytic climatology.

## Deployment

This repository is published with GitHub Pages from a GitHub Actions artifact. No `gh-pages` branch is required.

The asteroid simulation uses threaded WASM only when the page is cross-origin isolated
(`SharedArrayBuffer` + COOP/COEP). Local Vite development serves those headers. Static
hosts that cannot serve them, including the default GitHub Pages path, run the same
WASM simulation in serial mode.

1. Push changes to `main`, or to `feature/asteroid` while the asteroid garden work is being reviewed.
2. The GitHub Actions workflow builds the Vite app.
3. The generated `dist/` output is uploaded as a Pages artifact and deployed.

If Pages is not enabled automatically, open the repository settings, go to Pages, and set the source to GitHub Actions.
