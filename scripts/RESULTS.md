# Results assets

Each result example plays one H.264 MP4 per view (In Blender, In Optimization,
and for example 04 an extra Another View). The In Blender video is the playback
clock: the other views follow it, are nudged with `playbackRate` when they drift
by more than 30 ms, and jump to the clock if they drift by more than 0.3 s. If
any view stalls while buffering, all views pause and resume together. Play,
pause, the progress slider and Replay always act on every view at once.

Clips keep the first 4 s (01), 4 s (02), 3 s (03) and 5 s (04) of each source;
change `CASES` to adjust. To keep decoding light, frame rate is capped at 24 fps and views
are scaled to about twice their displayed size (800 × 800, or 1200 × 800 for
04). Keyframes every 0.5 s keep slider seeking responsive. Every view of an
example has the same frame rate and frame count.

Example 04 shows Start and Another View on the first row, with In Blender and
In Optimization below.

## Regenerate

Install `imageio-ffmpeg`, then run:

```sh
python scripts/prepare-results.py
```

Source videos live in `videos/`; Start PNG layers live in
`docs/assets/results/01` through `04`. Clip lengths, sizes and view-to-file
mapping are set in `CASES` at the top of the script. The script preserves the
sources and writes:

- `docs/assets/results/generated/0X/`: Start layers (lossless WebP), and per
  view an H.264 MP4, a VP9 WebM fallback (for browsers without H.264, such as
  VS Code's built-in preview) and a poster WebP. Browsers download only one of
  the two video formats.
- `docs/results-data.js`: asset paths, sizes, durations and view labels.

Start layers are ordered character, green initial contour, red target strokes.
Examples 02 and 03 already have a composite Start image.

Publish the generated assets with `results-data.js`, `results.js`, `index.html`,
and `styles.css`, and refresh their `?v=` hashes in `index.html`. Source videos
and PNGs are not needed by the page. No build step or server API is needed.

Videos use `preload="none"` with a poster and start buffering only when an
example comes within 300 px of the viewport. Playback pauses when an example
leaves the viewport or the tab is hidden.
