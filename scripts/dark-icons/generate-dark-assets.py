#!/usr/bin/env python3
"""Generate dark-mode variants of the grocery icon sets.

The light icons are dark linework/shading on a white or transparent ground. Two
different dark treatments are used depending on the set:

  minimal items / letters  -> TINT method
    Pure line art. Turn the linework into an alpha mask
    (alpha = 255 - luminance, scaled by the source alpha) and tint it light, so
    it becomes "light ink on transparent" that reads on any dark surface.

  illustrated items / letters -> INVERT method
    Filled tonal engravings. A tint/alpha mask drops the light body and leaves a
    hollow outline, so instead invert the luminance (black<->white) to get a
    filled "white charcoal on black" rendering. The white paper background is
    then keyed to transparent by flood-filling the near-white region inward from
    the borders: the fill stops at the object's dark outline, so interior
    highlights stay opaque and only the surrounding paper becomes transparent.
    The result is a filled white engraving on a transparent ground that sits on
    any dark surface with no baked-in background box.

Outputs sit next to each source dir with a `-dark` suffix and identical filenames,
so itemIconMapDark.ts can mirror itemIconMap.ts by a path swap alone.

Requires Pillow + numpy:  python3 -m pip install pillow numpy
  (use a venv on externally-managed Pythons)
Run from anywhere:  python3 scripts/dark-icons/generate-dark-assets.py
"""
import glob
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = os.path.join(REPO, "app", "assets", "icons")
TINT = (236, 236, 236)   # ~ darkTheme textPrimary (#f1efef)
WHITE_THR = 232          # luminance >= this counts as removable paper background
# Shadow fade (illustrated): map final brightness -> opacity so dim cast shadows
# fade into the transparent ground while bright marks stay solid.
SHADOW_LO = 8            # below this brightness -> fully transparent
SHADOW_HI = 110          # at/above this brightness -> fully opaque
SHADOW_BLUR = 1.0        # gaussian blur on the alpha mask for smooth edges

# set -> method ("tint" | "invert")
# Letter fallbacks are now CasinoGrotesk text glyphs (themed at runtime), so only
# the item icon sets need pre-rendered dark variants.
SETS = {
    "items/illustrated": "invert",
    "items/minimal": "tint",
}


def _on_white_luminance(path):
    rgba = Image.open(path).convert("RGBA")
    on_white = Image.alpha_composite(
        Image.new("RGBA", rgba.size, (255, 255, 255, 255)), rgba
    ).convert("L")
    return on_white


def to_dark_tint(path):
    """Line art -> light ink on transparent (alpha mask + light tint)."""
    img = Image.open(path).convert("RGBA")
    px = img.load()
    w, h = img.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            alpha = int((255 - lum) * (a / 255.0))
            op[x, y] = (TINT[0], TINT[1], TINT[2], alpha)
    return out


def to_dark_invert(path):
    """Filled engraving -> bright drawing on a transparent ground.

    Background = near-white pixels reachable from the image border (flood fill);
    those become transparent. Everything the fill can't reach (the object, incl.
    its interior highlights) stays opaque.

    Polarity is chosen per icon so the object reads bright on a dark surface:
      - dark-bodied objects (apple, chicken) are inverted -> light-on-dark.
      - light-bodied objects (cream, salt, white pepper, the cut artichoke,
        a pale bell pepper) are kept as-is, since inverting would turn their lit
        surfaces into an unreadable black blob.
    Decision: if the object's mean luminance is dark (< 128) invert it, else keep.
    """
    L = np.asarray(_on_white_luminance(path), dtype=np.uint8)
    h, w = L.shape
    is_white = L >= WHITE_THR

    bg = np.zeros((h, w), dtype=bool)
    dq = deque()
    # seed every near-white border pixel
    for x in range(w):
        for y in (0, h - 1):
            if is_white[y, x] and not bg[y, x]:
                bg[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if is_white[y, x] and not bg[y, x]:
                bg[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and is_white[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                dq.append((ny, nx))

    obj = ~bg
    obj_mean = float(L[obj].mean()) if obj.any() else 0.0
    rgb = (255 - L).astype(np.uint8) if obj_mean < 128 else L.astype(np.uint8)

    # Brightness-driven alpha (smoothstep): bright marks stay opaque, dim cast
    # shadows fade out, so the object melts into the dark ground instead of
    # sitting on a hard grey patch. The keyed paper stays fully transparent.
    t = np.clip((rgb.astype(np.float32) - SHADOW_LO) / (SHADOW_HI - SHADOW_LO), 0.0, 1.0)
    alpha = (t * t * (3.0 - 2.0 * t) * 255.0).astype(np.uint8)
    alpha[bg] = 0
    img = Image.fromarray(np.dstack([rgb, rgb, rgb, alpha]), "RGBA")
    img.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(SHADOW_BLUR)))
    return img


METHODS = {"tint": to_dark_tint, "invert": to_dark_invert}


def main():
    total = 0
    for rel, method in SETS.items():
        convert = METHODS[method]
        src_dir = os.path.join(BASE, rel)
        out_dir = os.path.join(BASE, rel + "-dark")
        os.makedirs(out_dir, exist_ok=True)
        files = sorted(glob.glob(os.path.join(src_dir, "*.png")))
        for f in files:
            convert(f).save(os.path.join(out_dir, os.path.basename(f)))
        print(f"{rel}: {len(files)} -> {rel}-dark ({method})")
        total += len(files)
    print("TOTAL:", total)


if __name__ == "__main__":
    main()
