# HEALPix Othello

HEALPix の `NSIDE=2` グリッド上で遊ぶオセロです。球面上の盤面と NESTED 展開図を並べて表示し、展開図からも着手できます。

Play: https://toshiki-ms.github.io/healpix-othello/

## Features

- NSIDE 2 / 48 セルの HEALPix オセロ
- 球面盤面と展開図の同期表示
- 黒白それぞれの PC / NPC 切り替え
- 黒NPC・白NPCごとの難易度設定
- 神の一手ヒント

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

## Deploy

This repository is ready for GitHub Pages via the `gh-pages` branch.

1. Push the repository to GitHub.
2. Open repository settings.
3. Go to Pages.
4. Set the source to the `gh-pages` branch if it is not selected automatically.
5. Push to `main`, or run the `Deploy GitHub Pages` workflow manually.

The workflow builds the Vite app and publishes `dist/` to `gh-pages`.
