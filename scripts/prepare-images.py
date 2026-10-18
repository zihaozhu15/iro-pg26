"""Encode web-sized versions of the teaser and pipeline figures.

Requires imageio-ffmpeg. Run from any directory with:
    python scripts/prepare-images.py
The full-resolution PNGs in docs/assets are preserved; the pipeline PNG stays
available as a "full resolution" link.
"""
import re
import subprocess
from pathlib import Path

import imageio_ffmpeg

ASSETS = Path(__file__).resolve().parents[1] / 'docs/assets'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
# (source, output stem, widths, WebP quality)
IMAGES = [
    ('teaser.png', 'teaser', [1280, 2560], 88),
    ('pipeline.png', 'pipeline', [1600, 3000], 92),
]


def encode(source, dest, width, *codec):
    subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                    '-vf', f'scale={width}:-2:flags=lanczos', '-frames:v', '1', *codec, str(dest)], check=True)
    info = subprocess.run([FFMPEG, '-hide_banner', '-i', str(dest)], capture_output=True, text=True).stderr
    size = re.search(r', (\d{2,})x(\d{2,})', info).group(0)[2:]
    print(f'{dest.name}: {size}, {dest.stat().st_size / 1024:.0f} KiB')


def main():
    for source, stem, widths, quality in IMAGES:
        for width in widths:
            encode(ASSETS / source, ASSETS / f'{stem}-{width}.webp', width, '-c:v', 'libwebp', '-quality', str(quality))
    # Link previews: social crawlers do not all accept WebP.
    encode(ASSETS / 'teaser.png', ASSETS / 'teaser-og.jpg', 1200, '-q:v', '3')


if __name__ == '__main__':
    main()
