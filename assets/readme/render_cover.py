"""Render the original TerpPlan GitHub cover. Requires Pillow; no web fonts or remote assets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SCALE = 2
SIZE = (1600, 800)
C = {"paper": "#f5f3ef", "ink": "#243c35", "muted": "#68766e", "rule": "#dcded4", "brick": "#a34a39", "white": "#fffefa", "green": "#e0eadd", "blue": "#e1e7f0", "rose": "#f2e0d8", "gold": "#efe7cc"}
im = Image.new("RGB", tuple(n * SCALE for n in SIZE), C["paper"])
d = ImageDraw.Draw(im)

def font(size, serif=False, bold=False):
    windows = Path("C:/Windows/Fonts")
    name = ("georgiab.ttf" if bold else "georgia.ttf") if serif else ("segoeuib.ttf" if bold else "segoeui.ttf")
    candidates = [windows / name, Path("/usr/share/fonts/truetype/dejavu") / (("DejaVuSerif-Bold.ttf" if bold else "DejaVuSerif.ttf") if serif else ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"))]
    return ImageFont.truetype(str(next(p for p in candidates if p.exists())), size * SCALE)

def text(x, y, value, size=20, color="ink", serif=False, bold=False):
    d.text((x * SCALE, y * SCALE), value, font=font(size, serif, bold), fill=C.get(color, color), stroke_width=0)

def line(points, fill="rule", width=1):
    d.line([(x * SCALE, y * SCALE) for x, y in points], fill=C.get(fill, fill), width=width * SCALE)

def rect(box, fill, radius=0, outline=None, width=1):
    args = dict(fill=C.get(fill, fill), outline=C.get(outline, outline) if outline else None, width=width * SCALE)
    box = tuple(v * SCALE for v in box)
    if radius:
        d.rounded_rectangle(box, radius * SCALE, **args)
    else:
        d.rectangle(box, **args)

def track(x, y, value, size=13, color="muted", spacing=2.4):
    f = font(size, bold=True)
    for ch in value:
        d.text((x * SCALE, y * SCALE), ch, font=f, fill=C[color])
        x += d.textlength(ch, font=f) / SCALE + spacing

rect((24, 24, 1576, 776), "paper", radius=4, outline="rule")
rect((80, 64, 134, 118), "ink", radius=13)
text(96, 66, "T", 36, "white", serif=True)
text(151, 65, "TerpPlan", 36, serif=True)
track(1131, 82, "BUILT FOR UMD STUDENTS", size=12, spacing=1.6)
line([(80, 151), (1520, 151)])

track(80, 204, "MAKE ROOM FOR WHAT MATTERS", color="brick", size=13, spacing=2)
text(76, 252, "Your week, in balance.", 56, serif=True)
text(76, 329, "Your degree, in view.", 56, serif=True)
text(81, 434, "Course planning, from your first search", 23, "muted")
text(81, 470, "to the semesters ahead.", 23, "muted")
line([(81, 541), (151, 541)], "brick", 3)
text(81, 568, "Free to plan. Built around your life.", 19, "ink")

# An editorial illustration of the product's two planning scales, not a screenshot.
rect((872, 195, 1520, 605), "#ebede5", 20)
rect((893, 212, 1501, 438), "white", 13, "rule")
track(915, 228, "A WEEK THAT FITS", size=11, spacing=1.6)
for i, day in enumerate(["MON", "TUE", "WED", "THU", "FRI"]):
    x = 916 + i * 112
    text(x + 34, 262, day, 10, "muted", bold=True)
    rect((x, 284, x + 98, 419), "paper", 7)
    for y in [319, 354, 389]:
        line([(x + 6, y), (x + 92, y)], "#e9e7df")
for col, y, end, name, shade in [(0, 293, 338, "CMSC216", "blue"), (2, 293, 338, "CMSC216", "blue"), (4, 293, 338, "CMSC216", "blue"), (1, 325, 376, "MATH240", "green"), (3, 325, 376, "MATH240", "green"), (0, 363, 406, "ENGL101", "rose"), (2, 363, 406, "ENGL101", "rose")]:
    x = 922 + col * 112
    rect((x, y, x + 86, end), shade, 5)
    text(x + 7, y + 13, name, 10, bold=True)

track(916, 462, "A PATH THROUGH YOUR DEGREE", size=11, spacing=1.5)
line([(940, 512), (1454, 512)], "#b3c5b4", 2)
for i in range(4):
    x = 916 + i * 142
    rect((x, 493, x + 128, 580), "white", 8, "rule")
    text(x + 13, 504, f"YEAR 0{i+1}", 11, "muted", bold=True)
    for j, (length, shade) in enumerate([(86, "green"), (67, "blue"), (i * 7 + 48, "gold")]):
        rect((x + 13, 531 + j * 12, x + 13 + length, 537 + j * 12), shade, 3)

line([(80, 655), (1520, 655)])
for x, number, heading, detail in [(80, "01", "Build your week", "Schedules that fit your commitments"), (585, "02", "See the path", "Requirements, mapped across terms"), (1090, "03", "Be ready", "Seat alerts and registration tools")]:
    text(x, 682, number, 14, "brick", bold=True)
    text(x + 38, 675, heading, 24, serif=True)
    text(x + 38, 714, detail, 15, "muted")

im = im.resize(SIZE, Image.Resampling.LANCZOS)
im.save(HERE / "cover.png", optimize=True)
print(HERE / "cover.png")
