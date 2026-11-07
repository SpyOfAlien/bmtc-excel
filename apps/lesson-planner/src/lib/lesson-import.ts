import { strToU8, zipSync } from "fflate";
import { newLessonSchema } from "./storage-schema";
import { normalize, readFirstSheet } from "./workbook";
import type { Lesson } from "./workbook";

export const MAX_IMPORT_LESSONS = 500;
export const IMPORT_HEADERS = ["Mã bài", "Tên bài", "Mục tiêu", "Hướng dẫn", "Điểm", "Tiêu chí"];
type Field = "code" | "name" | "objective" | "instruction" | "score" | "criteria";
// Header names are matched after normalize(), so case and spacing do not matter.
const headerNames: Record<Field, string[]> = {
  code: ["mãbài", "bàisố", "mã"],
  name: ["tênbài"],
  objective: ["mụctiêu", "mụctiêucủabài"],
  instruction: ["hướngdẫn"],
  score: ["điểm", "điểmcầnđạt", "thangđiểm", "mứcđiểm"],
  criteria: ["tiêuchí", "tiêuchícầnđạt", "cáchchấmđiểm"],
};

export interface SkippedLesson {
  row: number;
  code: string;
  reason: string;
}
export interface LessonImport {
  lessons: Lesson[];
  skipped: SkippedLesson[];
}

function cellAddress(coord: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(coord);
  if (!match?.[1] || !match[2]) return null;
  let col = 0;
  for (const char of match[1]) col = col * 26 + char.charCodeAt(0) - 64;
  return { row: Number(match[2]), col };
}
function rowsOf(cells: Map<string, string | number | boolean>) {
  const rows = new Map<number, Map<number, string>>();
  for (const [coord, value] of cells) {
    const point = cellAddress(coord);
    if (!point) continue;
    const row = rows.get(point.row) ?? new Map<number, string>();
    row.set(point.col, String(value).trim());
    rows.set(point.row, row);
  }
  return rows;
}

/**
 * Read lessons from the first sheet: a header row naming the columns, then one
 * row per score level. A row without a code adds a score to the lesson above.
 */
export function parseLessonImport(data: Uint8Array, existingCodes: ReadonlySet<string>): LessonImport {
  const { raw, filled } = readFirstSheet(data);
  const rawRows = rowsOf(raw), rows = rowsOf(filled);
  const numbers = [...rows.keys()].sort((a, b) => a - b);
  let headerRow = 0;
  const columns = new Map<Field, number>();
  for (const number of numbers.slice(0, 20)) {
    const found = new Map<Field, number>();
    for (const [col, value] of [...(rows.get(number) ?? [])].sort(([a], [b]) => a - b)) {
      const field = (Object.keys(headerNames) as Field[]).find(key => headerNames[key].includes(normalize(value)));
      if (field && !found.has(field)) found.set(field, col);
    }
    if (found.has("code") && found.has("name")) {
      headerRow = number;
      for (const [field, col] of found) columns.set(field, col);
      break;
    }
  }
  if (!headerRow) throw new Error(`Không tìm thấy hàng tiêu đề có cột "Mã bài" và "Tên bài" trong sheet đầu tiên.`);
  const entries: { row: number; lesson: Lesson }[] = [], skipped: SkippedLesson[] = [];
  let current: { row: number; lesson: Lesson } | null = null;
  for (const number of numbers.filter(row => row > headerRow)) {
    const get = (field: Field) => {
      const col = columns.get(field);
      return col === undefined ? "" : rows.get(number)?.get(col) ?? "";
    };
    // Merged code cells are filled in `rows`, so the stored value decides where a lesson starts.
    const codeColumn = columns.get("code");
    const code = codeColumn === undefined ? "" : rawRows.get(number)?.get(codeColumn) ?? "";
    if (code) {
      current = { row: number, lesson: { id: crypto.randomUUID(), code, name: get("name"), objective: get("objective"), instruction: get("instruction"), criteria: "", row: 0, scores: [] } };
      entries.push(current);
    } else if (!current) {
      if ((Object.keys(headerNames) as Field[]).some(field => get(field))) skipped.push({ row: number, code: "", reason: "Thiếu mã bài." });
      continue;
    } else {
      const lesson = current.lesson;
      lesson.name ||= get("name");
      lesson.objective ||= get("objective");
      lesson.instruction ||= get("instruction");
    }
    const lesson = current.lesson, score = get("score"), criteria = get("criteria");
    lesson.criteria ||= criteria;
    if (!score) continue;
    if (lesson.scores.some(item => normalize(item.source) === normalize(score))) {
      skipped.push({ row: number, code: lesson.code, reason: `Mức điểm ${score} lặp lại trong bài.` });
      continue;
    }
    lesson.scores.push({ id: crypto.randomUUID(), label: score, source: score, value: score, criteria, row: 0, dateLike: /^\d{4}-\d{2}-\d{2}$/.test(score) });
  }
  if (!entries.length) throw new Error("Không có bài học nào dưới hàng tiêu đề.");
  const lessons: Lesson[] = [], seen = new Set<string>();
  for (const { row, lesson } of entries) {
    const key = normalize(lesson.code);
    const reason = existingCodes.has(key)
      ? "Mã bài đã có trong thư viện."
      : seen.has(key)
        ? "Mã bài lặp lại trong tệp."
        : (() => {
            const result = newLessonSchema.safeParse(lesson);
            return result.success ? "" : result.error.issues[0]?.message ?? "Nội dung bài không hợp lệ.";
          })();
    seen.add(key);
    if (reason) skipped.push({ row, code: lesson.code, reason });
    else lessons.push(lesson);
  }
  if (lessons.length > MAX_IMPORT_LESSONS) throw new Error(`Mỗi lần chỉ nhập tối đa ${MAX_IMPORT_LESSONS} bài. Hãy chia tệp thành nhiều phần.`);
  return { lessons, skipped: skipped.sort((a, b) => a.row - b.row) };
}

const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A blank import workbook with the expected headers and one example lesson. */
export function lessonImportTemplate(): Uint8Array {
  const rows = [
    IMPORT_HEADERS,
    ["VD1", "Tên bài ví dụ", "Mục tiêu của bài", "Hướng dẫn thực hiện", "1", "Tiêu chí cho mức điểm 1"],
    ["", "", "", "", "2", "Tiêu chí cho mức điểm 2"],
  ];
  const sheetRows = rows.map((values, index) => `<row r="${index + 1}">${values.map((value, col) => value ? `<c r="${String.fromCharCode(65 + col)}${index + 1}" t="inlineStr" s="${index ? 2 : 1}"><is><t>${escape(value)}</t></is></c>` : "").join("")}</row>`).join("");
  const widths = [12, 30, 40, 40, 10, 40].map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${S}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Bai hoc" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${S}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${S}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}
