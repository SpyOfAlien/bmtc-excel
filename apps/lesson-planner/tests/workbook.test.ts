import { bundledTemplate } from "../src/lib/bundled-template";
import { templateFixture } from "./template-fixture";
import { emptyManualFields } from "../src/lib/lesson-fields";
import { beforeAll, describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { exportWorkbook, importPlans, normalize, readTemplate, sheetNames, validatePlans } from "../src/lib/workbook";
import type { ChildDraft, Template } from "../src/lib/workbook";
import { nextFilename, validPeriod } from "../src/lib/files";
import { moveLesson } from "../src/lib/lesson-order";

const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
let source: Uint8Array, sourceSnapshot: Uint8Array, template: Template;
beforeAll(() => { source = templateFixture(bundledTemplate()); sourceSnapshot = source.slice(); template = readTemplate(source); });

function child(name = "Bé thử", codes = ["A5"]): ChildDraft {
  return { id: name, name, age: "5 tuổi", teacher: "Giáo viên thử", manager: "QLCM thử", period: "Tháng 10 / Tuần 2",
    lessons: codes.map((code, i) => {
      const lesson = template.lessons.get(normalize(code));
      const score = lesson?.scores.at(-1);
      if (!lesson || !score) throw new Error(`Missing test fixture ${code}`);
      return { id: crypto.randomUUID(), lessonId: lesson.id, code, scoreId: score.id, notes: "", manual: emptyManualFields() };
    }) };
}
function xml(bytes: Uint8Array | undefined) {
  if (!bytes) throw new Error("Missing test XML");
  return new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
}
function elements(document: Document, name: string) { return Array.from(document.querySelectorAll("*")).filter(e => e.localName === name && e.namespaceURI === S); }
function value(document: Document, coord: string) {
  const cell = elements(document, "c").find(c => c.getAttribute("r") === coord);
  return cell?.getElementsByTagNameNS(S, "t")[0]?.textContent || cell?.getElementsByTagNameNS(S, "v")[0]?.textContent || null;
}

describe("real workbook parsing", () => {
  it("loads official codes and score-dependent criteria", () => {
    const lesson = template.lessons.get("a5");
    expect(template.lessons.size).toBe(970);
    expect(lesson?.scores.map(s => s.value)).toEqual([4, 3, 2, 1]);
    expect(lesson?.scores.find(s => s.value === 2)?.criteria).toContain("Trẻ sẵn sàng lại gần");
  });
  it("does not invent scores or reinterpret Excel dates", () => {
    const lessons = Array.from(template.lessons.values());
    expect(lessons.filter(l => !l.scores.length)).toHaveLength(325);
    const dates = lessons.flatMap(l => l.scores).filter(s => s.dateLike);
    expect(dates).toHaveLength(54);
    expect(dates[0]?.value).toBe("2025-01-03");
  });
  it("keeps lesson context and merged criteria on continuation rows", () => {
    const row = template.reference.find(r => r.row === 15);
    expect(row?.code).toBe("A5");
    expect(row?.name).toBe(template.lessons.get("a5")?.name);
    expect(template.reference.find(r => r.row === 2019)?.criteria).toBe(template.reference.find(r => r.row === 2018)?.criteria);
  });
  it("imports a reference sheet with no score header or score values", () => {
    const parts = unzipSync(source), workbook = xml(parts["xl/workbook.xml"]);
    const referenceSheet = elements(workbook, "sheet").find(sheet => normalize(sheet.getAttribute("name") || "") === "kodcxoa");
    const relationship = Array.from(xml(parts["xl/_rels/workbook.xml.rels"]).documentElement.children).find(relation => relation.getAttribute("Id") === referenceSheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
    const target = relationship?.getAttribute("Target");
    if (!target) throw new Error("Missing reference fixture");
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const reference = xml(parts[path]);
    for (const cell of elements(reference, "c")) if (/^D\d+$/.test(cell.getAttribute("r") || "")) { cell.replaceChildren(); cell.removeAttribute("t"); }
    parts[path] = strToU8(new XMLSerializer().serializeToString(reference));
    const unscoredTemplate = readTemplate(zipSync(parts));
    expect(unscoredTemplate.lessons.size).toBe(template.lessons.size);
    expect(Array.from(unscoredTemplate.lessons.values()).every(lesson => !lesson.scores.length)).toBe(true);
    expect(unscoredTemplate.lessons.get("a5")?.criteria).toBe(template.lessons.get("a5")?.criteria);
    const plan = child();
    plan.lessons = plan.lessons.map(row => ({ ...row, scoreId: "", manual: { ...emptyManualFields(), score: "2 / 4" } }));
    expect(validatePlans(unscoredTemplate, [plan])[0]?.lessons[0]?.fields.score).toBe("2 / 4");
  });
  it("normalizes code case and whitespace and rejects duplicate lessons", () => {
    expect(validatePlans(template, [child("An", [" a 5 "])])[0]?.lessons[0]?.lesson.code).toBe("A5");
    expect(() => validatePlans(template, [child("An", ["A5", " a 5 "])])).toThrow("đã được chọn");
  });
  it("rejects missing names, missing lessons, and scores from other lessons", () => {
    expect(() => validatePlans(template, [child(" ")])).toThrow("họ tên");
    expect(() => validatePlans(template, [child("An", [])])).toThrow("cần từ 1");
    const wrong = child();
    wrong.lessons = [{ id: "1", lessonId: null, code: "A5", scoreId: "3", notes: "", manual: emptyManualFields() }];
    expect(() => validatePlans(template, [wrong])).toThrow("điểm cần đạt");
    wrong.lessons = wrong.lessons.map(row => ({ ...row, scoreId: "", origin: "excel" }));
    expect(() => validatePlans(template, [wrong])).toThrow("chưa nhập điểm");
  });
  it("rejects invalid archives and mismatched templates", () => {
    expect(() => readTemplate(new Uint8Array([1, 2, 3]))).toThrow();
    const parts = unzipSync(source);
    delete parts[template.sheetPath];
    expect(() => readTemplate(zipSync(parts))).toThrow("thiếu thành phần");
  });
});

describe("values-only multi-child export", () => {
  it("exports and reimports unscored lessons with blank scores", async () => {
    const lesson = Array.from(template.lessons.values()).find(item => !item.scores.length);
    if (!lesson) throw new Error("Missing unscored fixture");
    const plan = child();
    plan.lessons.push({ id: crypto.randomUUID(), lessonId: lesson.id, code: lesson.code, scoreId: "", notes: "Không cần điểm", manual: emptyManualFields() });
    const bytes = await exportWorkbook(template, [plan]);
    const sheet = xml(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    expect(value(sheet, "A10")).toBe(lesson.code);
    expect(value(sheet, "E10")).toBeNull();
    expect(value(sheet, "G10")).toBe("Không cần điểm");
    const imported = importPlans(bytes, template);
    expect(required(required(imported[0]).lessons[1]).manual.score).toBe("");
    const restored = xml(unzipSync(await exportWorkbook(template, imported))["xl/worksheets/sheet1.xml"]);
    expect(value(restored, "A10")).toBe(lesson.code);
    expect(value(restored, "E10")).toBeNull();
  });
  it("exports free text and manual scores only for missing reference content", async () => {
    const original = template.lessons.get("a5");
    if (!original) throw new Error("Missing A5 fixture");
    const incomplete = { ...template, lessons: new Map(template.lessons) };
    incomplete.lessons.set("a5", { ...original, name: "", objective: "", instruction: "", criteria: "", scores: [] });
    const plan = child("Thủ công");
    plan.lessons = [{ id: "manual", lessonId: original.id, code: "A5", scoreId: "", notes: "Ghi chú", manual: {
      name: "=Tên & <thủ công>", objective: "Mục tiêu mới", instruction: "Hướng dẫn mới\nDòng 2", criteria: "Tiêu chí mới", score: "2 / 4",
    } }];
    const regular = child("Tham khảo", ["A1"]);
    regular.lessons = regular.lessons.map(row => ({ ...row, manual: { name: "Không ghi đè", objective: "", instruction: "", criteria: "", score: "99" } }));
    const files = unzipSync(await exportWorkbook(incomplete, [plan, regular]));
    const manualSheet = xml(files["xl/worksheets/sheet1.xml"]), referenceSheet = xml(files["xl/worksheets/sheet2.xml"]);
    expect(["A9", "B9", "C9", "D9", "E9", "F9", "G9"].map(coord => value(manualSheet, coord))).toEqual(["A5", "=Tên & <thủ công>", "Mục tiêu mới", "Hướng dẫn mới\nDòng 2", "2 / 4", "Tiêu chí mới", "Ghi chú"]);
    expect(elements(manualSheet, "f")).toHaveLength(0);
    expect(value(referenceSheet, "B9")).toBe(template.lessons.get("a1")?.name);
    expect(value(referenceSheet, "E9")).toBe("1");
    plan.lessons = plan.lessons.map(row => ({ ...row, manual: { ...row.manual, score: " " } }));
    expect(validatePlans(incomplete, [plan])[0]?.lessons[0]?.fields.score).toBe("");
    plan.lessons = plan.lessons.map(row => ({ ...row, manual: { ...row.manual, score: "2", objective: "\u0000" } }));
    expect(() => validatePlans(incomplete, [plan])).toThrow("ký tự không hợp lệ");
  });
  it("exports reordered lessons with their scores and keeps other children independent", async () => {
    const first = child("An", ["A1", "A5"]);
    const second = child("Bình", ["A1", "A5"]);
    first.lessons = first.lessons.map(row => ({ ...row, notes: row.code === "A5" ? "=Ghi chú & <thử>\nDòng thứ hai" : "" }));
    first.lessons = moveLesson(first.lessons, required(first.lessons[1]).id, 0);
    const files = unzipSync(await exportWorkbook(template, [first, second]));
    const firstSheet = xml(files["xl/worksheets/sheet1.xml"]);
    const secondSheet = xml(files["xl/worksheets/sheet2.xml"]);
    expect([value(firstSheet, "A9"), value(firstSheet, "A10")]).toEqual(["A5", "A1"]);
    expect(value(firstSheet, "G8")).toMatch(/ghi chú/i);
    expect(value(firstSheet, "G9")).toBe("=Ghi chú & <thử>\nDòng thứ hai");
    expect(value(firstSheet, "G10")).toBeNull();
    expect(value(secondSheet, "G9")).toBeNull();
    expect(elements(firstSheet, "f")).toHaveLength(0);
    expect(value(firstSheet, "F9")).toBe(template.lessons.get("a5")?.scores.at(-1)?.criteria);
    expect([value(secondSheet, "A9"), value(secondSheet, "A10")]).toEqual(["A1", "A5"]);
  });
  it("preserves header content, original style definitions and logo while bounding the print area", async () => {
    const files = unzipSync(await exportWorkbook(template, [child("Bé An"), child("Bé Bình")]));
    const exported = xml(files["xl/worksheets/sheet1.xml"]);
    const original = xml(template.parts.get(template.sheetPath));
    expect(elements(exported, "pageMargins")[0]?.outerHTML).toBe(elements(original, "pageMargins")[0]?.outerHTML);
    expect(value(exported, "A1")).toBe(template.values.get("A1"));
    expect(value(exported, "A4")).toBe(template.values.get("A4"));
    expect(elements(exported, "dimension")[0]?.getAttribute("ref")).toBe("A1:G9");
    expect(elements(exported, "col")).toHaveLength(7);
    expect(elements(exported, "mergeCell").every(merge => !/E23/.test(merge.getAttribute("ref") ?? ""))).toBe(true);
    expect(elements(exported, "pageSetup")[0]?.getAttribute("fitToWidth")).toBe("1");
    expect(elements(exported, "pageSetup")[0]?.getAttribute("fitToHeight")).toBe("0");
    expect(elements(xml(files["xl/workbook.xml"]), "definedName").map(node => node.textContent)).toEqual(["'Bé An'!$A$1:$G$9", "'Bé Bình'!$A$1:$G$9"]);
    const originalStyles = xml(template.parts.get("xl/styles.xml"));
    const exportedStyles = xml(files["xl/styles.xml"]);
    for (const tag of ["fonts", "fills", "numFmts", "dxfs"]) expect(elements(exportedStyles, tag)[0]?.outerHTML).toBe(elements(originalStyles, tag)[0]?.outerHTML);
    for (const tag of ["cellXfs", "borders"]) {
      const before = Array.from(elements(originalStyles, tag)[0]?.children ?? []).map(e => e.outerHTML);
      const after = Array.from(elements(exportedStyles, tag)[0]?.children ?? []).map(e => e.outerHTML);
      expect(after.slice(0, before.length)).toEqual(before);
    }
    expect(Buffer.from(files["xl/media/image2.png"] || []).equals(Buffer.from(template.parts.get("xl/media/image2.png") || []))).toBe(true);
    expect(files["xl/drawings/child1_drawing9.xml"]).toBeDefined();
    expect(files["xl/drawings/child2_drawing9.xml"]).toBeDefined();
    expect(elements(xml(files["xl/workbook.xml"]), "sheet").map(s => s.getAttribute("name"))).toEqual(["Bé An", "Bé Bình"]);
  });
  it("keeps only used cells and the template's grid, alignment and widths", async () => {
    const files = unzipSync(await exportWorkbook(template, [child("An", ["A1"]), child("Bình", ["A1", "A5"])]));
    const styles = xml(files["xl/styles.xml"]);
    const xfs = Array.from(elements(styles, "cellXfs")[0]?.children ?? []);
    const borders = Array.from(elements(styles, "borders")[0]?.children ?? []);
    const original = xml(template.parts.get(template.sheetPath));
    const originalStyle = (coord: string) => elements(original, "c").find(c => c.getAttribute("r") === coord)?.getAttribute("s");
    for (const [sheetNumber = 1, lessonCount = 1] of [[1, 1], [2, 2]]) {
      const sheet = xml(files[`xl/worksheets/sheet${sheetNumber}.xml`]);
      expect(elements(sheet, "row")).toHaveLength(8 + lessonCount);
      expect(elements(sheet, "sheetView")[0]?.hasAttribute("showGridLines")).toBe(false);
      expect(elements(sheet, "col").map(col => col.getAttribute("width"))).toEqual(elements(original, "col").slice(0, 7).map(col => col.getAttribute("width")));
      for (const cell of elements(sheet, "c")) {
        const coord = cell.getAttribute("r") ?? "";
        const row = Number(coord.replace(/\D/g, ""));
        expect(coord).toMatch(/^[A-G]\d+$/);
        if (row < 9) {
          expect(cell.getAttribute("s")).toBe(originalStyle(coord));
          continue;
        }
        const style = xfs[Number(cell.getAttribute("s"))];
        const border = borders[Number(style?.getAttribute("borderId"))];
        for (const side of ["left", "right", "top", "bottom"])
          expect(Array.from(border?.children ?? []).find(edge => edge.localName === side)?.getAttribute("style")).toBe("thin");
        const alignment = style?.querySelector("alignment");
        expect(alignment?.getAttribute("wrapText")).toBe("1");
        expect(alignment?.getAttribute("vertical")).toBe(coord.startsWith("G") ? "top" : "center");
      }
    }
  });
  it("shows only the month of the plan period in the sheet header", async () => {
    const plan = { ...child(), period: "Tháng 11/2026" };
    const sheet = xml(unzipSync(await exportWorkbook(template, [plan]))["xl/worksheets/sheet1.xml"]);
    expect(value(sheet, "G6")).toBe("Tháng 11");
  });
  it("sizes wrapped rows to content and removes score merges inherited from the template", async () => {
    const plan = child("An", Array.from({ length: 19 }, (_, i) => `A${i + 1}`));
    plan.lessons[0] = { ...required(plan.lessons[0]), origin: "excel", manual: { ...emptyManualFields(), score: "2", instruction: "Hướng dẫn thực hiện từng bước. ".repeat(25) } };
    const files = unzipSync(await exportWorkbook(template, [plan]));
    const sheet = xml(files["xl/worksheets/sheet1.xml"]);
    const height = (number: number) => Number(elements(sheet, "row").find(row => row.getAttribute("r") === String(number))?.getAttribute("ht"));
    expect(height(9)).toBeGreaterThan(120);
    expect(height(9)).toBeLessThanOrEqual(409);
    expect(height(10)).toBeLessThan(height(9));
    expect(elements(sheet, "mergeCell").every(merge => !/\d{2}/.test(merge.getAttribute("ref") ?? ""))).toBe(true);
    expect(value(sheet, "E23")).toBeTruthy();
    expect(value(sheet, "E24")).toBeTruthy();
  });
  it("shows very long lessons across merged rows without losing importable content", async () => {
    const plan = child();
    const instruction = "Mỗi bước hướng dẫn cần được giữ nguyên và hiển thị đầy đủ.\n".repeat(70);
    const row = required(plan.lessons[0]);
    row.origin = "excel";
    row.manual = { ...emptyManualFields(), instruction, score: "2" };
    const bytes = await exportWorkbook(template, [plan]);
    const sheet = xml(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    const merges = elements(sheet, "mergeCell").map(merge => merge.getAttribute("ref"));
    expect(merges.some(ref => ref?.startsWith("D9:D"))).toBe(true);
    const heights = elements(sheet, "row").filter(item => Number(item.getAttribute("r")) >= 9).map(item => Number(item.getAttribute("ht")));
    expect(heights.every(height => height <= 409)).toBe(true);
    expect(heights.reduce((sum, height) => sum + height, 0)).toBeGreaterThan(900);
    const imported = importPlans(bytes, template);
    expect(required(imported[0]).lessons).toHaveLength(1);
    expect(required(required(imported[0]).lessons[0]).manual.instruction).toBe(instruction);
  });
  it("writes lookup values and removes old lessons, formulas and reference sheets", async () => {
    const files = unzipSync(await exportWorkbook(template, [child("=not a formula & <name>")]));
    const document = xml(files["xl/worksheets/sheet1.xml"]);
    expect(value(document, "C6")).toBe("=not a formula & <name>");
    expect(value(document, "A1")).toBe(template.values.get("A1"));
    expect(value(document, "F6")).toBe("5 tuổi");
    expect(value(document, "G6")).toBe("Tháng 10 / Tuần 2");
    expect(value(document, "A9")).toBe("A5");
    expect(value(document, "E9")).toBe("1");
    expect(value(document, "F9")).toBe(template.lessons.get("a5")?.scores.at(-1)?.criteria);
    expect(elements(document, "f")).toHaveLength(0);
    for (const cell of elements(document, "c")) {
      const coord = cell.getAttribute("r") || "";
      const row = Number(coord.replace(/\D/g, ""));
      if (row >= 10 || row >= 9 && /^[G-Z]/.test(coord)) expect(cell.children.length).toBe(0);
    }
    expect(Object.keys(files).filter(path => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))).toHaveLength(1);
    expect(files["xl/sharedStrings.xml"]).toBeUndefined();
    expect(files["xl/calcChain.xml"]).toBeUndefined();
    expect(strFromU8(files["xl/worksheets/sheet1.xml"] || new Uint8Array())).not.toContain("BÉ HƯNG");
    expect(source).toEqual(sourceSnapshot);
  });
  it("exports lessons consecutively instead of inheriting empty merged rows", async () => {
    const codes = Array.from(template.lessons.values()).slice(0, 20).map(l => l.code);
    const files = unzipSync(await exportWorkbook(template, [child("An", codes)]));
    const document = xml(files["xl/worksheets/sheet1.xml"]);
    expect(value(document, "A24")).toBe(codes[15]);
    expect(value(document, "A25")).toBe(codes[16]);
    expect(value(document, "A26")).toBe(codes[17]);
  });
  it("makes valid unique worksheet names without altering student names", () => {
    const names = sheetNames(["A/B:*?[]\\", "A/B:*?[]\\", "'", "History", "B".repeat(80), "b".repeat(80)]);
    expect(names.slice(0, 4)).toEqual(["A B", "A B (2)", "Học sinh", "History_"]);
    expect(names.every(n => n.length <= 31 && !/[\[\]:*?/\\]/.test(n))).toBe(true);
    expect(new Set(names.map(n => n.toLowerCase())).size).toBe(names.length);
  });
});

describe("save names", () => {
  it("versions collisions and protects the original filename", () => {
    expect(nextFilename("KeHoach_Thang10_2026.xlsx", ["kehoach_thang10_2026.xlsx", "KeHoach_Thang10_2026_v2.xlsx"], "source.xlsx")).toBe("KeHoach_Thang10_2026_v3.xlsx");
    expect(nextFilename("source.xlsx", [], "source.xlsx")).toBe("source_v2.xlsx");
  });
  it("requires a valid month and year", () => {
    expect(validPeriod(10, 2026)).toBe(true);
    expect(validPeriod(0, 2026)).toBe(false);
    expect(validPeriod(13, 2026)).toBe(false);
    expect(validPeriod(1.5, 2026)).toBe(false);
  });
});


function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing test fixture value");
  return value;
}

describe("import existing plans", () => {
  it("imports every student, their metadata, lessons, scores and notes in order", async () => {
    const first = child("An", ["A5", "A1"]), second = child("Bình", ["A5"]);
    required(first.lessons[0]).notes = "Ghi chú cần giữ";
    const imported = importPlans(await exportWorkbook(template, [first, second]), template);
    expect(imported.map(plan => plan.name)).toEqual(["An", "Bình"]);
    expect(required(imported[0])).toMatchObject({ age: first.age, teacher: first.teacher, manager: first.manager, period: first.period });
    expect(required(imported[0]).lessons.map(row => row.code)).toEqual(["A5", "A1"]);
    expect(required(imported[0]).lessons[0]).toMatchObject({ origin: "excel", notes: "Ghi chú cần giữ" });
    const original = required(required(validatePlans(template, [first])[0]).lessons[0]);
    expect(required(required(imported[0]).lessons[0]).manual).toEqual({ ...original.fields, score: String(original.fields.score) });
  });
  it("keeps imported edits when exporting and importing again", async () => {
    const imported = importPlans(await exportWorkbook(template, [child()]), template);
    const row = required(required(imported[0]).lessons[0]);
    row.manual = { name: "Tên đã sửa", objective: "Mục tiêu đã sửa", instruction: "Hướng dẫn đã sửa", criteria: "Tiêu chí đã sửa", score: "2 / 4" };
    row.notes = "Ghi chú đã sửa";
    const restored = importPlans(await exportWorkbook(template, imported), template);
    expect(required(required(restored[0]).lessons[0]).manual).toEqual(row.manual);
    expect(required(required(restored[0]).lessons[0]).notes).toBe(row.notes);
  });
  it("rejects unknown codes and files without plan sheets", async () => {
    const parts = unzipSync(await exportWorkbook(template, [child()]));
    const sheet = xml(parts["xl/worksheets/sheet1.xml"]);
    const code = elements(sheet, "c").find(cell => cell.getAttribute("r") === "A9");
    if (!code) throw new Error("Missing code fixture");
    code.setAttribute("t", "inlineStr"); code.replaceChildren();
    const inline = sheet.createElementNS(S, "is"), text = sheet.createElementNS(S, "t");
    text.textContent = "UNKNOWN999"; inline.append(text); code.append(inline);
    parts["xl/worksheets/sheet1.xml"] = strToU8(new XMLSerializer().serializeToString(sheet));
    expect(() => importPlans(zipSync(parts), template)).toThrow("không có trong mẫu");
    const header = elements(sheet, "c").find(cell => cell.getAttribute("r") === "A8");
    header?.replaceChildren();
    parts["xl/worksheets/sheet1.xml"] = strToU8(new XMLSerializer().serializeToString(sheet));
    expect(() => importPlans(zipSync(parts), template)).toThrow("Không tìm thấy sheet kế hoạch");
    expect(() => importPlans(new Uint8Array([1, 2, 3]), template)).toThrow();
  });
});
