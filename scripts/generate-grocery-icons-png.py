#!/usr/bin/env python3

import csv
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

INPUT_CSV = Path("/Users/saynode/Downloads/europe_grocery_top2000_estimated.csv")
OUT_DIR = Path("/Users/saynode/Documents/GitHub/lista/assets/grocery-icons/png/128")
MANIFEST = Path("/Users/saynode/Documents/GitHub/lista/assets/grocery-icons/manifest-first-10-png-only.csv")
LIMIT = 10
BASE = 512
OUT = 128
LINE = (30, 24, 20, 255)


def slugify(value: str) -> str:
    s = value.lower().replace("&", "and")
    s = "".join(ch if ch.isalnum() else "-" for ch in s).strip("-")
    while "--" in s:
        s = s.replace("--", "-")
    return s


def shadow(canvas, mask, offset=(0, 12), blur=8):
    sh = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 70), offset, mask)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(sh)


def glossy(draw, box):
    draw.rounded_rectangle(box, radius=30, fill=(255, 255, 255, 160))


def apple(canvas):
    d = ImageDraw.Draw(canvas)
    body = (66, 104, 446, 474)
    mask = Image.new("L", (BASE, BASE), 0)
    m = ImageDraw.Draw(mask)
    m.ellipse(body, fill=255)
    shadow(canvas, mask)
    d.ellipse(body, fill=(238, 90, 75, 255), outline=LINE, width=14)
    d.ellipse((142, 168, 220, 240), fill=(255, 132, 120, 120))
    d.arc((178, 84, 330, 172), start=198, end=320, fill=LINE, width=14)
    d.line((214, 102, 138, 38), fill=(112, 185, 164, 255), width=16)
    d.polygon([(238, 46), (328, 30), (270, 138)], fill=(75, 126, 96, 255), outline=LINE, width=8)
    glossy(d, (146, 190, 214, 280))


def asparagus(canvas):
    d = ImageDraw.Draw(canvas)
    for i, x in enumerate([88, 146, 204, 262, 320]):
        y = 96 + (i % 2) * 22
        stalk = Image.new("L", (BASE, BASE), 0)
        s = ImageDraw.Draw(stalk)
        s.polygon([(x, 442), (x + 50, 450), (x + 74, y + 58), (x + 26, y + 50)], fill=255)
        s.polygon([(x + 16, y + 48), (x + 24, y), (x + 74, y + 54)], fill=255)
        shadow(canvas, stalk, offset=(0, 7), blur=6)
        d.polygon([(x, 442), (x + 50, 450), (x + 74, y + 58), (x + 26, y + 50)], fill=(120, 211, 92, 255), outline=LINE, width=8)
        d.polygon([(x + 16, y + 48), (x + 24, y), (x + 74, y + 54)], fill=(102, 178, 77, 255), outline=LINE, width=8)
        d.polygon([(x + 32, y + 90), (x + 52, y + 86), (x + 38, y + 122)], fill=(211, 232, 131, 255), outline=LINE, width=4)


def avocado(canvas):
    d = ImageDraw.Draw(canvas)
    back = [(346, 66), (466, 138), (434, 408), (292, 478), (210, 416), (236, 164)]
    front = [(72, 136), (256, 42), (434, 152), (400, 382), (196, 472), (58, 328)]
    d.polygon(back, fill=(39, 95, 66, 255), outline=LINE, width=12)
    d.polygon(front, fill=(174, 220, 90, 255), outline=LINE, width=12)
    d.polygon([(98, 160), (254, 82), (400, 170), (376, 350), (206, 426), (92, 304)], fill=(222, 238, 145, 255), outline=(75, 140, 68, 255), width=6)
    d.ellipse((176, 162, 340, 326), fill=(167, 102, 48, 255), outline=LINE, width=10)
    d.ellipse((204, 188, 302, 288), fill=(196, 136, 73, 255))
    glossy(d, (208, 202, 270, 256))


