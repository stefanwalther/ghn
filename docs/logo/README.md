# ghn. logo

Lowercase extrabold `ghn` with an oversized lime dot. The dot is a sync
indicator, not decoration.

## Files

| File | Use |
|---|---|
| `wordmark-light.svg` / `wordmark-dark.svg` | README header, docs (`<picture>` picks by theme) |
| `tile-text.svg` | App icon source (navy tile, white ghn, lime dot) |
| `tile-dot.svg` | 16px favicon layer source (dot only, text is unreadable that small) |
| `png/tile-16.png`, `tile-32.png`, `tile-48.png` | Favicon layers |
| `png/favicon.ico` | Multi-res ICO (16 dot-only, 32/48 text) |
| `png/apple-touch-180.png` | iOS home screen |
| `png/icon-192.png`, `png/icon-512.png` | Manifest / Android |
| `brand-ghn` paths / `i-dot` / `i-ring` / `i-bar` shapes | Sidebar brand lockup (`BrandMark`), inlined in `components/brand-mark.tsx` so the indicator can use `var(--primary)` and follow the selected color theme. Geometry masters live in `make_paths.py` (`MASTERS["menu"]`) |
| `png/wordmark-*.png` | Previews, social |

SVG letters are vectorized Helvetica Bold outlines (`make_paths.py`), so the
mark renders identically in every viewer (GitHub, browsers, rsvg) — no
`<text>` remains in any logo SVG. `textLength` is gone with it; spacing is
baked into the path positions. Regenerate masters first, then rasters:

```bash
cd docs/logo
python3 make_paths.py
rsvg-convert -w 16 -h 16 tile-dot.svg -o png/tile-16.png
rsvg-convert -w 32 -h 32 tile-text.svg -o png/tile-32.png
rsvg-convert -w 48 -h 48 tile-text.svg -o png/tile-48.png
rsvg-convert -w 180 -h 180 tile-text.svg -o png/apple-touch-180.png
rsvg-convert -w 192 -h 192 tile-text.svg -o png/icon-192.png
rsvg-convert -w 512 -h 512 tile-text.svg -o png/icon-512.png
rsvg-convert -w 256 -h 155 wordmark-light.svg -o png/wordmark-light.png
rsvg-convert -w 256 -h 155 wordmark-dark.svg -o png/wordmark-dark.png
magick png/tile-16.png png/tile-32.png png/tile-48.png ICO:png/favicon.ico
cp png/favicon.ico ../../app/favicon.ico
cp tile-text.svg ../../app/icon.svg
# Sidebar lockup is inlined in components/brand-mark.tsx (theme-aware via
# CSS vars), so brand-ghn / i-*.svg are not copied to public/ anymore.
cp png/apple-touch-180.png ../../app/apple-icon.png
cp png/icon-192.png png/icon-512.png ../../public/icons/
```

## States (sidebar `BrandMark`)

Shape is freshness, blink is activity. Syncing wins ties.

| State | Mark | Meaning |
|---|---|---|
| Working | blinking bar | sync running (`syncing`) |
| Waiting | hollow ring | idle, data stale (`stale`, or disconnected) |
| Ready | full dot | idle, fresh |

## Colors

- Ink `#1A2332` (tile, light-mode wordmark)
- Paper `#FFFFFF` (dark-mode wordmark)
- Sidebar dot: `var(--primary)`, so it follows the selected color theme
  (lime `#C8F04B` / `#65A30D` only under the default theme)
