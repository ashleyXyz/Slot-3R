"""Extract original point-cloud PNGs without PDF downsampling or recompression.

Usage: python scripts/extract_comparison_assets.py path/to/visual_comparison.pptx
The input is visual comparison_relayout_with_ours_star.pptx from the paper source.
"""

import argparse
import struct
from pathlib import Path
from zipfile import ZipFile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    destination = Path(__file__).resolve().parents[1] / "assets"
    # Slide 1: the Point3R, Slot3R and GT columns, in scene order.
    panels = {
        1: ((8, 676, 499), (9, 676, 499), (10, 676, 499)),
        2: ((18, 478, 521), (19, 478, 521), (20, 478, 521)),
        3: ((28, 597, 474), (29, 597, 474), (30, 597, 474)),
        4: ((38, 624, 371), (39, 647, 420), (40, 678, 437)),
    }
    images = []
    with ZipFile(args.source) as presentation:
        for scene, entries in panels.items():
            for method, (number, width, height) in zip(("point3r", "slot3r", "gt"), entries):
                data = presentation.read(f"ppt/media/image{number}.png")
                if data[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", data[16:24]) != (width, height):
                    raise ValueError(f"Unexpected source image {number}; check the presentation version.")
                images.append((f"scene-{scene}-{method}.png", data, width, height))
    destination.mkdir(exist_ok=True)
    for name, data, width, height in images:
        (destination / name).write_bytes(data)
        print(f"{name}: {width} x {height}, original PNG bytes")


if __name__ == "__main__":
    main()
