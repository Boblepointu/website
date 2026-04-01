#!/usr/bin/env python3
"""Recompress responsive turtle/hero WebPs for Lighthouse (Pillow)."""
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print('optimize-turtle-webp: Pillow not installed, skipping')
    raise SystemExit(0)

BASE = Path(__file__).resolve().parent.parent / 'assets' / 'images'


def save_webp(src: Path, out: Path, size, quality: int) -> None:
    img = Image.open(src)
    if isinstance(size, tuple):
        img = img.resize(size, Image.LANCZOS)
    else:
        w, h = img.size
        if w > size:
            nh = int(h * (size / w))
            img = img.resize((size, nh), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, 'WebP', quality=quality, method=6)


def main() -> None:
    for i in range(1, 6):
        jpeg = BASE / f'turtles_{i}.jpeg'
        if not jpeg.exists():
            continue
        save_webp(jpeg, BASE / f'turtles_{i}-384.webp', (384, 384), 18)
        save_webp(jpeg, BASE / f'turtles_{i}-640.webp', (640, 640), 22)

    hero = BASE / 'turtles_hero.jpeg'
    if hero.exists():
        save_webp(hero, BASE / 'turtles_hero-348.webp', 348, 35)
        save_webp(hero, BASE / 'turtles_hero-448.webp', 448, 32)
        save_webp(hero, BASE / 'turtles_hero-896.webp', 896, 20)

    HERO_SIZES = [(348, 35), (448, 32), (896, 20)]
    for pattern in ('ecosystem_0_0', 'tools_0', 'roadmap_0'):
        for ext in ('.jpg', '.jpeg', '.png'):
            src = BASE / f'{pattern}{ext}'
            if not src.exists():
                continue
            for width, q in HERO_SIZES:
                save_webp(src, BASE / f'{pattern}-{width}.webp', width, q)
            break

    print('optimize-turtle-webp: done')


if __name__ == '__main__':
    main()