def bananas(canvas):
    d = ImageDraw.Draw(canvas)
    bg = Image.new("L", (BASE, BASE), 0)
    b = ImageDraw.Draw(bg)
    b.rounded_rectangle((40, 64, 472, 448), radius=64, fill=255)
    # no shadow fill background, keep transparent icon
    for yoff, base, hi in [(44, (255, 198, 40, 255), (255, 224, 70, 255)), (0, (246, 173, 28, 255), (255, 208, 51, 255))]:
        pts = [(96, 320 + yoff), (150, 394 + yoff), (230, 432 + yoff), (314, 444 + yoff), (388, 424 + yoff), (432, 370 + yoff), (394, 340 + yoff), (324, 362 + yoff), (248, 366 + yoff), (170, 350 + yoff), (118, 308 + yoff)]
        d.polygon(pts, fill=base, outline=LINE, width=10)
        d.line((148, 326 + yoff, 360, 366 + yoff), fill=hi, width=16)
    d.rounded_rectangle((106, 260, 130, 292), radius=8, fill=(89, 62, 34, 255))
    d.ellipse((420, 372, 442, 394), fill=(106, 83, 40, 255))
    glossy(d, (174, 304, 246, 348))


def beetroot(canvas):
    d = ImageDraw.Draw(canvas)
    d.ellipse((74, 210, 344, 474), fill=(172, 32, 70, 255), outline=LINE, width=12)
    d.ellipse((252, 248, 448, 430), fill=(200, 33, 99, 255), outline=LINE, width=10)
    d.ellipse((278, 272, 420, 404), outline=(170, 74, 133, 255), width=10)
    d.line((352, 160, 170, 102), fill=(168, 25, 85, 255), width=12)
    for leaf in [((118, 36), (214, 222)), ((196, 24), (292, 228)), ((274, 52), (370, 242)), ((334, 94), (430, 258))]:
        (x1, y1), (x2, y2) = leaf
        d.polygon([(x1, y2), ((x1 + x2) // 2, y1), (x2, y2)], fill=(169, 216, 99, 255), outline=LINE, width=8)
        d.line(((x1 + x2) // 2, y1 + 8, (x1 + x2) // 2, y2), fill=(153, 33, 78, 255), width=5)


def bell_pepper(canvas):
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((88, 84, 422, 470), radius=110, fill=(246, 29, 27, 255), outline=LINE, width=14)
    d.line((192, 120, 180, 448), fill=(145, 15, 18, 255), width=8)
    d.line((314, 122, 328, 442), fill=(145, 15, 18, 255), width=8)
    d.arc((114, 74, 234, 190), 210, 350, fill=LINE, width=10)
    d.arc((280, 72, 392, 186), 190, 330, fill=LINE, width=10)
    d.line((262, 88, 324, 42), fill=(46, 132, 68, 255), width=22)
    glossy(d, (128, 172, 176, 252))
    glossy(d, (344, 186, 378, 254))


def blueberries(canvas):
    d = ImageDraw.Draw(canvas)
    for leaf in [(82, 94, 190, 212), (172, 70, 286, 198), (264, 86, 376, 204), (330, 112, 448, 230)]:
        d.polygon([(leaf[0], leaf[3]), ((leaf[0] + leaf[2]) // 2, leaf[1]), (leaf[2], leaf[3])], fill=(114, 212, 84, 255), outline=(34, 131, 76, 255), width=6)
    berries = [(142, 286, 86), (234, 244, 90), (332, 286, 86), (268, 338, 86)]
    for cx, cy, r in berries:
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(62, 122, 236, 255), outline=(20, 60, 145, 255), width=10)
        d.ellipse((cx - 34, cy - 28, cx + 20, cy + 18), fill=(135, 201, 255, 120))
        d.ellipse((cx - 18, cy - 18, cx + 18, cy + 18), fill=(39, 77, 166, 255))
        d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=(142, 122, 114, 255))


def broccoli(canvas):
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((194, 246, 322, 468), radius=42, fill=(183, 240, 132, 255), outline=(64, 128, 54, 255), width=10)
    crowns = [(112, 238, 86), (198, 176, 94), (304, 174, 94), (394, 236, 86), (254, 128, 86)]
    for cx, cy, r in crowns:
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(98, 179, 84, 255), outline=(44, 116, 47, 255), width=10)
    d.line((236, 262, 236, 440), fill=(129, 194, 101, 255), width=10)
    d.line((278, 262, 278, 440), fill=(129, 194, 101, 255), width=10)
    glossy(d, (218, 284, 250, 352))


def cabbage(canvas):
    d = ImageDraw.Draw(canvas)
    d.ellipse((64, 80, 448, 466), fill=(110, 210, 81, 255), outline=(23, 96, 45, 255), width=14)
    for ring in [(108, 120, 404, 422), (142, 156, 370, 390), (176, 188, 336, 354)]:
        d.ellipse(ring, outline=(169, 244, 130, 255), width=10)
    leaves = [
        [(58, 268), (62, 144), (144, 80), (196, 132), (148, 286)],
        [(354, 286), (314, 132), (370, 78), (450, 146), (452, 276)],
        [(120, 402), (80, 334), (150, 282), (226, 358), (206, 438)],
        [(306, 438), (286, 352), (366, 280), (432, 330), (396, 420)],
    ]
    for pts in leaves:
        d.polygon(pts, fill=(87, 173, 71, 255), outline=(23, 96, 45, 255), width=8)
    d.line((116, 312, 214, 224), fill=(190, 244, 158, 255), width=8)
    d.line((310, 236, 376, 166), fill=(190, 244, 158, 255), width=8)


def carrots(canvas):
    d = ImageDraw.Draw(canvas)
    d.polygon([(134, 120), (340, 170), (212, 452)], fill=(244, 139, 38, 255), outline=LINE, width=12)
    d.polygon([(246, 102), (434, 156), (330, 430)], fill=(232, 125, 30, 255), outline=LINE, width=10)
    for y in [186, 242, 300, 356]:
        d.line((196, y, 296, y + 20), fill=(205, 103, 22, 255), width=6)
    for y in [170, 232, 292, 346]:
        d.line((296, y, 378, y + 24), fill=(193, 92, 18, 255), width=6)
    d.polygon([(100, 56), (164, 18), (196, 94)], fill=(101, 196, 66, 255), outline=LINE, width=8)
    d.polygon([(164, 48), (220, 8), (250, 100)], fill=(84, 178, 64, 255), outline=LINE, width=8)
    d.polygon([(252, 40), (318, 6), (332, 110)], fill=(98, 190, 62, 255), outline=LINE, width=8)
    glossy(d, (190, 186, 234, 250))


DRAWERS = {
    "apples": apple,
    "asparagus": asparagus,
    "avocado": avocado,
    "bananas": bananas,
    "beetroot": beetroot,
    "bell peppers": bell_pepper,
    "blueberries": blueberries,
    "broccoli": broccoli,
    "cabbage": cabbage,
    "carrots": carrots,
}


def render_item(name: str) -> Image.Image:
    canvas = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    DRAWERS.get(name.lower(), apple)(canvas)
    return canvas.resize((OUT, OUT), Image.Resampling.LANCZOS)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    with INPUT_CSV.open("r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        for i, row in enumerate(r):
            if i >= LIMIT:
                break
            rows.append(row)

    with MANIFEST.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["rank", "category", "item", "slug", "png_path"])
        for row in rows:
            item = row["item"]
            slug = slugify(item)
            out = OUT_DIR / f"{slug}.png"
            render_item(item).save(out, "PNG")
            w.writerow([row["rank"], row["category"], item, slug, str(out)])

    print(f"Generated {len(rows)} PNG icons in {OUT_DIR}")
    print(f"Manifest: {MANIFEST}")


if __name__ == "__main__":
    main()
