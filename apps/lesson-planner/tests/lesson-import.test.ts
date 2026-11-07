import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { lessonImportTemplate, parseLessonImport } from "../src/lib/lesson-import";

const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
/** Reuse the template's package and replace its sheet with the given rows. */
function workbook(rows: (string | number)[][], merges: string[] = []) {
  const parts = unzipSync(lessonImportTemplate());
  const cells = rows.map((values, index) => `<row r="${index + 1}">${values.map((value, col) => {
    const ref = `${String.fromCharCode(65 + col)}${index + 1}`;
    if (value === "") return "";
    return typeof value === "number" ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
  }).join("")}</row>`).join("");
  const merged = merges.length ? `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : "";
  parts["xl/worksheets/sheet1.xml"] = strToU8(`<worksheet xmlns="${S}"><sheetData>${cells}</sheetData>${merged}</worksheet>`);
  return zipSync(parts);
}

describe("lesson import", () => {
  it("reads the downloadable template back as one lesson with two score levels", () => {
    const { lessons, skipped } = parseLessonImport(lessonImportTemplate(), new Set());
    expect(skipped).toEqual([]);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ code: "VD1", name: "Tên bài ví dụ", objective: "Mục tiêu của bài", instruction: "Hướng dẫn thực hiện", criteria: "Tiêu chí cho mức điểm 1" });
    expect(lessons[0]?.scores.map(score => [score.value, score.criteria])).toEqual([["1", "Tiêu chí cho mức điểm 1"], ["2", "Tiêu chí cho mức điểm 2"]]);
  });
  it("finds headers in any order below a title and treats merged code cells as one lesson", () => {
    const { lessons } = parseLessonImport(workbook([
      ["Danh sách bài tháng 11"],
      ["Tên bài", "MÃ BÀI", "Điểm cần đạt", "Tiêu chí cần đạt", "Hướng dẫn"],
      ["Bài một", "N1", 1, "Mức một", "Làm mẫu"],
      ["", "", 2, "Mức hai", ""],
      ["Bài hai", "N2", "", "Tiêu chí chung", ""],
    ], ["A3:A4", "B3:B4"]), new Set());
    expect(lessons.map(lesson => [lesson.code, lesson.name, lesson.scores.length, lesson.criteria])).toEqual([
      ["N1", "Bài một", 2, "Mức một"],
      ["N2", "Bài hai", 0, "Tiêu chí chung"],
    ]);
    expect(lessons[0]?.instruction).toBe("Làm mẫu");
    expect(lessons[0]?.scores.map(score => score.value)).toEqual(["1", "2"]);
  });
  it("skips existing, repeated and incomplete lessons with the row and reason", () => {
    const { lessons, skipped } = parseLessonImport(workbook([
      ["Mã bài", "Tên bài", "Mục tiêu", "Hướng dẫn", "Điểm", "Tiêu chí"],
      ["", "Mồ côi", "", "", "", ""],
      ["A1", "Trùng danh mục", "", "", "", ""],
      ["M1", "Bài hợp lệ", "", "", "1", "Một"],
      ["", "", "", "", "1", "Lặp mức"],
      ["m 1", "Trùng trong tệp", "", "", "", ""],
      ["M2", "", "", "", "", ""],
    ]), new Set(["a1"]));
    expect(lessons.map(lesson => lesson.code)).toEqual(["M1"]);
    expect(skipped).toEqual([
      { row: 2, code: "", reason: "Thiếu mã bài." },
      { row: 3, code: "A1", reason: "Mã bài đã có trong thư viện." },
      { row: 5, code: "M1", reason: "Mức điểm 1 lặp lại trong bài." },
      { row: 6, code: "m 1", reason: "Mã bài lặp lại trong tệp." },
      { row: 7, code: "M2", reason: "Nhập tên bài." },
    ]);
  });
  it("explains files without the expected header or lessons", () => {
    expect(() => parseLessonImport(workbook([["Tên", "Ghi chú"], ["x", "y"]]), new Set())).toThrow(/Mã bài/);
    expect(() => parseLessonImport(workbook([["Mã bài", "Tên bài"]]), new Set())).toThrow(/Không có bài học/);
  });
});
