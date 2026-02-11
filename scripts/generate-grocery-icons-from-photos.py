#!/usr/bin/env python3

import argparse
import csv
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def slugify(value: str) -> str:
    out = value.lower().replace("&", "and")
    out = "".join(ch if ch.isalnum() else "-" for ch in out).strip("-")
    while "--" in out:
        out = out.replace("--", "-")
    return out


def find_ref_image(ref_dir: Path, slug: str) -> Path | None:
    for ext in ("png", "jpg", "jpeg", "webp"):
        candidate = ref_dir / f"{slug}.{ext}"
        if candidate.exists():
            return candidate
    return None


def build_mask_rgba(img: Image.Image) -> np.ndarray:
    rgba = img.convert("RGBA")
    arr = np.array(rgba, dtype=np.uint8)
    rgb = arr[:, :, :3].astype(np.int16)
    alpha = arr[:, :, 3].astype(np.uint8)

    # If image already has transparency, trust it.
    if np.mean(alpha) < 250:
        return alpha > 20

    h, w = rgb.shape[:2]
    corners = np.array(
        [
            rgb[0, 0],
            rgb[0, w - 1],
            rgb[h - 1, 0],
            rgb[h - 1, w - 1],
        ],
        dtype=np.int16,
    )
    bg = np.mean(corners, axis=0)
    dist = np.sqrt(np.sum((rgb - bg) ** 2, axis=2))

    # Foreground when color differs from corner-estimated background.
    mask = dist > 28
    return mask


def stylize_icon(src: Image.Image, out_size: int = 128) -> Image.Image:
    src = src.convert("RGBA")
    mask_np = build_mask_rgba(src)

    alpha = Image.fromarray((mask_np * 255).astype(np.uint8), mode="L")
    alpha = alpha.filter(ImageFilter.MedianFilter(size=5))
    alpha = alpha.filter(ImageFilter.MaxFilter(size=5))
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=1.2))
    alpha = alpha.point(lambda p: 255 if p > 80 else 0)

    # Crop tightly to foreground.
    bbox = alpha.getbbox()
    if not bbox:
        bbox = (0, 0, src.width, src.height)

    crop = src.crop(bbox).convert("RGBA")
    crop_alpha = alpha.crop(bbox)
    crop.putalpha(crop_alpha)

    # Color treatment: closer to illustrated icons while preserving shape.
    base = ImageEnhance.Color(crop).enhance(1.35)
    base = ImageEnhance.Contrast(base).enhance(1.15)
    base = ImageEnhance.Sharpness(base).enhance(1.2)

    # Build sketch-like edges from luminance.
    gray = ImageOps.grayscale(base)
    edges = gray.filter(ImageFilter.FIND_EDGES)
    edges = ImageOps.invert(edges)
    edges = ImageEnhance.Contrast(edges).enhance(2.1)
    edges = edges.point(lambda p: 255 if p > 210 else 0)

    # Compose on transparent canvas.
    canvas = Image.new("RGBA", (out_size, out_size), (0, 0, 0, 0))
    inset = int(out_size * 0.07)
    max_w = out_size - inset * 2
    max_h = out_size - inset * 2
    scale = min(max_w / base.width, max_h / base.height)
    new_w = max(1, int(base.width * scale))
    new_h = max(1, int(base.height * scale))
    base = base.resize((new_w, new_h), Image.Resampling.LANCZOS)
    edges = edges.resize((new_w, new_h), Image.Resampling.LANCZOS)

    x = (out_size - new_w) // 2
    y = (out_size - new_h) // 2
    canvas.alpha_composite(base, (x, y))

    # Bold outer contour from alpha.
    a = canvas.split()[3]
    dilated = a.filter(ImageFilter.MaxFilter(size=7))
    outline = ImageChopsSubtract(dilated, a)
    contour = Image.new("RGBA", (out_size, out_size), (0, 0, 0, 0))
    contour.putalpha(outline)
    contour = ImageOps.colorize(contour.split()[3], black=(0, 0, 0), white=(38, 27, 21)).convert("RGBA")
    canvas.alpha_composite(contour)

    # Inner sketch lines masked to object.
    edge_rgba = Image.new("RGBA", (out_size, out_size), (0, 0, 0, 0))
    edge_rgba.putalpha(edges)
    sketch = ImageOps.colorize(edge_rgba.split()[3], black=(0, 0, 0), white=(28, 20, 16)).convert("RGBA")
    sketch.putalpha(ImageChopsMultiply(edge_rgba.split()[3], canvas.split()[3]))
    canvas.alpha_composite(sketch)

    return canvas


def ImageChopsSubtract(a: Image.Image, b: Image.Image) -> Image.Image:
    arr_a = np.array(a, dtype=np.int16)
    arr_b = np.array(b, dtype=np.int16)
    out = np.clip(arr_a - arr_b, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="L")


def ImageChopsMultiply(a: Image.Image, b: Image.Image) -> Image.Image:
    arr_a = np.array(a, dtype=np.float32) / 255.0
    arr_b = np.array(b, dtype=np.float32) / 255.0
    out = np.clip((arr_a * arr_b) * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="L")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate PNG grocery icons from reference photos.")
    parser.add_argument("--csv", required=True, type=Path, help="CSV with item column")
    parser.add_argument("--refs", required=True, type=Path, help="Directory containing reference photos named by slug")
    parser.add_argument("--out", required=True, type=Path, help="Output directory for icons")
    parser.add_argument("--limit", type=int, default=10, help="How many rows from CSV")
    parser.add_argument("--size", type=int, default=128, help="Output icon size")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    manifest_path = args.out.parent / f"manifest-first-{args.limit}-photo-icons.csv"

    rows = []
    with args.csv.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i >= args.limit:
                break
            rows.append(row)

    missing = []
    with manifest_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["rank", "category", "item", "slug", "reference_path", "png_path"])

        for row in rows:
            item = row["item"]
            slug = slugify(item)
            ref_path = find_ref_image(args.refs, slug)
            if ref_path is None:
                missing.append(slug)
                continue

            src = Image.open(ref_path)
            icon = stylize_icon(src, out_size=args.size)
            out_path = args.out / f"{slug}.png"
            icon.save(out_path, "PNG")
            writer.writerow([row["rank"], row["category"], item, slug, str(ref_path), str(out_path)])

    print(f"Done. Wrote icons to: {args.out}")
    print(f"Manifest: {manifest_path}")
    if missing:
        print("Missing refs:")
        for slug in missing:
            print(f"- {slug}")


if __name__ == "__main__":
    main()
