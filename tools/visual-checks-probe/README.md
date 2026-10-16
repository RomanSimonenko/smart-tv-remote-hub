# Visual checks probe

Local synthetic experiment; this package does not run test cases or control TVs.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @remote-webos-tv/visual-checks-probe build
pnpm --filter @remote-webos-tv/visual-checks-probe fixtures --output ../../.local/visual-checks/dataset
pnpm --filter @remote-webos-tv/visual-checks-probe probe --manifest ../../.local/visual-checks/dataset/manifest.json --output ../../.local/visual-checks/run
pnpm --filter @remote-webos-tv/visual-checks-probe test
pnpm --filter @remote-webos-tv/visual-checks-probe typecheck
```

`pnpm --filter` runs scripts in this package directory. `--output` must name a new
report directory: existing directories are rejected, never overwritten.
Generated fixtures may be regenerated in their dedicated dataset directory.
Models, WASM and dependencies are downloaded during installation. Recognition and
image comparison subsequently use local files; no CDN or external image service.

Inputs are already cropped TV-screen images. The probe does not detect the TV
boundary or establish camera-frame quality. A manifest describes normalized
regions, languages, explicit comparison operators and image-correlation thresholds.
`fixtures/manifest.json` is generated into the output dataset, not maintained as
a second source of fixture definitions. Paths are relative to that dataset;
parent traversal and symlinks escaping it are rejected.

OCR uses packaged `rus` and `eng` models. Exact comparison performs no implicit
whitespace, case or fuzzy normalization. Tesseract's output can include newlines;
this is visible in the report. `notContains` is deliberately inconclusive until
an independently validated frame-quality contract exists. Positive non-matches
are observations, not a verdict that the product under test is faulty.

Template matching uses grayscale OpenCV `TM_CCOEFF_NORMED`, without automatic
scaling or perspective correction. The experimental threshold is in the manifest;
a high score alone does not establish frame quality. Uniform references are
rejected because normalized correlation is undefined for them.

Each OCR job runs in a disposable process. Cancellation and initialization errors
release that process and its nested worker. Startup cost is included in measured
duration; a production worker pool is outside this experiment's scope.

Reports retain byte-identical source images, SHA-256 checksums, separate reference
images, search/recognition overlays, versions, model hashes and measured durations.
Run errors fail the command; individual evaluation errors remain visible in the
report. Timing and encoded-image bytes may vary with runtime/library versions;
fixture pixels are repeatable within the pinned environment. Report directories
for real data must stay in ignored local storage. Publish synthetic materials only.

## Licenses and provenance

- Tesseract.js and its core: Apache-2.0.
- `@techstark/opencv-js`: Apache-2.0; packaged OpenCV WASM, local Node adapter.
- Sharp/libvips: see installed package licenses (Sharp Apache-2.0, libvips LGPL).
- fontkit: MIT. Used only to render pinned glyph paths without system fonts.
- `@tesseract.js-data/rus` and `eng`: package MIT; bundled traineddata from Tesseract
  language data, see the installed packages/upstream notices.
- `fixtures/fonts/NotoSans.ttf`: Google Fonts Noto Sans, SIL Open Font License;
  full license in `fixtures/fonts/OFL.txt`.
  Source: https://github.com/google/fonts/tree/main/ofl/notosans

No real scenarios, private screen captures or credentials are included.
