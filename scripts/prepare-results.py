"""Encode the per-view result videos and Start layers for the Results demo.

Requires imageio-ffmpeg. Run from any directory with:
    python scripts/prepare-results.py
Source videos in videos/ and Start PNGs in docs/assets/results/0X are preserved.
"""
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

import imageio_ffmpeg

PROJECT = Path(__file__).resolve().parents[1]
DOCS = PROJECT / 'docs'
VIDEOS = PROJECT / 'videos'
ROOT = DOCS / 'assets/results'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
ENCODING_VERSION = 'per-view-h264-vp9-v2'
# Keep decoding light: every view plays at once, so frame rate is capped and
# each view is scaled to about 2x its displayed CSS size.
MAX_FPS = 24
CRF = 23
KEYFRAME_SECONDS = 0.5
COPYRIGHT_HOLDERS = {
    '01': 'Blender Studio',
    '02': 'miHoYo',
    '03': 'DillonGoo Studios',
    '04': 'miHoYo',
}
LABELS = {'blender': 'In Blender', 'optimization': 'In Optimization', 'angle': 'Another View'}
# (id, title, clip seconds or None for the shortest source, output size, layout, views, Start layers).
# The first view is the playback clock that the other views follow.
CASES = [
    ('01', 'Facial expression keyframing', 4, (800, 800), 'side-by-side',
     {'blender': '1_render_process.mp4', 'optimization': '1_match_process.mp4'},
     ['teaser_rigged_mesh_no_ui.png', 'initial contour matched.png', 'input stroke.png']),
    ('02', 'Contour-defined object posing', 4, (800, 800), 'side-by-side',
     {'blender': '2_viewport_process.mp4', 'optimization': '2_match_process.mp4'},
     ['skirt_input.png']),
    ('03', 'View-specific stylization', 3, (800, 800), 'side-by-side',
     {'blender': '3_viewport_process.mp4', 'optimization': '3_match_process.mp4'},
     ['vd_input.png']),
    ('04', 'Stylized perspective', 5, (1200, 800), 'start-above',
     {'blender': '4_viewport_process.mp4', 'optimization': '4_match_process.mp4', 'angle': '4_another_angle.mp4'},
     ['sp_initial.png', 'sp_contour.png', 'sp_input.png']),
]


def ffmpeg(*args):
    subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


def probe(video):
    info = subprocess.run([FFMPEG, '-hide_banner', '-i', str(video)], capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', info).groups()
    fps = float(re.search(r'([\d.]+) fps', info).group(1))
    return int(h) * 3600 + int(m) * 60 + float(s), fps


def versioned(path):
    return path.relative_to(DOCS).as_posix() + '?v=' + hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def main():
    records = []
    for case_id, title, clip, (w, h), layout, views, layers in CASES:
        target = ROOT / 'generated' / case_id
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)

        start_paths = []
        for i, name in enumerate(layers):
            dest = target / f'start-{i}.webp'
            # Layers share one size so the stacked overlays stay aligned.
            ffmpeg('-i', str(ROOT / case_id / name), '-vf', f'scale={w}:{h}:flags=lanczos',
                   '-c:v', 'libwebp', '-quality', '90',
                   '-compression_level', '6', '-pix_fmt', 'yuva420p', str(dest))
            start_paths.append(versioned(dest))

        sources = {key: VIDEOS / name for key, name in views.items()}
        probes = {key: probe(path) for key, path in sources.items()}
        duration = min([clip or float('inf')] + [d for d, _ in probes.values()])
        # Shared frame rate keeps every view on the same frame grid.
        fps = min([MAX_FPS] + [f for _, f in probes.values()])
        tracks = []
        for key, source in sources.items():
            video = target / f'{key}.mp4'
            ffmpeg('-i', str(source), '-t', f'{duration:.3f}', '-an',
                   '-vf', f'fps={fps:g},scale={w}:{h}:flags=lanczos,setsar=1,format=yuv420p',
                   '-c:v', 'libx264', '-preset', 'slow', '-crf', str(CRF),
                   '-profile:v', 'high', '-level', '4.0', '-g', str(round(fps * KEYFRAME_SECONDS)),
                   '-movflags', '+faststart', str(video))
            # VP9 fallback for browsers without H.264, such as VS Code's built-in preview.
            webm = target / f'{key}.webm'
            ffmpeg('-i', str(source), '-t', f'{duration:.3f}', '-an',
                   '-vf', f'fps={fps:g},scale={w}:{h}:flags=lanczos,setsar=1,format=yuv420p',
                   '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-row-mt', '1', '-deadline', 'good',
                   '-cpu-used', '2', '-g', str(round(fps * KEYFRAME_SECONDS)), str(webm))
            poster = target / f'{key}-poster.webp'
            ffmpeg('-i', str(video), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '85', str(poster))
            tracks.append(dict(key=key, label=LABELS[key], video=versioned(video), webm=versioned(webm),
                               poster=versioned(poster)))
            print(f'{case_id} {key}: {w}x{h} @ {fps:g} fps, {duration:.2f}s, '
                  f'{video.stat().st_size / 1024 / 1024:.2f} MiB', flush=True)

        records.append(dict(id=case_id, copyrightHolder=COPYRIGHT_HOLDERS[case_id], title=title,
                            starts=start_paths, tracks=tracks, duration=round(duration, 2),
                            layout=layout, width=w, height=h))

    # A classic script also supports opening index.html directly via file://.
    (DOCS / 'results-data.js').write_text(
        '// Generated by scripts/prepare-results.py\nwindow.RESULTS_DATA = ' +
        json.dumps(records, indent=2) + ';\n', encoding='utf-8')
    size = sum(p.stat().st_size for p in (ROOT / 'generated').rglob('*') if p.is_file())
    print(f'Generated assets: {size / 1024 / 1024:.2f} MiB ({ENCODING_VERSION})')


if __name__ == '__main__':
    main()
