"""Dựng tài liệu hướng dẫn sử dụng (.docx) từ Markdown nguồn và ảnh chụp.

Cách dùng (xem tools/huong-dan/README.md):
  python dung-word.py --nguon docs/huong-dan/tai-lieu/nguoi-du-thi.md --anh huong-dan-word/anh \
      --ra huong-dan-word/HuongDan-NguoiDuThi-v0.5.3.docx --phien-ban 0.5.3 --ngay 25/11/2026

Markdown nguồn dùng một tập con: `#` tiêu đề tài liệu, `##` chương, `###` mục, `####` mục nhỏ; đoạn văn; `- ` gạch đầu dòng;
`1. ` bước đánh số; `> **Mẹo:** ...` khung nổi bật (Mẹo, Lưu ý, Quan trọng, Cảnh báo); bảng dạng `| a | b |`; khối mã ```;
ảnh `![Mô tả](anh:thư-mục/tên)` (chú thích số lấy từ manifest.json do bộ chụp ảnh ghi); `**đậm**` và `` `mã` `` trong dòng.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image, ImageDraw

TEAL = RGBColor(0x0F, 0x6E, 0x5A)
INK = RGBColor(0x1F, 0x29, 0x37)
MUTED = RGBColor(0x5B, 0x65, 0x70)
RED = RGBColor(0xD9, 0x2D, 0x20)
FONT = "Calibri"
CONTENT_WIDTH_CM = 16.6
CALLOUT = {  # từ khóa: (màu nền, màu viền)
    "Mẹo": ("E6F4F1", "0F6E5A"),
    "Lưu ý": ("EAF1FB", "2F6FB5"),
    "Quan trọng": ("FFF4E0", "C77700"),
    "Cảnh báo": ("FDEBEA", "D92D20"),
}
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"


# ---------- tiện ích XML ----------
# Thứ tự phần tử con của <w:tcPr> do chuẩn OOXML quy định; sai thứ tự thì Word có thể báo tệp lỗi.
TC_ORDER = ["cnfStyle", "tcW", "gridSpan", "hMerge", "vMerge", "tcBorders", "shd", "noWrap", "tcMar", "textDirection", "tcFitText", "vAlign", "hideMark"]


def tc_insert(pr, node):
    tag = node.tag.split("}")[1]
    rank = TC_ORDER.index(tag)
    for child in list(pr):
        if child.tag.split("}")[1] in TC_ORDER and TC_ORDER.index(child.tag.split("}")[1]) > rank:
            child.addprevious(node)
            return
    pr.append(node)


def shade(cell, fill: str):
    node = OxmlElement("w:shd")
    node.set(qn("w:val"), "clear")
    node.set(qn("w:color"), "auto")
    node.set(qn("w:fill"), fill)
    tc_insert(cell._tc.get_or_add_tcPr(), node)


def cell_borders(cell, **edges):
    borders = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        spec = edges.get(edge)
        node = OxmlElement(f"w:{edge}")
        if spec:
            node.set(qn("w:val"), "single")
            node.set(qn("w:sz"), str(spec[0]))
            node.set(qn("w:space"), "0")
            node.set(qn("w:color"), spec[1])
        else:
            node.set(qn("w:val"), "nil")
        borders.append(node)
    tc_insert(cell._tc.get_or_add_tcPr(), borders)


def cell_margins(cell, top=80, bottom=80, left=140, right=140):
    margins = OxmlElement("w:tcMar")
    for name, value in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        node = OxmlElement(f"w:{name}")
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")
        margins.append(node)
    tc_insert(cell._tc.get_or_add_tcPr(), margins)


def keep_with_next(par, on=True):
    par.paragraph_format.keep_with_next = on


def add_field(run, instruction: str):
    for kind, text in (("begin", None), (None, instruction), ("separate", None), (None, "1"), ("end", None)):
        if kind:
            fld = OxmlElement("w:fldChar")
            fld.set(qn("w:fldCharType"), kind)
            run._r.append(fld)
        elif text == instruction:
            node = OxmlElement("w:instrText")
            node.set(qn("xml:space"), "preserve")
            node.text = instruction
            run._r.append(node)
        else:
            node = OxmlElement("w:t")
            node.text = text
            run._r.append(node)


# ---------- định dạng chung ----------
def style_font(style, name=FONT, size=None, bold=None, color=None):
    style.font.name = name
    style.element.rPr.rFonts.set(qn("w:eastAsia"), name)
    style.element.rPr.rFonts.set(qn("w:cs"), name)
    if size:
        style.font.size = Pt(size)
    if bold is not None:
        style.font.bold = bold
    if color is not None:
        style.font.color.rgb = color


def setup(document: Document, doi_tuong: str, phien_ban: str):
    section = document.sections[0]
    section.orientation = WD_ORIENT.PORTRAIT
    section.page_width, section.page_height = Cm(21.0), Cm(29.7)
    section.left_margin = section.right_margin = Cm(2.2)
    section.top_margin, section.bottom_margin = Cm(2.2), Cm(2.0)
    section.different_first_page_header_footer = True

    styles = document.styles
    style_font(styles["Normal"], size=11, color=INK)
    styles["Normal"].paragraph_format.space_after = Pt(6)
    styles["Normal"].paragraph_format.line_spacing = 1.18
    for name, size, before, after in (("Heading 1", 21, 0, 10), ("Heading 2", 15, 16, 6), ("Heading 3", 12.5, 12, 4)):
        style_font(styles[name], size=size, bold=True, color=TEAL)
        styles[name].paragraph_format.space_before = Pt(before)
        styles[name].paragraph_format.space_after = Pt(after)
        styles[name].paragraph_format.keep_with_next = True
    style_font(styles["Title"], size=30, bold=True, color=TEAL)
    style_font(styles["List Bullet"], size=11, color=INK)
    styles["List Bullet"].paragraph_format.space_after = Pt(3)

    header = section.header.paragraphs[0]
    header.text = f"BLUni Exam · Hướng dẫn dành cho {doi_tuong}"
    header.runs[0].font.size = Pt(9)
    header.runs[0].font.color.rgb = MUTED
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = footer.add_run(f"Phiên bản hệ thống {phien_ban}   ·   Trang ")
    r.font.size = Pt(9)
    r.font.color.rgb = MUTED
    for instr in ("PAGE", None, "NUMPAGES"):
        run = footer.add_run(" / " if instr is None else "")
        run.font.size = Pt(9)
        run.font.color.rgb = MUTED
        if instr:
            add_field(run, instr)


def cover(document: Document, title: str, doi_tuong: str, phien_ban: str, ngay: str):
    for _ in range(5):
        document.add_paragraph()
    band = document.add_table(rows=1, cols=1)
    band.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = band.rows[0].cells[0]
    shade(cell, "0F6E5A")
    cell_margins(cell, 360, 360, 360, 360)
    p = cell.paragraphs[0]
    r = p.add_run("BLUni Exam")
    r.font.size, r.font.bold, r.font.color.rgb = Pt(34), True, RGBColor(0xFF, 0xFF, 0xFF)
    p2 = cell.add_paragraph()
    r2 = p2.add_run("Hệ thống thi trực tuyến · Trường Đại học Bạc Liêu")
    r2.font.size, r2.font.color.rgb = Pt(13), RGBColor(0xD6, 0xF0, 0xEA)
    for _ in range(3):
        document.add_paragraph()
    t = document.add_paragraph(style="Title")
    t.add_run(title.replace("Hướng dẫn sử dụng BLUni Exam dành cho ", "Hướng dẫn sử dụng\ndành cho "))
    sub = document.add_paragraph()
    rs = sub.add_run(f"Tài liệu dành cho {doi_tuong}")
    rs.font.size, rs.font.color.rgb, rs.font.bold = Pt(15), INK, True
    info = document.add_paragraph()
    ri = info.add_run(f"Phiên bản hệ thống {phien_ban}  ·  Cập nhật ngày {ngay}")
    ri.font.size, ri.font.color.rgb = Pt(11), MUTED
    for _ in range(6):
        document.add_paragraph()
    note = document.add_paragraph()
    rn = note.add_run("Tài liệu lưu hành nội bộ. Hình ảnh dùng dữ liệu mẫu, không phải dữ liệu thật của người dùng.")
    rn.font.size, rn.font.color.rgb, rn.italic = Pt(9.5), MUTED, True
    document.add_page_break()


def table_of_contents(document: Document):
    h = document.add_paragraph()
    r = h.add_run("Mục lục")
    r.font.size, r.font.bold, r.font.color.rgb = Pt(21), True, TEAL
    par = document.add_paragraph()
    add_field(par.add_run(), 'TOC \\o "1-3" \\h \\z \\u')
    hint = document.add_paragraph()
    rh = hint.add_run("Nếu mục lục chưa hiện số trang: bấm chuột phải vào mục lục, chọn Cập nhật trường (Update Field), rồi chọn Cập nhật toàn bộ mục lục.")
    rh.font.size, rh.font.color.rgb, rh.italic = Pt(9), MUTED, True
    document.add_page_break()


# ---------- nội dung ----------
INLINE = re.compile(r"(\*\*.+?\*\*|`.+?`)")


def add_inline(paragraph, text: str, size=None, color=None, bold_all=False):
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            run = paragraph.add_run(part[2:-2])
            run.bold = True
        elif part.startswith("`") and part.endswith("`"):
            run = paragraph.add_run(part[1:-1])
            run.font.name = "Consolas"
            run._r.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
            run.font.color.rgb = RGBColor(0x8A, 0x2B, 0x0F)
        else:
            run = paragraph.add_run(part)
            if bold_all:
                run.bold = True
        if size:
            run.font.size = Pt(size)
        if color is not None and not (part.startswith("`")):
            run.font.color.rgb = color
    return paragraph


def add_callout(document: Document, lines: list[str]):
    text = " ".join(lines)
    m = re.match(r"\*\*(Mẹo|Lưu ý|Quan trọng|Cảnh báo):\*\*\s*(.*)", text)
    kind, body = (m.group(1), m.group(2)) if m else ("Lưu ý", text)
    fill, edge = CALLOUT[kind]
    table = document.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.rows[0].cells[0]
    shade(cell, fill)
    cell_borders(cell, left=(36, edge))
    cell_margins(cell, 100, 100, 180, 160)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    label = p.add_run(f"{kind}: ")
    label.bold = True
    label.font.color.rgb = RGBColor.from_string(edge)
    add_inline(p, body)
    document.add_paragraph().paragraph_format.space_after = Pt(2)


def add_table(document: Document, rows: list[list[str]]):
    cols = len(rows[0])
    table = document.add_table(rows=len(rows), cols=cols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    weights = [max(len(re.sub(r"[*`]", "", r[i])) for r in rows) for i in range(cols)]
    total = sum(min(w, 60) + 8 for w in weights)
    for i, row in enumerate(rows):
        for j, text in enumerate(row):
            cell = table.rows[i].cells[j]
            cell.width = Cm(CONTENT_WIDTH_CM * (min(weights[j], 60) + 8) / total)
            cell_margins(cell, 60, 60, 100, 100)
            par = cell.paragraphs[0]
            par.paragraph_format.space_after = Pt(0)
            add_inline(par, text, size=10, bold_all=(i == 0))
            if i == 0:
                shade(cell, "D6F0EA")
    if len(rows) > 1:
        pr = table.rows[0]._tr.get_or_add_trPr()
        head = OxmlElement("w:tblHeader")
        pr.append(head)
    document.add_paragraph().paragraph_format.space_after = Pt(2)


def phone_frame(path: Path, out: Path):
    """Đặt ảnh chụp điện thoại vào khung máy (viền đen bo góc) cho sinh động."""
    shot = Image.open(path).convert("RGB")
    pad, radius = 26, 54
    canvas = Image.new("RGBA", (shot.width + pad * 2, shot.height + pad * 2 + 8), (255, 255, 255, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((0, 0, canvas.width - 1, canvas.height - 1), radius=radius, fill=(31, 41, 55, 255))
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, shot.width - 1, shot.height - 1), radius=radius - 22, fill=255)
    canvas.paste(shot, (pad, pad + 4), mask)
    draw.rounded_rectangle((canvas.width // 2 - 60, 8, canvas.width // 2 + 60, 18), radius=5, fill=(75, 85, 99, 255))
    canvas.save(out)


def add_image(document: Document, alt: str, ref: str, anh_dir: Path, manifest: dict, counter: list[int], tmp: Path):
    rel = ref.removeprefix("anh:")
    path = anh_dir / f"{rel}.png"
    if not path.exists():
        raise SystemExit(f"Thiếu ảnh: {path}")
    counter[0] += 1
    phone = rel.startswith("nguoi-du-thi/")
    use = path
    if phone:
        use = tmp / f"khung-{rel.replace('/', '_')}.png"
        phone_frame(path, use)
    width_px, height_px = Image.open(use).size
    max_w, max_h = (6.4 if phone else CONTENT_WIDTH_CM), (17.5 if phone else 21.0)
    w = max_w
    if height_px / width_px * w > max_h:
        w = max_h * width_px / height_px
    par = document.add_paragraph()
    par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    par.paragraph_format.space_before = Pt(6)
    par.paragraph_format.space_after = Pt(2)
    keep_with_next(par)
    shape = par.add_run().add_picture(str(use), width=Cm(w))
    shape._inline.docPr.set("descr", alt)
    shape._inline.docPr.set("name", f"Hình {counter[0]}")
    cap = document.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(2)
    rc = cap.add_run(f"Hình {counter[0]}. {alt}")
    rc.italic, rc.font.size, rc.font.color.rgb = True, Pt(9.5), MUTED
    marks = manifest.get(f"{rel}.png", [])
    if marks:
        keep_with_next(cap)
        for i, mark in enumerate(marks):
            line = document.add_paragraph()
            line.paragraph_format.left_indent = Cm(0.9 if not phone else 3.2)
            line.paragraph_format.space_after = Pt(0)
            tag = line.add_run((CIRCLED[i] if i < len(CIRCLED) else f"({i + 1})") + "  ")
            tag.bold, tag.font.color.rgb, tag.font.size = True, RED, Pt(11)
            add_inline(line, mark, size=10)
        document.add_paragraph().paragraph_format.space_after = Pt(4)


def build(args):
    source = Path(args.nguon).read_text(encoding="utf8").splitlines()
    anh_dir = Path(args.anh)
    manifest: dict[str, list[str]] = {}
    manifest_file = anh_dir / "manifest.json"
    if manifest_file.exists():
        for line in manifest_file.read_text(encoding="utf8").splitlines():
            if line.strip():
                entry = json.loads(line)
                manifest[entry["file"]] = [m["text"] for m in entry["marks"]]
    title = next(l[2:].strip() for l in source if l.startswith("# "))
    doi_tuong = next((re.search(r"doi-tuong:\s*(.+?)\s*-->", l).group(1) for l in source if "doi-tuong:" in l), "người dùng")
    tmp = Path(args.ra).parent / "_tam"
    tmp.mkdir(parents=True, exist_ok=True)

    document = Document()
    zoom = document.settings.element.find(qn("w:zoom"))
    if zoom is not None and zoom.get(qn("w:percent")) is None:
        zoom.set(qn("w:percent"), "100")
    update = OxmlElement("w:updateFields")
    update.set(qn("w:val"), "true")
    # updateFields phải đứng trước hdrShapeDefaults/footnotePr/endnotePr/compat theo lược đồ OOXML.
    anchor = next((document.settings.element.find(qn(t)) for t in ("w:hdrShapeDefaults", "w:footnotePr", "w:endnotePr", "w:compat") if document.settings.element.find(qn(t)) is not None), None)
    if anchor is not None:
        anchor.addprevious(update)
    else:
        document.settings.element.append(update)
    setup(document, doi_tuong, args.phien_ban)
    cover(document, title, doi_tuong, args.phien_ban, args.ngay)
    table_of_contents(document)

    counter = [0]
    first_chapter = True
    i = 0
    while i < len(source):
        line = source[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("<!--") or line.startswith("# "):
            i += 1
        elif line.startswith("## "):
            if not first_chapter:
                document.add_page_break()
            first_chapter = False
            document.add_heading(line[3:].strip(), level=1)
            i += 1
        elif line.startswith("### "):
            document.add_heading(line[4:].strip(), level=2)
            i += 1
        elif line.startswith("#### "):
            document.add_heading(line[5:].strip(), level=3)
            i += 1
        elif stripped.startswith("```"):
            i += 1
            block = []
            while i < len(source) and not source[i].strip().startswith("```"):
                block.append(source[i])
                i += 1
            i += 1
            table = document.add_table(rows=1, cols=1)
            cell = table.rows[0].cells[0]
            shade(cell, "F3F4F6")
            cell_margins(cell, 120, 120, 160, 160)
            for n, code in enumerate(block):
                par = cell.paragraphs[0] if n == 0 else cell.add_paragraph()
                par.paragraph_format.space_after = Pt(0)
                run = par.add_run(code)
                run.font.name = "Consolas"
                run._r.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
                run.font.size = Pt(8.5)
            document.add_paragraph().paragraph_format.space_after = Pt(2)
        elif stripped.startswith(">"):
            block = []
            while i < len(source) and source[i].strip().startswith(">"):
                block.append(source[i].strip().lstrip(">").strip())
                i += 1
            add_callout(document, block)
        elif stripped.startswith("!["):
            m = re.match(r"!\[(.*?)\]\((anh:[^)]+)\)", stripped)
            add_image(document, m.group(1), m.group(2), anh_dir, manifest, counter, tmp)
            i += 1
        elif stripped.startswith("|"):
            rows = []
            while i < len(source) and source[i].strip().startswith("|"):
                cells = [c.strip() for c in source[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            add_table(document, rows)
        elif re.match(r"^\s*[-*] ", line):
            while i < len(source) and re.match(r"^\s*[-*] ", source[i]):
                indent = len(source[i]) - len(source[i].lstrip())
                par = document.add_paragraph(style="List Bullet")
                if indent >= 2:
                    par.paragraph_format.left_indent = Cm(1.3)
                add_inline(par, re.sub(r"^\s*[-*] ", "", source[i]))
                i += 1
        elif re.match(r"^\d+\. ", stripped):
            while i < len(source) and re.match(r"^\d+\. ", source[i].strip()):
                number, body = source[i].strip().split(". ", 1)
                par = document.add_paragraph()
                par.paragraph_format.left_indent = Cm(0.9)
                par.paragraph_format.first_line_indent = Cm(-0.7)
                par.paragraph_format.space_after = Pt(3)
                par.paragraph_format.tab_stops.add_tab_stop(Cm(0.9))
                num = par.add_run(f"{number}.\t")
                num.bold, num.font.color.rgb = True, TEAL
                add_inline(par, body)
                i += 1
        else:
            par = document.add_paragraph()
            parts = [stripped]
            i += 1
            while i < len(source) and source[i].strip() and not re.match(r"^(#|>|\||!\[|```|\s*[-*] |\d+\. )", source[i].strip()):
                parts.append(source[i].strip())
                i += 1
            add_inline(par, " ".join(parts))

    out = Path(args.ra)
    out.parent.mkdir(parents=True, exist_ok=True)
    document.core_properties.title = title
    document.core_properties.author = "BLUni Exam"
    document.core_properties.subject = f"Hướng dẫn dành cho {doi_tuong}, phiên bản {args.phien_ban}"
    document.save(out)
    print(f"{out}: {counter[0]} hình, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--nguon", required=True)
    parser.add_argument("--anh", required=True)
    parser.add_argument("--ra", required=True)
    parser.add_argument("--phien-ban", required=True)
    parser.add_argument("--ngay", required=True)
    build(parser.parse_args())
