# Third-party notices

The active frontend self-hosts Inter Regular (400) and Bold (700), Copyright 2016 The Inter Project Authors. The font files were obtained from the [Inter official site](https://rsms.me/inter/) on 2026-10-06. The SIL Open Font License 1.1 is retained in `public/fonts/inter/LICENSE.txt`.

Chinese text uses [Chiron Hei HK from Fontsource](https://fontsource.org/fonts/chiron-hei-hk), supplied by `@fontsource-variable/chiron-hei-hk` 5.3.2. Copyright 2025 The Chiron Hei HK Project Authors. Its SIL Open Font License 1.1 is included in the package's `LICENSE` file. The frontend bundles the normal variable font with Unicode subsets and `font-display: swap`; no external font request or synthetic bold is required at runtime. Chinese pages use weight 350 for body text and 600 for headings and emphasis, reduced from 400 and 700. English pages retain their existing 400/700 weights, and Inter continues to render Latin text and numbers. Natural spacing and wrapping are preserved.

The retained legacy welcome assets include a subset of Droid Sans Bold from the Three.js r185 examples, originally Copyright (C) 2008 The Android Open Source Project. Font copyright and Apache License 2.0 notices are retained in `public/fonts/droid/README.txt` and `public/fonts/droid/NOTICE`. The robot and magnifier meshes are original procedural artwork based on this project's existing companion. These assets are no longer loaded by the active frontend.

The pet runtime design was informed by these MIT-licensed browser/React projects. No third-party character artwork is included, and the implementation in this repository is project-specific rather than a verbatim copy.

- [oneko.js](https://github.com/adryd325/oneko.js) — browser animation-loop and viewport-positioning reference.
- [Hermes WebUI Companion](https://github.com/latipun7/hermes-webui-companion) — Agent-state-driven sprite architecture reference.
- [CaYa Desktop Pet](https://github.com/CaYatur/CaYa-Desktop-Pet) — React/TypeScript pet state and settings model reference.

Refer to each linked repository for its MIT license and copyright notices.
