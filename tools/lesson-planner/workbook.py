"""Read a lesson reference and clone only KHGDCN, without rewriting its styles.

Only the Python standard library is required. Worksheet data is written directly
to OOXML so the original row geometry, styles, merges and logo remain intact.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import BytesIO
import posixpath
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET

S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
P = "http://schemas.openxmlformats.org/package/2006/relationships"
C = "http://schemas.openxmlformats.org/package/2006/content-types"
ET.register_namespace("", S)
ET.register_namespace("r", R)
MAX_UPLOAD = 30 * 1024 * 1024


class InputError(ValueError):
    pass


def tag(name: str) -> str:
    return f"{{{S}}}{name}"


def normalized(value: str) -> str:
    return "".join(unicodedata.normalize("NFC", value).casefold().split())


def plain(value) -> str:
    return "" if value is None else str(value)


def xml(data: bytes) -> ET.Element:
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise InputError("Tệp XML có khai báo không được hỗ trợ.")
    return ET.fromstring(data)


def address(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"([A-Z]+)([1-9][0-9]*)", value)
    if not match:
        raise InputError("Địa chỉ ô không hợp lệ trong mẫu.")
    col = 0
    for char in match[1]:
        col = col * 26 + ord(char) - 64
    return int(match[2]), col


def cell_value(cell: ET.Element, strings: list[str], dates: set[int], epoch: datetime):
    kind = cell.get("t")
    if kind == "inlineStr":
        return "".join(x.text or "" for x in cell.iter(tag("t")))
    raw = cell.findtext(tag("v"))
    if raw is None or kind == "e":
        return ""
    if kind == "s":
        return strings[int(raw)]
    if kind in ("str", "d"):
        return raw
    if kind == "b":
        return raw == "1"
    number = float(raw)
    if int(cell.get("s", "0")) in dates:
        return (epoch + timedelta(days=number)).strftime("%Y-%m-%d")
    return int(number) if number.is_integer() else number


def read_cells(root, strings, dates, epoch) -> dict[str, object]:
    return {c.get("r"): cell_value(c, strings, dates, epoch)
            for c in root.findall(f"{tag('sheetData')}/{tag('row')}/{tag('c')}")}


def merge_values(root, values: dict[str, object], max_col: int = 6) -> dict[str, object]:
    result = dict(values)
    for merge in root.findall(f"{tag('mergeCells')}/{tag('mergeCell')}"):
        first, last = merge.get("ref").split(":")
        start_row, start_col = address(first)
        end_row, end_col = address(last)
        if end_row - start_row > 10000:
            raise InputError("Vùng gộp ô quá lớn trong bảng tham khảo.")
        for row in range(start_row, end_row + 1):
            for col in range(start_col, min(end_col, max_col) + 1):
                result[f"{chr(64 + col)}{row}"] = values.get(first, "")
    return result


@dataclass(frozen=True)
class Score:
    id: str
    label: str
    source: str
    value: str | int | float
    criteria: str
    row: int
    date_like: bool


@dataclass(frozen=True)
class Lesson:
    code: str
    name: str
    objective: str
    instruction: str
    row: int
    scores: tuple[Score, ...]


@dataclass(frozen=True)
class PlannedLesson:
    lesson: Lesson
    score: Score


@dataclass(frozen=True)
class Child:
    name: str
    age: str
    teacher: str
    manager: str
    period: str
    lessons: tuple[PlannedLesson, ...]


def score_value(code: str, raw):
    text = plain(raw).strip()
    prefix = normalized(code) + "."
    value = normalized(text)
    suffix = value[len(prefix):] if value.startswith(prefix) else ""
    if re.fullmatch(r"\d+(?:\.\d+)?", suffix):
        number = float(suffix)
        return int(number) if number.is_integer() else number
    return raw if isinstance(raw, (int, float)) else text


class Template:
    def __init__(self, data: bytes):
        try:
            self._read(data)
        except InputError:
            raise
        except (zipfile.BadZipFile, ET.ParseError, KeyError, ValueError, IndexError,
                TypeError, OverflowError) as exc:
            raise InputError("Không đọc được mẫu .xlsx. Hãy chọn workbook Excel hợp lệ.") from exc

    def _read(self, data: bytes):
        if len(data) > MAX_UPLOAD:
            raise InputError("Mẫu vượt quá giới hạn 30 MB.")
        with zipfile.ZipFile(BytesIO(data)) as archive:
            members = archive.infolist()
            if len(members) > 5000 or sum(x.file_size for x in members) > 150 * 1024 * 1024:
                raise InputError("Workbook có quá nhiều dữ liệu giải nén.")
            if any(x.flag_bits & 1 for x in members):
                raise InputError("Không hỗ trợ workbook có mật khẩu.")
            if len({x.filename for x in members}) != len(members):
                raise InputError("Workbook chứa các phần trùng tên.")
            self.parts = {x.filename: archive.read(x) for x in members}
        if "xl/vbaProject.bin" in self.parts:
            raise InputError("Chỉ hỗ trợ .xlsx không chứa macro.")
        workbook = xml(self.parts["xl/workbook.xml"])
        relations = xml(self.parts["xl/_rels/workbook.xml.rels"])
        targets = {r.get("Id"): posixpath.normpath("xl/" + r.get("Target").lstrip("/"))
                   if not r.get("Target", "").startswith("/") else r.get("Target").lstrip("/")
                   for r in relations}
        sheets = {normalized(s.get("name")): targets[s.get(f"{{{R}}}id")]
                  for s in workbook.find(tag("sheets"))}
        if "khgdcn" not in sheets or "kodcxoa" not in sheets:
            raise InputError("Mẫu phải có hai sheet KHGDCN và Ko dc xoa.")
        self.sheet_path = sheets["khgdcn"]
        self.sheet = xml(self.parts[self.sheet_path])
        reference = xml(self.parts[sheets["kodcxoa"]])
        strings = []
        if "xl/sharedStrings.xml" in self.parts:
            strings = ["".join(t.text or "" for t in si.iter(tag("t")))
                       for si in xml(self.parts["xl/sharedStrings.xml"])]
        styles = xml(self.parts["xl/styles.xml"])
        formats = {int(f.get("numFmtId")): f.get("formatCode", "")
                   for f in styles.findall(f"{tag('numFmts')}/{tag('numFmt')}")}
        dates = set()
        for i, style in enumerate(styles.find(tag("cellXfs"))):
            fmt = int(style.get("numFmtId", "0"))
            code = re.sub(r'"[^"]*"|\[[^\]]*\]|\\.', "", formats.get(fmt, ""))
            if fmt in range(14, 23) or fmt in range(45, 48) or re.search(r"[yd]", code, re.I):
                dates.add(i)
        props = workbook.find(tag("workbookPr"))
        epoch = datetime(1904, 1, 1) if props is not None and props.get("date1904") == "1" else datetime(1899, 12, 30)
        self.values = read_cells(self.sheet, strings, dates, epoch)
        raw = read_cells(reference, strings, dates, epoch)
        expanded = merge_values(reference, raw)
        expected = ["Bài số", "Tên bài", "Mục tiêu của bài", "Hướng dẫn", "Điểm cần đạt", "Tiêu chí cần đạt"]
        if any(normalized(plain(self.values.get(f"{chr(65+i)}8"))) != normalized(v)
               for i, v in enumerate(expected)):
            raise InputError("KHGDCN không có đúng cột A:F tại hàng 8 của mẫu.")
        reference_headers = ["Bài số", "Tên bài", "Mục tiêu và hướng dẫn", "Thang điểm", "Cách chấm điểm", "Hướng dẫn"]
        if any(normalized(plain(raw.get(f"{chr(65+i)}2"))) != normalized(v)
               for i, v in enumerate(reference_headers)):
            raise InputError("Ko dc xoa không có đúng cột A:F tại hàng 2.")
        self.warnings = []
        groups = []
        current = None
        max_row = max(address(a)[0] for a in raw)
        self.reference_rows = []
        for row in range(3, max_row + 1):
            vals = [plain(expanded.get(f"{c}{row}")).strip() for c in "ABCDEF"]
            original_code = plain(raw.get(f"A{row}")).strip()
            if normalized(original_code) in ("số", "bàisố", "stt"):
                current = None
                continue
            if original_code:
                current = {"code": original_code, "name": vals[1], "objective": vals[2],
                           "instruction": vals[5], "row": row, "scores": []}
                groups.append(current)
            if any(vals):
                self.reference_rows.append(dict(zip(("code", "name", "objective", "score", "criteria", "instruction"), vals), row=row))
            if current is None or not vals[3]:
                continue
            source = vals[3]
            if any(normalized(s.source) == normalized(source) for s in current["scores"]):
                continue
            value = score_value(current["code"], expanded.get(f"D{row}", ""))
            current["scores"].append(Score(str(row), plain(value), source, value,
                                            vals[4], row, bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", source))))
        self.lessons = {}
        duplicates = 0
        for group in groups:
            lesson = Lesson(**{**group, "scores": tuple(group["scores"])})
            key = normalized(lesson.code)
            if key in self.lessons:
                duplicates += 1
            else:
                self.lessons[key] = lesson
        if not self.lessons:
            raise InputError("Bảng tham khảo không có bài học.")
        if duplicates:
            self.warnings.append(f"{duplicates} mã bài lặp trong tham khảo. Dùng lần xuất hiện đầu tiên như VLOOKUP của mẫu; bảng tham khảo vẫn hiển thị mọi hàng.")
        date_count = sum(s.date_like for l in self.lessons.values() for s in l.scores)
        if date_count:
            self.warnings.append(f"{date_count} thang điểm được Excel lưu thành ngày. Giữ ngày gốc, không tự suy đoán thành khoảng điểm.")
        unscored = sum(not l.scores for l in self.lessons.values())
        if unscored:
            self.warnings.append(f"{unscored} bài không có thang điểm. Chỉ tham khảo, không thể đưa vào kế hoạch khi chưa sửa mẫu.")
        blocked = set()
        for merge in self.sheet.findall(f"{tag('mergeCells')}/{tag('mergeCell')}"):
            first, last = merge.get("ref").split(":")
            r1, c1 = address(first)
            r2, c2 = address(last)
            if r2 > 10000:
                raise InputError("Mẫu có quá nhiều hàng gộp.")
            if c1 <= 6:
                for r in range(max(9, r1), r2 + 1):
                    if r != r1 or c2 > c1:
                        blocked.add(r)
        last = max(address(a)[0] for a in self.values)
        self.slots = tuple(r for r in range(9, last + 1) if r not in blocked)
        if not self.slots:
            raise InputError("Mẫu không có hàng trống để nhập bài học.")
        if blocked:
            self.warnings.append("Giữ nguyên các ô gộp của mẫu; bỏ qua hàng " + ", ".join(map(str, sorted(blocked))) + " khi ghi bài học.")
        self.assets = self._assets(self.sheet_path)

    def _assets(self, sheet_path: str) -> dict[str, bytes]:
        result = {}
        seen = set()

        def visit(path):
            if path in seen:
                return
            seen.add(path)
            rel_path = posixpath.join(posixpath.dirname(path), "_rels", posixpath.basename(path) + ".rels")
            if rel_path not in self.parts:
                return
            rels = xml(self.parts[rel_path])
            for relation in rels:
                kind = relation.get("Type", "").rsplit("/", 1)[-1]
                if relation.get("TargetMode") == "External" or kind not in ("drawing", "image"):
                    raise InputError("Mẫu KHGDCN chứa liên kết hoặc đối tượng không được hỗ trợ; chỉ hỗ trợ hình ảnh và logo.")
                target = posixpath.normpath(posixpath.join(posixpath.dirname(path), relation.get("Target")))
                if target not in self.parts or not target.startswith("xl/"):
                    raise InputError("Liên kết hình ảnh không hợp lệ trong mẫu.")
                result[target] = self.parts[target]
                visit(target)
            result[rel_path] = self.parts[rel_path]

        visit(sheet_path)
        return result

    def public(self):
        return {"lessons": [{"code": l.code, "name": l.name, "objective": l.objective,
                             "instruction": l.instruction, "row": l.row,
                             "scores": [s.__dict__ for s in l.scores]} for l in self.lessons.values()],
                "reference": self.reference_rows, "warnings": self.warnings,
                "capacity": len(self.slots),
                "defaults": {"teacher": plain(self.values.get("C7")), "manager": plain(self.values.get("F7"))},
                "center": plain(self.values.get("A1"))}


def field(obj: dict, key: str, required=False, limit=200) -> str:
    value = obj.get(key, "")
    if not isinstance(value, str) or len(value) > limit or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", value):
        raise InputError(f"Trường {key} không hợp lệ.")
    value = value.strip()
    if required and not value:
        raise InputError("Hãy nhập tên cho tất cả học sinh.")
    return value


def parse_children(payload: object, template: Template) -> tuple[Child, ...]:
    if not isinstance(payload, dict) or not isinstance(payload.get("children"), list):
        raise InputError("Dữ liệu kế hoạch không hợp lệ.")
    raw_children = payload["children"]
    if not 1 <= len(raw_children) <= 100:
        raise InputError("Một workbook cần từ 1 đến 100 học sinh.")
    children = []
    for raw in raw_children:
        if not isinstance(raw, dict):
            raise InputError("Dữ liệu học sinh không hợp lệ.")
        name = field(raw, "name", True)
        rows = raw.get("lessons")
        if not isinstance(rows, list) or not 1 <= len(rows) <= len(template.slots):
            raise InputError(f"{name}: cần từ 1 đến {len(template.slots)} bài học.")
        planned = []
        used = set()
        for index, row in enumerate(rows, 1):
            if not isinstance(row, dict) or not isinstance(row.get("code"), str) or not isinstance(row.get("scoreId"), str):
                raise InputError(f"{name}, bài {index}: cần chọn bài số và điểm cần đạt.")
            key = normalized(row["code"])
            if key not in template.lessons:
                raise InputError(f"{name}, bài {index}: bài số không có trong tham khảo.")
            if key in used:
                raise InputError(f"{name}: bài {template.lessons[key].code} bị lặp.")
            used.add(key)
            lesson = template.lessons[key]
            score = next((s for s in lesson.scores if s.id == row["scoreId"]), None)
            if score is None:
                raise InputError(f"{name}, bài {index}: điểm cần đạt không có trong thang điểm của bài.")
            planned.append(PlannedLesson(lesson, score))
        children.append(Child(name, field(raw, "age"), field(raw, "teacher"), field(raw, "manager"),
                              field(raw, "period"), tuple(planned)))
    return tuple(children)


def sheet_names(children: tuple[Child, ...]) -> list[str]:
    used = set()
    names = []
    for child in children:
        base = re.sub(r"[\[\]:*?/\\]", " ", child.name).strip().strip("'").strip()[:31] or "Học sinh"
        if base.casefold() == "history":
            base = "History_"
        name = base
        version = 2
        while name.casefold() in used:
            suffix = f" ({version})"
            name = base[:31-len(suffix)] + suffix
            version += 1
        used.add(name.casefold())
        names.append(name)
    return names


def write_value(cell: ET.Element, value):
    for node in list(cell):
        if node.tag in (tag("f"), tag("v"), tag("is")):
            cell.remove(node)
    cell.attrib.pop("t", None)
    if value is None or value == "":
        return
    if isinstance(value, bool):
        cell.set("t", "b")
        ET.SubElement(cell, tag("v")).text = "1" if value else "0"
    elif isinstance(value, (int, float)):
        ET.SubElement(cell, tag("v")).text = str(value)
    else:
        cell.set("t", "inlineStr")
        text = ET.SubElement(ET.SubElement(cell, tag("is")), tag("t"))
        text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        text.text = str(value)


def serialized(element):
    return ET.tostring(element, encoding="utf-8", xml_declaration=True)


def export_workbook(template: Template, children: tuple[Child, ...]) -> bytes:
    names = sheet_names(children)
    workbook = ET.Element(tag("workbook"))
    views = ET.SubElement(workbook, tag("bookViews"))
    ET.SubElement(views, tag("workbookView"), activeTab="0")
    sheets = ET.SubElement(workbook, tag("sheets"))
    relations = ET.Element(f"{{{P}}}Relationships")
    parts = {"xl/styles.xml": template.parts["xl/styles.xml"]}
    for kind, path in (("styles", "xl/styles.xml"), ("theme", "xl/theme/theme1.xml")):
        if path in template.parts:
            parts[path] = template.parts[path]
            ET.SubElement(relations, f"{{{P}}}Relationship", Id=kind, Type=f"{R}/{kind}", Target=path[3:])
    source_rel = posixpath.join(posixpath.dirname(template.sheet_path), "_rels", posixpath.basename(template.sheet_path) + ".rels")
    parts.update({p: data for p, data in template.assets.items() if p.startswith("xl/media/")})
    copied_types = {}
    for index, child in enumerate(children, 1):
        sheet_path = f"xl/worksheets/sheet{index}.xml"
        ET.SubElement(sheets, tag("sheet"), name=names[index-1], sheetId=str(index), **{f"{{{R}}}id": f"child{index}"})
        ET.SubElement(relations, f"{{{P}}}Relationship", Id=f"child{index}", Type=f"{R}/worksheet", Target=sheet_path[3:])
        root = deepcopy(template.sheet)
        # Excel's Ignorable attribute contains prefix names that ElementTree cannot
        # keep if unused. These optional revision attributes are not formatting.
        for node in root.iter():
            for attr in list(node.attrib):
                if attr.startswith("{http://schemas.openxmlformats.org/markup-compatibility/") or attr.startswith("{http://schemas.microsoft.com/office/spreadsheetml/"):
                    del node.attrib[attr]
        data = root.find(tag("sheetData"))
        cells = {c.get("r"): c for c in data.iter(tag("c"))}
        rows = {int(r.get("r")): r for r in data}
        for coord, cell in cells.items():
            row, _ = address(coord)
            write_value(cell, "" if row >= 9 else template.values.get(coord, ""))

        def set_cell(coord, value):
            if coord not in cells:
                row_no, col = address(coord)
                row = rows.get(row_no)
                if row is None:
                    row = ET.SubElement(data, tag("row"), r=str(row_no))
                    rows[row_no] = row
                cell = ET.Element(tag("c"), r=coord)
                before = next((i for i, c in enumerate(row) if address(c.get("r"))[1] > col), len(row))
                row.insert(before, cell)
                cells[coord] = cell
            write_value(cells[coord], value)

        for coord, value in (("C6", child.name), ("F6", child.age), ("C7", child.teacher),
                             ("F7", child.manager), ("G6", "Tháng / Tuần" + ("\n" + child.period if child.period else ""))):
            set_cell(coord, value)
        for row, planned in zip(template.slots, child.lessons):
            lesson, score = planned.lesson, planned.score
            for col, value in zip("ABCDEF", (lesson.code, lesson.name, lesson.objective,
                                            lesson.instruction, score.value, score.criteria)):
                set_cell(f"{col}{row}", value)
        for view in root.findall(f"{tag('sheetViews')}/{tag('sheetView')}"):
            view.attrib.pop("tabSelected", None)
            view.set("topLeftCell", "A1")
            for selection in view.findall(tag("selection")):
                selection.set("activeCell", "A9")
                selection.set("sqref", "A9")
        parts[sheet_path] = serialized(root)
        if source_rel in template.assets:
            # Each worksheet gets its own drawing part. Image bytes can be shared.
            mapping = {p: posixpath.join(posixpath.dirname(p), f"child{index}_" + posixpath.basename(p))
                       for p in template.assets if p != source_rel and "/_rels/" not in p and not p.startswith("xl/media/")}
            for old_path, new_path in mapping.items():
                parts[new_path] = template.assets[old_path]
                copied_types[new_path] = old_path
            for old_path in [template.sheet_path, *mapping]:
                old_rel = posixpath.join(posixpath.dirname(old_path), "_rels", posixpath.basename(old_path) + ".rels")
                if old_rel not in template.assets:
                    continue
                new_path = sheet_path if old_path == template.sheet_path else mapping[old_path]
                new_rel = posixpath.join(posixpath.dirname(new_path), "_rels", posixpath.basename(new_path) + ".rels")
                rels = xml(template.assets[old_rel])
                for relation in rels:
                    target = posixpath.normpath(posixpath.join(posixpath.dirname(old_path), relation.get("Target")))
                    relation.set("Target", posixpath.relpath(mapping.get(target, target), posixpath.dirname(new_path)))
                parts[new_rel] = serialized(rels)
    parts["xl/workbook.xml"] = serialized(workbook)
    parts["xl/_rels/workbook.xml.rels"] = serialized(relations)
    package_rels = ET.Element(f"{{{P}}}Relationships")
    ET.SubElement(package_rels, f"{{{P}}}Relationship", Id="workbook", Type=f"{R}/officeDocument", Target="xl/workbook.xml")
    parts["_rels/.rels"] = serialized(package_rels)
    original_types = xml(template.parts["[Content_Types].xml"])
    content = ET.Element(f"{{{C}}}Types")
    for default in original_types.findall(f"{{{C}}}Default"):
        content.append(deepcopy(default))
    overrides = {x.get("PartName").lstrip("/"): x.get("ContentType") for x in original_types.findall(f"{{{C}}}Override")}
    for path in parts:
        kind = overrides.get(copied_types.get(path, path))
        if path.startswith("xl/worksheets/") and path.endswith(".xml"):
            kind = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
        if kind:
            ET.SubElement(content, f"{{{C}}}Override", PartName="/" + path, ContentType=kind)
    parts["[Content_Types].xml"] = serialized(content)
    output = BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, value in parts.items():
            archive.writestr(path, value)
    return output.getvalue()
