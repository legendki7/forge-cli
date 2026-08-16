# ForgeKi brand assets

`forgeki-mark.png` is the transparent canonical UI mark derived from the official supplied source
`ChatGPT Image Aug 4, 2026, 03_12_50 PM.svg`. Its three intentional connected forms—the blue ForgeKi
mark, terminal chevron, and underscore—are preserved. Sparse disconnected tracing debris outside the
official mark was removed and the result was centered with safe transparent padding.

`forgeki-app-icon.png` places the unchanged mark on a dark neutral tile so its white terminal glyph
remains visible against both light and dark operating-system surfaces. Tauri's icon generator derives
the committed native PNG, ICO, ICNS, and Windows tile resources from this 1024×1024 source.

The palette sampled from the source is centralized in `src/styles.css`:

- Logo blue: `#4088f8`
- Secondary blue: `#3898e8`
- Cyan accent: `#38c0f0`
- App-icon neutral: `#0b1224`

Accessible interactive shades intentionally differ from the raw logo colors where contrast requires
it. Do not recolor, stretch, or recreate the mark in components.
