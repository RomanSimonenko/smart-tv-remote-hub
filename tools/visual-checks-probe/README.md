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

## Automatic TV-screen geometry experiment

Separate, disposable experiment; no application or runner integration. The existing
OCR/image `probe` above still requires pre-cropped inputs. `screen-probe` searches
full frames using Canny edges and convex quadrilaterals, merges duplicate edge
contours and accepts only one candidate in its experimental geometry envelope.
Zero or multiple candidates produce **«Экран не найден»** with a diagnostic reason;
decode/I/O errors fail the command rather than masquerading as screen absence.
Contours and perspective transformation follow the [OpenCV contour tutorial](https://docs.opencv.org/4.x/d5/daa/tutorial_js_contours_begin.html)
and [geometric transformation tutorial](https://docs.opencv.org/4.x/dd/d52/tutorial_js_geometric_transformations.html).

Run synthetic evaluation first (from repository root):

```sh
pnpm --filter @remote-webos-tv/visual-checks-probe build
mkdir -p .local/screen-experiment
pnpm --filter @remote-webos-tv/visual-checks-probe screen-probe --synthetic --output ../../.local/screen-experiment/synthetic-01
```

Open `index.html` inside that output directory. `report.json` includes parameters,
dependency/runtime versions, source hashes, measured durations, ground-truth
corners, corner errors and false-positive/false-negative counts. The 13 synthetic
cases cover perspective, rotation, blur, seeded noise, weak contrast, absent,
clipped, tiny, portrait, occluded and multiple screens, plus a window lookalike.
The lookalike intentionally has identical visible geometry to the straight TV
fixture: geometry cannot distinguish their identities. Count it as a false positive,
not as successful detection. Synthetic success does not establish real-camera
reliability. Thresholds are fixed experimental parameters, not calibrated confidence.
Severe perspective, nested UI rectangles or bezel edges may cause refusal.
Output is always 640×360 under a **landscape 16:9 assumption**; four corners alone
cannot establish the physical aspect ratio or resolve arbitrary camera rotation.

Second stage: provide privately stored PNG/JPEG/WebP frames, using `--image` once
per frame and a fresh local output directory. Paths resolve from this package
directory when using the filtered script:

```sh
pnpm --filter @remote-webos-tv/visual-checks-probe screen-probe --image ../../.local/private-frames/frame-01.jpg --image ../../.local/private-frames/frame-02.jpg --output ../../.local/screen-experiment/real-01
```

Real inputs are labelled `real-unlabelled`: the report does not infer correctness
or accuracy without human ground truth. Inspect the original, candidate overlay
and rectified result for every frame; record true bounds, false detections, refusals
and perspective errors before deciding on runner integration. Do not tune and
evaluate on the same real frames; retain a separate held-out set.

Only use ignored `.local/` storage or an external private directory for real inputs
and outputs. Output directories use mode 0700, files 0600; these permissions are
local access restrictions, not encryption or protection from same-account cloud
sync/backups. Source images are preserved byte-for-byte, including metadata; copied
filenames are anonymous and reports omit input paths. Existing output directories
are rejected. Failed/cancelled runs remove only their newly created output directory.
SIGINT/SIGTERM cancellation is cooperative between image-processing operations.
No camera capture, network calls, physical-TV commands or saved app data mutations
are performed. Do not publish real reports or screenshots.

## Disposable live probe

Responses include contour-stage diagnostics: total/accepted counts, exclusive
rejection counts, and up to 12 rejected contours with large bounding boxes.
The page exposes them under “Диагностика поиска”; selection thresholds are
unchanged. For explicitly requested private research, `startLiveProbe` accepts
`{evidenceDirectory}` and writes at most one refused PNG plus diagnostics per
run, using private file permissions and exclusive creation. Use a new private
directory per run. Default mode does not record frames. Recording mode is
announced on the page; capture errors are explicit processing errors.

Live searches independently supported sides, including convex-hull hypotheses
when ordinary contours are broken. Every proposed side requires current Canny
edge support. Inner parallel edges are searched explicitly and checked by the
bezel material/geometry reducer. A previous boundary guides a local ±6 detection
pixel search; edge contrast polarity guards against crossing onto the opposite
bezel edge. On loss, no stale crop is displayed. The client retains only search
identity; reacquisition elsewhere requires a confirmed framed pair. A lone
quadrilateral during the initial acquisition can still include a bezel or window.
These are experimental line/contrast checks, not optical flow or TV recognition.

Build the package, then run `node tools/visual-checks-probe/dist/live-server.js`
from the repository root. Open the printed loopback URL in a browser and enable
the desired camera. This server chooses an available port and listens only on
127.0.0.1. Stop it with Ctrl+C. The normal app and runner are not connected.

The browser requests up to Full HD camera resolution but sends only a maximum
960-pixel-side PNG for live preview. `/live-frame` detects at maximum side 640
and returns 640×360, retrying at 800/960 only when geometry is missing. An
ambiguous result is never bypassed by trying another scale. A verified inner
boundary can replace an initially acquired outer outline. `/frame` retains the previous stateless native-output
contract; static reports are unchanged. The live-only prior headers contain four
normalized corners and four contrast polarities, validated at the HTTP boundary.

The accepted default is now `startLiveProbe()` with 960×540 output and a
1280-pixel input cap. `startLiveProbe(0, {livePreviewWidth:640})` retains the
previous baseline: 640×360 output and a 960-pixel input cap. The server
publishes that configuration in page metadata so the browser and warp agree.
Detection and tracking parameters are unchanged. The baseline decision is recorded
in `docs/superpowers/specs/2026-10-17-live-screen-boundary-baseline.md`.
There is no queue of old frames and no image persistence. The exact
line detector checks fresh pixels on every frame; this is a processed frame sequence,
not yet a 25–30 FPS homography-rendered video player. UI reports achieved display
rate, server processing time and capture-to-response age (not camera sensor latency).
One frame is in flight per browser session; the server rejects concurrent work.

Display requires three consecutive detections with corner changes at most 2% in
normalized coordinates. Missing/ambiguous detection, movement beyond that threshold,
or age over one second hides the previous image and requires confirmation again.
These are experimental gates, not calibrated confidence or optical-flow motion
detection; slow motion can remain within tolerance. Similar windows remain a known
false-positive risk. Browser timer throttling means stale hiding is not a hard
real-time guarantee. Hiding the tab or stopping the probe releases camera tracks,
frame callbacks and the request. Initialization and request errors remain visible.

Only same-origin PNG requests with an explicit probe header are accepted. The
server limits requests to 8 MiB and 1920×1920 input pixels and provides no recording, TV commands
or filesystem browsing endpoint. Real visual QA screenshots, if captured separately,
must remain in private local storage like the static evidence.

The `/synthetic` page uses a locally generated 1920×1080 stream with a moving
marker and known rectangle; it requests no camera access. Use it to verify browser
capture, confirmation and full-frame scaling before trying a real camera. Output
size alone does not establish OCR quality; compare recognition on independently
labelled text before treating the result as OCR-ready.

### Bezel hypothesis and diagnostics

The live page draws every qualified contour in yellow on the exact processed
source frame; the selected image boundary is green. Optional stopping on ambiguity
releases the camera and labels the retained diagnostic image as a frozen frame.
The server returns all raw candidate corners even when bezel handling selects one.

The shared detector can remove an outer contour only when a contained inner one
has similar area and nearly parallel edges, with a narrow gap on every side.
Samples in that intervening strip must have low luminance spread on each edge;
the interior must have meaningful luminance variation. Experimental thresholds
are declared once in `screen-bezel.ts` and included in report parameters. This
selects the active display rather than its bezel without blindly selecting every
inner rectangle. Distinct screens, deep nested cards, textured strips and uniform
nested surfaces stay ambiguous in the synthetic checks. Tilted bezels are tested.

This changes candidate selection in both static and live probes, but not their
output sizing contracts. It is a single-frame photometric heuristic, not trained
material recognition or temporal content analysis. A narrow uniform interface
border around textured content can still resemble a physical bezel; darkness,
glare and clipped contours can prevent selection. Temporal evidence is not yet
used to decide which contour is a bezel. Geometric window lookalikes remain a
known limitation. Runner integration stays deferred.

### Source-detail snapshot probe

The standalone live page now offers «Снимок экрана» after three fresh boundary confirmations.
It takes the next camera frame (long side capped at 1920), revalidates the tracked
boundary on that frame with the accepted live detector, then rectifies with
`output: 'source'`. The 0.3% inset remains output-only. Output dimensions follow
the measured screen edges: a Full HD camera frame does not imply a Full HD crop,
and no detail is manufactured by upscaling. Missing boundaries return no image.
Snapshots are processed sequentially with live frames, remain in browser memory,
and can be explicitly downloaded as PNG. No runner or production API changes.
The `/synthetic` page exercises the same path without camera access.
