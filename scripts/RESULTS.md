# Results assets

The webpage uses static WebP frames only, not video elements or MP4 downloads.
Frames and Start layers retain their source pixel dimensions and use lossless
WebP encoding. Canvas buffers also match the source video dimensions; CSS scales
the displayed size to fit the layout without reducing the underlying resolution.
Example 04 places Start above the two side-by-side playback views.
Each example has 48 evenly spaced frames per view, including the first and last
source frames (example 03 uses only the first 2 seconds). A shared normalized
frame index controls both views. The timeline follows the Blender clip duration;
if paired clips have different lengths, the optimization view is retimed to the
same 0-100% progress. Playback waits for both images if loading is slow.

## Regenerate

Install `Pillow` and `imageio-ffmpeg`, then run:

```sh
python scripts/prepare-results.py
```

Source files live in `docs/assets/results/01` through `04`. The plain MP4 names
are Blender renders; names ending in `_` are optimization views. Paired clips
are sampled at matching relative progress. The script preserves these sources and writes:

- `docs/assets/results/generated/`: compressed Start layers and 384 WebP frames.
- `docs/results-data.js`: asset paths, dimensions, and playback durations.

Start layers are ordered character, green initial contour, red target strokes.
Examples 02 and 03 already have a composite Start image. The exported layers in
01 and 04 have matching aspect ratios; resizing to a common displayed rectangle
preserves their alignment.

Publish the generated assets with `results-data.js`, `results.js`, `index.html`,
and `styles.css`. Original MP4/PNG sources are not needed by the page. No build
step or server API is needed; local HTML preview and GitHub Pages both work.

Frames load near the viewport or on interaction. The player prefetches the next
two pairs and limits cached pairs according to source resolution (six pairs for
1000 × 1000, three pairs for 1800 × 1200) to control decoded-image memory.
Playback pauses when an example leaves the viewport or the tab is hidden.
