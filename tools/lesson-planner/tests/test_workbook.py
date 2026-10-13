from io import BytesIO
from pathlib import Path
import sys
import unittest
import zipfile
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from workbook import (Child, InputError, P, R, S, Template, address,
                      export_workbook, normalized, parse_children, sheet_names, tag)

SOURCE = Path(__file__).resolve().parents[3] / "ref" / "KEHOACHMOI.xlsx"


class WorkbookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = SOURCE.read_bytes()
        cls.template = Template(cls.original)

    def child(self, name="Bé thử", codes=("A5",)):
        return {"name": name, "age": "5 tuổi", "teacher": "Cô thử", "manager": "QLCM thử",
                "period": "Tháng 10 / Tuần 2", "lessons": [
                    {"code": code, "scoreId": self.template.lessons[normalized(code)].scores[-1].id} for code in codes]}

    def export(self, *children):
        parsed = parse_children({"children": list(children)}, self.template)
        return zipfile.ZipFile(BytesIO(export_workbook(self.template, parsed)))

    def cell(self, root, coord):
        return root.find(f".//{tag('c')}[@r='{coord}']")

    def value(self, root, coord):
        cell = self.cell(root, coord)
        if cell is None:
            return None
        return cell.findtext(f"{tag('is')}/{tag('t')}") or cell.findtext(tag("v"))

    def test_real_template_reference(self):
        lesson = self.template.lessons["a5"]
        self.assertEqual([s.value for s in lesson.scores], [4, 3, 2, 1])
        self.assertIn("cách xa ít nhất 1,5m", lesson.instruction.lower())
        self.assertTrue(all(s.criteria for s in lesson.scores))
        self.assertGreater(len(self.template.lessons), 900)

    def test_blank_score_is_not_invented(self):
        self.assertTrue(any(not l.scores for l in self.template.lessons.values()))

    def test_date_scores_are_not_guessed(self):
        scores = [s for l in self.template.lessons.values() for s in l.scores if s.date_like]
        self.assertEqual(len(scores), 54)
        self.assertEqual(scores[0].value, "2025-01-03")

    def test_merged_reference_content(self):
        root = ET.fromstring(self.template.parts[next(p for p in self.template.parts
                   if p.startswith('xl/worksheets/sheet') and p.endswith('.xml') and b'E2018:E2026' in self.template.parts[p])])
        self.assertIsNotNone(root)
        # Selected criteria on a merged continuation row come from the anchor.
        continuation = next(r for r in self.template.reference_rows if r["row"] == 2019)
        anchor = next(r for r in self.template.reference_rows if r["row"] == 2018)
        self.assertEqual(continuation["criteria"], anchor["criteria"])

    def test_normalize_codes(self):
        raw = self.child(codes=(" a 5 ",))
        child = parse_children({"children": [raw]}, self.template)[0]
        self.assertEqual(child.lessons[0].lesson.code, "A5")

    def test_duplicates_rejected(self):
        with self.assertRaisesRegex(InputError, "bị lặp"):
            parse_children({"children": [self.child(codes=("A5", " a 5 "))]}, self.template)

    def test_score_from_other_lesson_rejected(self):
        raw = self.child()
        raw["lessons"][0]["scoreId"] = self.template.lessons["a1"].scores[0].id
        with self.assertRaisesRegex(InputError, "thang điểm"):
            parse_children({"children": [raw]}, self.template)

    def test_missing_name_and_empty_lessons_rejected(self):
        for raw in (self.child(name=" "), self.child(codes=())):
            with self.subTest(raw=raw), self.assertRaises(InputError):
                parse_children({"children": [raw]}, self.template)

    def test_tampered_reference_columns_not_trusted(self):
        raw = self.child()
        raw["lessons"][0].update(name="FAKE", criteria="FAKE", instruction="FAKE")
        archive = self.export(raw)
        self.assertNotIn(b"FAKE", archive.read("xl/worksheets/sheet1.xml"))

    def test_only_child_sheets_and_unique_names(self):
        archive = self.export(self.child("A/B:*?[]\\"), self.child("A/B:*?[]\\"))
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        names = [s.get("name") for s in workbook.find(tag("sheets"))]
        self.assertEqual(names, ["A B", "A B (2)"])
        self.assertEqual(len([p for p in archive.namelist() if p.startswith("xl/worksheets/sheet")]), 2)
        self.assertNotIn("xl/sharedStrings.xml", archive.namelist())
        self.assertNotIn("xl/calcChain.xml", archive.namelist())

    def test_sheet_name_edge_cases(self):
        children = tuple(Child(name, "", "", "", "", ()) for name in ("'", "History", "B"*80, "b"*80))
        names = sheet_names(children)
        self.assertEqual(names[0], "Học sinh")
        self.assertEqual(names[1], "History_")
        self.assertTrue(all(len(n) <= 31 for n in names))
        self.assertEqual(len(set(n.casefold() for n in names)), 4)

    def test_exact_geometry_and_cell_styles(self):
        archive = self.export(self.child())
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        source = self.template.sheet
        for name in ("cols", "mergeCells", "pageMargins", "pageSetup", "dimension", "sheetFormatPr", "conditionalFormatting"):
            self.assertEqual(ET.tostring(source.find(tag(name))), ET.tostring(root.find(tag(name))), name)
        before = {c.get("r"): c.get("s") for c in source.iter(tag("c"))}
        after = {c.get("r"): c.get("s") for c in root.iter(tag("c"))}
        self.assertEqual(before, after)
        self.assertEqual([r.attrib for r in source.find(tag("sheetData"))],
                         [r.attrib for r in root.find(tag("sheetData"))])
        self.assertEqual(archive.read("xl/styles.xml"), self.template.parts["xl/styles.xml"])

    def test_values_headers_and_old_data_cleared(self):
        raw = self.child()
        raw["name"] = "=not a formula & <test>"
        archive = self.export(raw)
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        self.assertEqual(self.value(root,"C6"), raw["name"])
        self.assertEqual(self.value(root,"F6"), "5 tuổi")
        self.assertEqual(self.value(root,"C7"), "Cô thử")
        self.assertEqual(self.value(root,"F7"), "QLCM thử")
        self.assertEqual(self.value(root,"G6"), "Tháng / Tuần\nTháng 10 / Tuần 2")
        self.assertEqual(self.value(root,"A1"), self.template.values["A1"])
        self.assertFalse(list(root.iter(tag("f"))))
        self.assertEqual(self.value(root,"A9"), "A5")
        self.assertEqual(self.value(root,"E9"), "1")
        self.assertEqual(self.value(root,"F9"), self.template.lessons["a5"].scores[-1].criteria)
        for c in root.iter(tag("c")):
            row, col = address(c.get("r"))
            if row >= 10 or row >= 9 and col >= 7:
                self.assertIsNone(c.find(tag("v")))
                self.assertIsNone(c.find(tag("is")))
        self.assertNotIn("BÉ HƯNG".encode(), archive.read("xl/worksheets/sheet1.xml"))

    def test_skip_merged_score_rows(self):
        codes = tuple(l.code for l in list(self.template.lessons.values())[:20])
        archive = self.export(self.child(codes=codes))
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        for row in (24,25,26):
            self.assertIsNone(self.value(root, f"A{row}"))
        self.assertEqual(self.value(root,"A27"), codes[15])

    def test_every_relationship_resolves_and_drawings_are_separate(self):
        archive = self.export(self.child(), self.child("Bé hai"))
        import posixpath
        for path in archive.namelist():
            if not path.endswith(".rels"):
                continue
            folder = "" if path == "_rels/.rels" else posixpath.dirname(posixpath.dirname(path))
            for rel in ET.fromstring(archive.read(path)):
                target = posixpath.normpath(posixpath.join(folder,rel.get("Target")))
                self.assertIn(target, archive.namelist(), target)
        self.assertIn("xl/drawings/child1_drawing9.xml", archive.namelist())
        self.assertIn("xl/drawings/child2_drawing9.xml", archive.namelist())
        self.assertEqual(archive.read("xl/media/image2.png"), self.template.parts["xl/media/image2.png"])

    def test_original_unchanged(self):
        self.export(self.child())
        self.assertEqual(SOURCE.read_bytes(), self.original)

    def test_invalid_uploads_rejected(self):
        for data in (b"bad zip", b"", b"a"*(30*1024*1024+1)):
            with self.subTest(size=len(data)), self.assertRaises(InputError):
                Template(data)

    def test_incompatible_template_rejected(self):
        parts = dict(self.template.parts)
        parts[self.template.sheet_path] = parts[self.template.sheet_path].replace(b'r="A8"',b'r="A8000"',1)
        data = BytesIO()
        with zipfile.ZipFile(data,"w",zipfile.ZIP_DEFLATED) as archive:
            for path,content in parts.items(): archive.writestr(path,content)
        with self.assertRaisesRegex(InputError, "cột A:F"):
            Template(data.getvalue())

    def test_external_template_link_rejected(self):
        data = BytesIO()
        with zipfile.ZipFile(data,"w",zipfile.ZIP_DEFLATED) as archive:
            for path,content in self.template.parts.items():
                if path == "xl/worksheets/_rels/sheet12.xml.rels":
                    content = content.replace(b'Target="../drawings/drawing9.xml"',b'Target="https://example.com" TargetMode="External"')
                archive.writestr(path,content)
        with self.assertRaisesRegex(InputError,"liên kết"):
            Template(data.getvalue())


if __name__ == "__main__":
    unittest.main()
