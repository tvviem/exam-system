"""Ghép nhiều ảnh thành một bảng xem nhanh (để rà ảnh chụp hướng dẫn): python bang-xem.py ra.png ảnh1.png ảnh2.png ..."""
import os
import sys
from PIL import Image, ImageDraw

out, files = sys.argv[1], sys.argv[2:]
cols = int(os.environ.get('COLS', 3 if len(files) > 4 else 2))
cell_w = int(os.environ.get('CELL_W', 640))
max_h = int(os.environ.get('MAX_H', 520))
thumbs = []
for f in files:
    im = Image.open(f).convert("RGB")
    h = int(im.height * cell_w / im.width)
    h = min(h, max_h)
    thumbs.append((f, im.resize((cell_w, int(im.height * cell_w / im.width))).crop((0, 0, cell_w, h))))
rows = (len(thumbs) + cols - 1) // cols
row_h = [max(t[1].height for t in thumbs[r * cols:(r + 1) * cols]) + 24 for r in range(rows)]
sheet = Image.new("RGB", (cols * (cell_w + 12) + 12, sum(row_h) + 12), "#dddddd")
draw = ImageDraw.Draw(sheet)
y = 12
for r in range(rows):
    for c in range(cols):
        i = r * cols + c
        if i >= len(thumbs):
            break
        name, im = thumbs[i]
        x = 12 + c * (cell_w + 12)
        draw.text((x, y), name.split("/")[-1], fill="#111111")
        sheet.paste(im, (x, y + 16))
    y += row_h[r]
sheet.save(out)
