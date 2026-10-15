import catalogIndex from "../data/catalog-ids.json";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { resolveLessonFields } from "./lesson-fields";
import { wrappedCellHeight } from "./export-layout";

const catalogIds = new Map<
  string,
  { id: string; scores: Record<string, string> }
>(Object.entries(catalogIndex));

const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P = "http://schemas.openxmlformats.org/package/2006/relationships";
const C = "http://schemas.openxmlformats.org/package/2006/content-types";
export const MAX_UPLOAD = 30 * 1024 * 1024;
type CellValue = string | number | boolean;

export interface Score {
  id: string;
  label: string;
  source: string;
  value: CellValue;
  criteria: string;
  row: number;
  dateLike: boolean;
}
export interface Lesson {
  id: string;
  code: string;
  name: string;
  objective: string;
  instruction: string;
  criteria: string;
  row: number;
  scores: Score[];
}
export interface ReferenceRow {
  id: string;
  lessonId: string | null;
  row: number;
  code: string;
  name: string;
  objective: string;
  score: string;
  criteria: string;
  instruction: string;
}
export interface Template {
  parts: Map<string, Uint8Array>;
  sheetPath: string;
  sheetXml: string;
  values: Map<string, CellValue>;
  lessons: Map<string, Lesson>;
  reference: ReferenceRow[];
  slots: number[];
  warnings: string[];
  assets: Map<string, Uint8Array>;
  defaults: { teacher: string; manager: string };
  center: string;
}
export interface ManualLessonFields {
  name: string;
  objective: string;
  instruction: string;
  criteria: string;
  score: string;
}
export type ResolvedLessonFields = Omit<ManualLessonFields, "score"> & {
  score: CellValue;
};
export interface DraftLesson {
  id: string;
  lessonId: string | null;
  code: string;
  scoreId: string;
  notes: string;
  manual: ManualLessonFields;
  origin?: "excel";
}
export interface ChildDraft {
  id: string;
  studentId?: string;
  name: string;
  age: string;
  teacher: string;
  manager: string;
  period: string;
  lessons: DraftLesson[];
}
export interface PlannedChild extends Omit<ChildDraft, "lessons"> {
  lessons: { lesson: Lesson; fields: ResolvedLessonFields; notes: string }[];
}

export const normalize = (value: string) =>
  value.normalize("NFC").toLocaleLowerCase("vi").replace(/\s/g, "");
const text = (value: CellValue | undefined) =>
  value === undefined ? "" : String(value);
// A static node list avoids live-collection reindexing on large Excel XML parts.
const descendants = (root: Document | Element, name: string, namespace = S) =>
  Array.from(root.querySelectorAll("*")).filter(
    (e) => e.localName === name && e.namespaceURI === namespace,
  );
const direct = (root: Element, name: string) =>
  Array.from(root.children).find((e) => e.localName === name);

function parseXml(source: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error("Mẫu XML có khai báo không được hỗ trợ.");
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.getElementsByTagName("parsererror").length)
    throw new Error("Không đọc được XML trong mẫu Excel.");
  return document;
}
const serialize = (document: Document) =>
  strToU8(new XMLSerializer().serializeToString(document));
function part(parts: Map<string, Uint8Array>, path: string): Uint8Array {
  const value = parts.get(path);
  if (!value) throw new Error(`Mẫu thiếu thành phần ${path}.`);
  return value;
}
const xmlPart = (parts: Map<string, Uint8Array>, path: string) =>
  parseXml(strFromU8(part(parts, path)));
const dirname = (path: string) => path.slice(0, path.lastIndexOf("/"));
const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const relPath = (path: string) =>
  `${dirname(path)}/_rels/${basename(path)}.rels`;

function targetPath(sourcePath: string, target: string): string {
  const segments = (
    target.startsWith("/") ? target : `${dirname(sourcePath)}/${target}`
  ).split("/");
  const result: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!result.length)
        throw new Error("Liên kết không hợp lệ trong workbook.");
      result.pop();
    } else result.push(segment);
  }
  return result.join("/");
}
function relativePath(from: string, to: string): string {
  const a = dirname(from).split("/"),
    b = to.split("/");
  while (a.length && a[0] === b[0]) {
    a.shift();
    b.shift();
  }
  return [...a.map(() => ".."), ...b].join("/");
}
function address(value: string): { row: number; col: number } {
  const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(value);
  if (!match?.[1] || !match[2]) throw new Error("Địa chỉ ô không hợp lệ.");
  let col = 0;
  for (const char of match[1]) col = col * 26 + char.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (row > 10000 || col > 16384)
    throw new Error("Mẫu vượt giới hạn hàng hoặc cột được hỗ trợ.");
  return { row, col };
}
function merges(document: Document) {
  return descendants(document, "mergeCell").map((merge) => {
    const [first, last] = (merge.getAttribute("ref") || "").split(":");
    if (!first || !last) throw new Error("Vùng gộp ô không hợp lệ.");
    return { first, start: address(first), end: address(last) };
  });
}
function readCells(
  document: Document,
  strings: string[],
  dateStyles: Set<number>,
  epoch: number,
) {
  const result = new Map<string, CellValue>();
  for (const cell of descendants(document, "c")) {
    const coord = cell.getAttribute("r") || "";
    address(coord);
    const kind = cell.getAttribute("t"),
      raw = direct(cell, "v")?.textContent;
    let value: CellValue = "";
    if (kind === "inlineStr")
      value = descendants(cell, "t")
        .map((t) => t.textContent || "")
        .join("");
    else if (raw && kind !== "e") {
      if (kind === "s") {
        const string = strings[Number(raw)];
        if (string === undefined)
          throw new Error("Chỉ mục chuỗi Excel không hợp lệ.");
        value = string;
      } else if (kind === "str" || kind === "d") value = raw;
      else if (kind === "b") value = raw === "1";
      else {
        const number = Number(raw);
        if (!Number.isFinite(number))
          throw new Error("Ô số không hợp lệ trong mẫu.");
        if (dateStyles.has(Number(cell.getAttribute("s") || 0))) {
          const date = new Date(epoch + number * 86400000);
          if (!Number.isFinite(date.getTime()))
            throw new Error("Ngày không hợp lệ trong mẫu.");
          value = date.toISOString().slice(0, 10);
        } else value = number;
      }
    }
    result.set(coord, value);
  }
  return result;
}
function fillMerged(document: Document, values: Map<string, CellValue>) {
  const result = new Map(values);
  for (const merge of merges(document)) {
    for (let row = merge.start.row; row <= merge.end.row; row++) {
      for (
        let col = merge.start.col;
        col <= Math.min(6, merge.end.col);
        col++
      ) {
        result.set(
          `${String.fromCharCode(64 + col)}${row}`,
          values.get(merge.first) ?? "",
        );
      }
    }
  }
  return result;
}
function scoreValue(code: string, raw: CellValue): CellValue {
  const source = text(raw).trim(),
    prefix = `${normalize(code)}.`,
    normalized = normalize(source);
  const suffix = normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : "";
  return /^\d+(?:\.\d+)?$/.test(suffix)
    ? Number(suffix)
    : typeof raw === "number"
      ? raw
      : source;
}
function readAssets(parts: Map<string, Uint8Array>, sheetPath: string) {
  const assets = new Map<string, Uint8Array>(),
    visited = new Set<string>();
  function visit(path: string) {
    if (visited.has(path)) return;
    visited.add(path);
    const rel = relPath(path);
    if (!parts.has(rel)) return;
    const relations = xmlPart(parts, rel);
    for (const relation of descendants(relations, "Relationship", P)) {
      const kind = relation.getAttribute("Type")?.split("/").at(-1);
      if (
        relation.getAttribute("TargetMode") === "External" ||
        !["drawing", "image"].includes(kind || "")
      ) {
        throw new Error(
          "KHGDCN chỉ hỗ trợ hình ảnh/logo, không hỗ trợ liên kết ngoài hoặc đối tượng nhúng khác.",
        );
      }
      const target = targetPath(path, relation.getAttribute("Target") || "");
      if (!target.startsWith("xl/"))
        throw new Error("Liên kết hình ảnh không hợp lệ.");
      assets.set(target, part(parts, target));
      visit(target);
    }
    assets.set(rel, part(parts, rel));
  }
  visit(sheetPath);
  return assets;
}

function unpackWorkbook(data: Uint8Array): Map<string, Uint8Array> {
  if (!data.length || data.length > MAX_UPLOAD)
    throw new Error("Hãy chọn tệp .xlsx tối đa 30 MB.");
  let expandedSize = 0;
  const filenames = new Set<string>();
  let parts: Map<string, Uint8Array>;
  try {
    parts = new Map(
      Object.entries(
        unzipSync(data, {
          filter(file) {
            expandedSize += file.originalSize;
            if (
              expandedSize > 150 * 1024 * 1024 ||
              filenames.size >= 5000 ||
              filenames.has(file.name)
            ) {
              throw new Error(
                "Workbook quá lớn hoặc có các thành phần trùng tên.",
              );
            }
            filenames.add(file.name);
            return true;
          },
        }),
      ),
    );
  } catch {
    throw new Error(
      "Không đọc được tệp .xlsx. Workbook phải không có mật khẩu và tối đa 150 MB sau giải nén.",
    );
  }
  if (parts.has("xl/vbaProject.bin"))
    throw new Error("Chỉ hỗ trợ .xlsx không chứa macro.");
  return parts;
}

function workbookCellReader(parts: Map<string, Uint8Array>) {
  const workbook = xmlPart(parts, "xl/workbook.xml");
  const strings = parts.has("xl/sharedStrings.xml")
    ? descendants(xmlPart(parts, "xl/sharedStrings.xml"), "si").map((si) =>
        descendants(si, "t")
          .map((t) => t.textContent || "")
          .join(""),
      )
    : [];
  const styles = xmlPart(parts, "xl/styles.xml");
  const formats = new Map(
    descendants(styles, "numFmt").map((f) => [
      Number(f.getAttribute("numFmtId")),
      f.getAttribute("formatCode") || "",
    ]),
  );
  const dateStyles = new Set<number>();
  const cellXfs = descendants(styles, "cellXfs")[0];
  if (!cellXfs) throw new Error("Mẫu thiếu định dạng ô.");
  Array.from(cellXfs.children).forEach((style, index) => {
    const id = Number(style.getAttribute("numFmtId") || 0);
    const code = (formats.get(id) || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[yd]/i.test(code))
      dateStyles.add(index);
  });
  const epoch =
    descendants(workbook, "workbookPr")[0]?.getAttribute("date1904") === "1"
      ? Date.UTC(1904, 0, 1)
      : Date.UTC(1899, 11, 30);
  return (document: Document) =>
    readCells(document, strings, dateStyles, epoch);
}

/** The file is parsed on the user's device. No request contains workbook data. */
export function readTemplate(data: Uint8Array): Template {
  const parts = unpackWorkbook(data);
  const workbook = xmlPart(parts, "xl/workbook.xml"),
    relations = xmlPart(parts, "xl/_rels/workbook.xml.rels");
  const targets = new Map(
    descendants(relations, "Relationship", P).map((r) => [
      r.getAttribute("Id"),
      targetPath("xl/workbook.xml", r.getAttribute("Target") || ""),
    ]),
  );
  const sheets = new Map(
    descendants(workbook, "sheet").map((s) => [
      normalize(s.getAttribute("name") || ""),
      targets.get(s.getAttributeNS(R, "id")),
    ]),
  );
  const sheetPath = sheets.get("khgdcn"),
    refPath = sheets.get("kodcxoa");
  if (!sheetPath || !refPath)
    throw new Error("Mẫu phải có hai sheet KHGDCN và Ko dc xoa.");
  const sheet = xmlPart(parts, sheetPath),
    reference = xmlPart(parts, refPath);
  const read = workbookCellReader(parts);
  const values = read(sheet),
    raw = read(reference);
  const expanded = fillMerged(reference, raw);
  for (const [index, label] of [
    "Bài số",
    "Tên bài",
    "Mục tiêu của bài",
    "Hướng dẫn",
    "Điểm cần đạt",
    "Tiêu chí cần đạt",
  ].entries()) {
    if (
      normalize(text(values.get(`${String.fromCharCode(65 + index)}8`))) !==
      normalize(label)
    )
      throw new Error("KHGDCN không có đúng cột A:F tại hàng 8 của mẫu.");
  }
  for (const [index, label] of [
    "Bài số",
    "Tên bài",
    "Mục tiêu và hướng dẫn",
    "Thang điểm",
    "Cách chấm điểm",
    "Hướng dẫn",
  ].entries()) {
    const header = normalize(
      text(raw.get(`${String.fromCharCode(65 + index)}2`)),
    );
    if (header !== normalize(label) && !(index === 3 && !header))
      throw new Error("Ko dc xoa không có đúng cột A:F tại hàng 2.");
  }
  const groups: Lesson[] = [],
    referenceRows: ReferenceRow[] = [];
  let current: Lesson | null = null;
  const refLast = Math.max(
    ...Array.from(raw.keys(), (coord) => address(coord).row),
  );
  for (let row = 3; row <= refLast; row++) {
    const get = (col: string) => text(expanded.get(`${col}${row}`)).trim();
    const code = text(raw.get(`A${row}`)).trim();
    if (["số", "bàisố", "stt"].includes(normalize(code))) {
      current = null;
      continue;
    }
    if (code) {
      current = {
        id: catalogIds.get(normalize(code))?.id ?? crypto.randomUUID(),
        code,
        name: get("B"),
        objective: get("C"),
        instruction: get("F"),
        criteria: get("E"),
        row,
        scores: [],
      };
      groups.push(current);
    }
    const source = get("D");
    if (
      [get("A"), get("B"), get("C"), source, get("E"), get("F")].some(Boolean)
    ) {
      referenceRows.push({
        id: crypto.randomUUID(),
        lessonId: current?.id ?? null,
        row,
        code: get("A") || current?.code || "",
        name: get("B") || current?.name || "",
        objective: get("C") || current?.objective || "",
        score: source,
        criteria: get("E"),
        instruction: get("F") || current?.instruction || "",
      });
    }
    if (current && !current.criteria) current.criteria = get("E");
    if (
      !current ||
      !source ||
      current.scores.some((s) => normalize(s.source) === normalize(source))
    )
      continue;
    const value = scoreValue(current.code, expanded.get(`D${row}`) ?? "");
    current.scores.push({
      id:
        catalogIds.get(normalize(current.code))?.scores[normalize(source)] ??
        crypto.randomUUID(),
      label: text(value),
      source,
      value,
      criteria: get("E"),
      row,
      dateLike: /^\d{4}-\d{2}-\d{2}$/.test(source),
    });
  }
  const lessons = new Map<string, Lesson>(),
    warnings: string[] = [];
  let duplicates = 0;
  for (const lesson of groups) {
    if (lessons.has(normalize(lesson.code))) duplicates++;
    else lessons.set(normalize(lesson.code), lesson);
  }
  if (!lessons.size) throw new Error("Bảng tham khảo không có bài học.");
  if (duplicates)
    warnings.push(
      `${duplicates} mã bài lặp trong tham khảo. Dùng nhóm đầu tiên như VLOOKUP của mẫu. Bảng tham khảo vẫn hiển thị mọi hàng.`,
    );
  const lessonList = Array.from(lessons.values());
  const dates = lessonList.reduce(
    (sum, l) => sum + l.scores.filter((s) => s.dateLike).length,
    0,
  );
  const unscored = lessonList.filter((l) => !l.scores.length).length;
  if (dates)
    warnings.push(
      `${dates} thang điểm được Excel lưu thành ngày. Giữ nguyên ngày gốc, không tự suy đoán thành khoảng điểm.`,
    );
  if (unscored)
    warnings.push(
      `${unscored} bài chưa có thang điểm. Có thể nhập điểm và các nội dung còn thiếu trực tiếp.`,
    );
  const blocked = new Set<number>();
  for (const { start, end } of merges(sheet)) {
    if (start.col > 6) continue;
    for (let row = Math.max(9, start.row); row <= end.row; row++)
      if (row !== start.row || end.col > start.col) blocked.add(row);
  }
  const last = Math.max(
    ...Array.from(values.keys(), (coord) => address(coord).row),
  );
  const slots = Array.from(
    { length: Math.max(0, last - 8) },
    (_, i) => i + 9,
  ).filter((row) => !blocked.has(row));
  if (!slots.length) throw new Error("Mẫu không có hàng nhập bài học.");
  if (blocked.size)
    warnings.push(
      `Giữ nguyên ô gộp; bỏ qua hàng ${Array.from(blocked)
        .sort((a, b) => a - b)
        .join(", ")} khi ghi bài học.`,
    );
  return {
    parts,
    sheetPath,
    sheetXml: strFromU8(part(parts, sheetPath)),
    values,
    lessons,
    reference: referenceRows,
    slots,
    warnings,
    assets: readAssets(parts, sheetPath),
    center: text(values.get("A1")),
    defaults: {
      teacher: text(values.get("C7")),
      manager: text(values.get("F7")),
    },
  };
}

/** Import populated plan sheets using the reference template already open. */
export function importPlans(
  data: Uint8Array,
  template: Template,
): ChildDraft[] {
  const parts = unpackWorkbook(data);
  const workbook = xmlPart(parts, "xl/workbook.xml");
  const relations = xmlPart(parts, "xl/_rels/workbook.xml.rels");
  const targets = new Map(
    descendants(relations, "Relationship", P).map((relation) => [
      relation.getAttribute("Id"),
      targetPath("xl/workbook.xml", relation.getAttribute("Target") || ""),
    ]),
  );
  const read = workbookCellReader(parts);
  const children: ChildDraft[] = [];
  for (const sheet of descendants(workbook, "sheet")) {
    const path = targets.get(sheet.getAttributeNS(R, "id"));
    if (!path) throw new Error("Không tìm thấy nội dung sheet trong Excel.");
    const document = xmlPart(parts, path),
      values = read(document);
    const headers = [
      "Bài số",
      "Tên bài",
      "Mục tiêu của bài",
      "Hướng dẫn",
      "Điểm cần đạt",
      "Tiêu chí cần đạt",
    ];
    if (
      !headers.every(
        (header, index) =>
          normalize(text(values.get(`${String.fromCharCode(65 + index)}8`))) ===
          normalize(header),
      )
    )
      continue;
    const expanded = fillMerged(document, values);
    const name =
      text(values.get("C6")).trim() || sheet.getAttribute("name") || "Học sinh";
    const lessons: DraftLesson[] = [],
      used = new Set<string>();
    const last = Math.max(
      8,
      ...Array.from(values.keys(), (coord) => address(coord).row),
    );
    for (let row = 9; row <= last; row++) {
      const code = text(values.get(`A${row}`)).trim();
      if (!code) continue;
      const lesson = template.lessons.get(normalize(code));
      if (!lesson)
        throw new Error(
          `${name}, hàng ${row}: bài ${code} không có trong mẫu đang mở.`,
        );
      if (used.has(normalize(code)))
        throw new Error(`${name}: bài ${code} bị lặp trong Excel.`);
      used.add(normalize(code));
      const get = (column: string) => text(expanded.get(`${column}${row}`));
      const score = get("E");
      lessons.push({
        id: crypto.randomUUID(),
        lessonId: lesson.id,
        code: lesson.code,
        scoreId: "",
        origin: "excel",
        notes: get("G"),
        manual: {
          name: get("B"),
          objective: get("C"),
          instruction: get("D"),
          criteria: get("F"),
          score,
        },
      });
    }
    if (lessons.length > template.slots.length)
      throw new Error(
        `${name}: vượt quá ${template.slots.length} bài của mẫu đang mở.`,
      );
    const period = text(values.get("G6"))
      .replace(/^Tháng\s*\/\s*Tuần\s*/i, "")
      .trim();
    children.push({
      id: crypto.randomUUID(),
      name,
      age: text(values.get("F6")),
      teacher: text(values.get("C7")),
      manager: text(values.get("F7")),
      period,
      lessons,
    });
    if (children.length > 100)
      throw new Error("Chỉ nhập tối đa 100 học sinh mỗi lần.");
  }
  if (!children.length)
    throw new Error(
      "Không tìm thấy sheet kế hoạch có đúng cột A:F ở hàng 8. Hãy chọn file kế hoạch theo mẫu hoặc file đã xuất từ ứng dụng.",
    );
  return children;
}

export function validatePlans(
  template: Template,
  children: ChildDraft[],
): PlannedChild[] {
  const lessonsById = new Map(
    Array.from(template.lessons.values()).map((lesson) => [lesson.id, lesson]),
  );
  if (!children.length || children.length > 100)
    throw new Error("Một workbook cần từ 1 đến 100 học sinh.");
  return children.map((child, index) => {
    const name = child.name.trim();
    if (!name) throw new Error(`Học sinh ${index + 1}: chưa nhập họ tên.`);
    for (const value of [
      name,
      child.age,
      child.teacher,
      child.manager,
      child.period,
    ]) {
      if (value.length > 200 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))
        throw new Error(
          `${name}: thông tin quá dài hoặc chứa ký tự không hợp lệ.`,
        );
    }
    if (!child.lessons.length || child.lessons.length > template.slots.length)
      throw new Error(
        `${name}: cần từ 1 đến ${template.slots.length} bài học.`,
      );
    const used = new Set<string>();
    const lessons = child.lessons.map((row, rowIndex) => {
      const key = normalize(row.code),
        lesson = row.lessonId
          ? lessonsById.get(row.lessonId)
          : template.lessons.get(key);
      if (!lesson)
        throw new Error(
          `${name}, bài ${rowIndex + 1}: chưa chọn bài số hợp lệ.`,
        );
      if (used.has(key))
        throw new Error(`${name}: bài ${lesson.code} đã được chọn.`);
      used.add(key);
      const score = lesson.scores.find((s) => s.id === row.scoreId) ?? null;
      const manualScore = row.origin === "excel";
      if (lesson.scores.length && (manualScore ? !row.manual.score.trim() : !score))
        throw new Error(
          `${name}, bài ${rowIndex + 1}: chưa ${manualScore ? "nhập" : "chọn"} điểm cần đạt hợp lệ.`,
        );
      for (const value of [row.notes, ...Object.values(row.manual)]) {
        if (value.length > 32767 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))
          throw new Error(
            `${name}, bài ${rowIndex + 1}: nội dung quá dài hoặc chứa ký tự không hợp lệ.`,
          );
      }
      return {
        lesson,
        fields:
          row.origin === "excel"
            ? { ...row.manual, score: row.manual.score.trim() }
            : resolveLessonFields(lesson, score, row.manual),
        notes: row.notes,
      };
    });
    return { ...child, name, lessons };
  });
}
export function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((original) => {
    let base =
      original
        .trim()
        .replace(/[\[\]:*?/\\]/g, " ")
        .trim()
        .replace(/^'+|'+$/g, "")
        .trim()
        .slice(0, 31)
        .replace(/'+$/g, "") || "Học sinh";
    if (base.toLowerCase() === "history") base = "History_";
    let name = base,
      version = 2;
    while (used.has(name.toLocaleLowerCase())) {
      const suffix = ` (${version++})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLocaleLowerCase());
    return name;
  });
}
function append(
  parent: Document | Element,
  namespace: string,
  name: string,
  attrs: Record<string, string> = {},
) {
  const doc = parent instanceof Document ? parent : parent.ownerDocument;
  const node = doc.createElementNS(namespace, name);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, value);
  parent.appendChild(node);
  return node;
}
function writeValue(cell: Element, value: CellValue | undefined) {
  for (const child of Array.from(cell.children))
    if (["f", "v", "is"].includes(child.localName)) cell.removeChild(child);
  cell.removeAttribute("t");
  if (value === undefined || value === "") return;
  if (typeof value === "number")
    append(cell, S, "v").textContent = String(value);
  else if (typeof value === "boolean") {
    cell.setAttribute("t", "b");
    append(cell, S, "v").textContent = value ? "1" : "0";
  } else {
    cell.setAttribute("t", "inlineStr");
    const t = append(append(cell, S, "is"), S, "t");
    t.setAttributeNS(
      "http://www.w3.org/XML/1998/namespace",
      "xml:space",
      "preserve",
    );
    t.textContent = value;
  }
}

/** Font sizes from the template's cell styles, used to size wrapped rows. */
function lessonTableStyles(template: Template) {
  const styles = xmlPart(template.parts, "xl/styles.xml");
  const xfs = descendants(styles, "cellXfs")[0],
    fonts = descendants(styles, "fonts")[0];
  if (!xfs || !fonts) throw new Error("Mẫu thiếu định dạng ô Excel.");
  const fontSize = (sourceId: string | null): number => {
    const index = Number(sourceId ?? "0"), style = xfs.children[index];
    if (!Number.isInteger(index) || !style) throw new Error("Mẫu có định dạng ô không hợp lệ.");
    const font = fonts.children[Number(style.getAttribute("fontId") ?? "0")];
    const size = Number(font && descendants(font, "sz")[0]?.getAttribute("val"));
    return Number.isFinite(size) && size > 0 ? size : 11;
  };
  return { fontSize };
}

export async function exportWorkbook(
  template: Template,
  drafts: ChildDraft[],
): Promise<Uint8Array> {
  const children = validatePlans(template, drafts),
    names = sheetNames(children.map((c) => c.name));
  const tableStyles = lessonTableStyles(template);
  const workbook = parseXml(`<workbook xmlns="${S}" xmlns:r="${R}"/>`);
  append(append(workbook.documentElement, S, "bookViews"), S, "workbookView", {
    activeTab: "0",
  });
  const sheets = append(workbook.documentElement, S, "sheets");
  const definedNames = append(workbook.documentElement, S, "definedNames");
  const relations = parseXml(`<Relationships xmlns="${P}"/>`);
  const parts = new Map<string, Uint8Array>(),
    copiedTypes = new Map<string, string>();
  for (const [kind, path] of [
    ["styles", "xl/styles.xml"],
    ["theme", "xl/theme/theme1.xml"],
  ]) {
    if (!kind || !path || !template.parts.has(path)) continue;
    parts.set(path, part(template.parts, path));
    append(relations.documentElement, P, "Relationship", {
      Id: kind,
      Type: `${R}/${kind}`,
      Target: path.slice(3),
    });
  }
  for (const [path, bytes] of template.assets)
    if (path.startsWith("xl/media/")) parts.set(path, bytes);
  for (const [index, child] of children.entries()) {
    const name = names[index];
    if (!name) throw new Error("Thiếu tên sheet xuất.");
    const sheetPath = `xl/worksheets/sheet${index + 1}.xml`;
    const sheet = append(sheets, S, "sheet", {
      name,
      sheetId: String(index + 1),
    });
    sheet.setAttributeNS(R, "r:id", `child${index + 1}`);
    append(relations.documentElement, P, "Relationship", {
      Id: `child${index + 1}`,
      Type: `${R}/worksheet`,
      Target: sheetPath.slice(3),
    });
    const document = parseXml(template.sheetXml);
    const data = descendants(document, "sheetData")[0];
    if (!data) throw new Error("Mẫu thiếu nội dung sheet.");
    const cells = new Map(
      descendants(document, "c").map((c) => [c.getAttribute("r") || "", c]),
    );
    for (const [coord, cell] of cells)
      writeValue(
        cell,
        address(coord).row >= 9 ? "" : template.values.get(coord),
      );
    const outputValues = new Map(template.values);
    const setCell = (coord: string, value: CellValue) => {
      outputValues.set(coord, value);
      let cell = cells.get(coord);
      if (!cell) {
        const point = address(coord);
        let row = Array.from(data.children).find(
          (r) => r.getAttribute("r") === String(point.row),
        );
        if (!row) row = append(data, S, "row", { r: String(point.row) });
        cell = document.createElementNS(S, "c");
        cell.setAttribute("r", coord);
        const before = Array.from(row.children).find(
          (c) => address(c.getAttribute("r") || "").col > point.col,
        );
        row.insertBefore(cell, before || null);
        cells.set(coord, cell);
      }
      writeValue(cell, value);
    };
    setCell("C6", child.name);
    setCell("F6", child.age);
    setCell("C7", child.teacher);
    setCell("F7", child.manager);
    // The sheet header names only the month; the year stays in the plan.
    if (child.period) setCell("G6", child.period.replace(/\s*\/\s*\d{4}\s*$/, ""));
    // Keep the template's column widths and the lesson-row cell styles of
    // its first lesson row (full grid, centred text, notes aligned to top).
    const templateColumns = descendants(document, "col");
    const widths = Array.from({ length: 7 }, (_, index) => {
      const column = templateColumns.find(col => Number(col.getAttribute("min")) <= index + 1 && index + 1 <= Number(col.getAttribute("max")));
      const width = Number(column?.getAttribute("width"));
      return Number.isFinite(width) && width > 0 ? width : 12;
    });
    const bodyStyles = widths.map((_, col) => cells.get(`${String.fromCharCode(65 + col)}9`)?.getAttribute("s") ?? null);
    const bodyHeights = new Map<number, number>();
    const lessonMerges: string[] = [];
    let nextRow = 9;
    for (const { lesson, fields, notes } of child.lessons) {
      const row = nextRow;
      const values = [lesson.code, fields.name, fields.objective, fields.instruction, fields.score, fields.criteria, notes];
      const height = Math.max(24, ...values.map((value, col) => {
        return wrappedCellHeight(value, widths[col] ?? 12, tableStyles.fontSize(bodyStyles[col] ?? null));
      }));
      // Excel limits one physical row to 409 points. A taller lesson spans
      // several merged rows so all text remains visible without shrinking it.
      const span = Math.ceil(height / 400);
      for (let offset = 0; offset < span; offset++) {
        bodyHeights.set(row + offset, Math.ceil(height / span));
        values.forEach((value, col) => setCell(`${String.fromCharCode(65 + col)}${row + offset}`, offset ? "" : value));
      }
      if (span > 1) {
        for (let col = 0; col < 7; col++) {
          const letter = String.fromCharCode(65 + col);
          lessonMerges.push(`${letter}${row}:${letter}${row + span - 1}`);
        }
      }
      nextRow += span;
    }
    const lastRow = nextRow - 1;
    const range = `A1:G${lastRow}`;
    descendants(document, "dimension")[0]?.setAttribute("ref", range);
    const columns = descendants(document, "cols")[0];
    if (columns) {
      columns.replaceChildren();
      widths.forEach((width, index) => append(columns, S, "col", { min: String(index + 1), max: String(index + 1), width: String(width), customWidth: "1" }));
    }
    // Lesson scores are independent, even if the source template merged them.
    for (const merge of descendants(document, "mergeCell")) {
      const points = (merge.getAttribute("ref") ?? "").split(":").map(address);
      if (points.some(point => point.row >= 9 || point.col > 7)) merge.remove();
    }
    let mergeContainer = descendants(document, "mergeCells")[0];
    if (!mergeContainer && lessonMerges.length) {
      mergeContainer = document.createElementNS(S, "mergeCells");
      const successor = Array.from(document.documentElement.children).find(element => ["phoneticPr", "conditionalFormatting", "dataValidations", "hyperlinks", "printOptions", "pageMargins", "pageSetup", "drawing", "extLst"].includes(element.localName));
      document.documentElement.insertBefore(mergeContainer, successor ?? null);
    }
    if (mergeContainer) {
      for (const ref of lessonMerges) append(mergeContainer, S, "mergeCell", { ref });
      mergeContainer.setAttribute("count", String(mergeContainer.children.length));
    }
    const merges = descendants(document, "mergeCell").map(merge => (merge.getAttribute("ref") ?? "").split(":").map(address));
    for (const row of Array.from(data.children)) {
      const rowNumber = Number(row.getAttribute("r"));
      if (rowNumber > lastRow) { row.remove(); continue; }
      row.setAttribute("spans", "1:7");
      row.removeAttribute("hidden");
      for (const cell of Array.from(row.children)) {
        if (address(cell.getAttribute("r") ?? "").col > 7) cell.remove();
      }
      let height = bodyHeights.get(rowNumber) ?? (rowNumber < 6 ? Number(row.getAttribute("ht") ?? 15) : 24);
      for (let column = 1; column <= 7; column++) {
        const coord = `${String.fromCharCode(64 + column)}${rowNumber}`;
        if (!cells.has(coord)) setCell(coord, "");
        const cell = cells.get(coord);
        if (!cell) continue;
        const bodyStyle = rowNumber >= 9 ? bodyStyles[column - 1] : null;
        if (bodyStyle) cell.setAttribute("s", bodyStyle);
        const sourceId = cell.getAttribute("s");
        const value = outputValues.get(coord) ?? "";
        const merged = merges.find(([start, end]) => start && end && start.row === rowNumber && start.col === column);
        const start = merged?.[0], end = merged?.[1];
        const width = start && end ? widths.slice(start.col - 1, end.col).reduce((sum, item) => sum + item, 0) : widths[column - 1] ?? 12;
        const rowSpan = start && end ? end.row - start.row + 1 : 1;
        height = Math.max(height, wrappedCellHeight(value, width, tableStyles.fontSize(sourceId)) / rowSpan);
      }
      row.setAttribute("ht", String(Math.min(409, Math.ceil(height))));
      row.setAttribute("customHeight", "1");
    }
    for (const tag of ["conditionalFormatting", "dataValidations", "rowBreaks", "colBreaks", "autoFilter"]) {
      for (const element of descendants(document, tag)) element.remove();
    }
    const setup = descendants(document, "pageSetup")[0];
    setup?.setAttribute("fitToWidth", "1");
    setup?.setAttribute("fitToHeight", "0");
    setup?.removeAttribute("scale");
    let properties = descendants(document, "sheetPr")[0];
    if (!properties) {
      properties = document.createElementNS(S, "sheetPr");
      document.documentElement.insertBefore(properties, document.documentElement.firstChild);
    }
    const printProperties = descendants(properties, "pageSetUpPr")[0] ?? append(properties, S, "pageSetUpPr");
    printProperties.setAttribute("fitToPage", "1");
    append(definedNames, S, "definedName", { name: "_xlnm.Print_Area", localSheetId: String(index) }).textContent = `'${name.replace(/'/g, "''")}'!$A$1:$G$${lastRow}`;
    for (const view of descendants(document, "sheetView")) {
      view.removeAttribute("tabSelected");
      view.setAttribute("topLeftCell", "A1");
    }
    for (const selection of descendants(document, "selection")) {
      selection.setAttribute("activeCell", "A9");
      selection.setAttribute("sqref", "A9");
    }
    parts.set(sheetPath, serialize(document));
    const mapping = new Map<string, string>();
    for (const path of template.assets.keys()) {
      if (!path.includes("/_rels/") && !path.startsWith("xl/media/"))
        mapping.set(
          path,
          `${dirname(path)}/child${index + 1}_${basename(path)}`,
        );
    }
    for (const [oldPath, newPath] of mapping) {
      parts.set(newPath, part(template.assets, oldPath));
      copiedTypes.set(newPath, oldPath);
    }
    for (const [oldPath, newPath] of [
      [template.sheetPath, sheetPath],
      ...mapping,
    ]) {
      if (!oldPath || !newPath || !template.assets.has(relPath(oldPath)))
        continue;
      const rels = xmlPart(template.assets, relPath(oldPath));
      for (const relation of descendants(rels, "Relationship", P)) {
        const target = targetPath(
          oldPath,
          relation.getAttribute("Target") || "",
        );
        relation.setAttribute(
          "Target",
          relativePath(newPath, mapping.get(target) || target),
        );
      }
      parts.set(relPath(newPath), serialize(rels));
    }
    // Let the interface paint progress between children in a large workbook.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  parts.set("xl/workbook.xml", serialize(workbook));
  parts.set("xl/_rels/workbook.xml.rels", serialize(relations));
  const packageRels = parseXml(`<Relationships xmlns="${P}"/>`);
  append(packageRels.documentElement, P, "Relationship", {
    Id: "workbook",
    Type: `${R}/officeDocument`,
    Target: "xl/workbook.xml",
  });
  parts.set("_rels/.rels", serialize(packageRels));
  const originalTypes = xmlPart(template.parts, "[Content_Types].xml"),
    content = parseXml(`<Types xmlns="${C}"/>`);
  for (const defaultType of descendants(originalTypes, "Default", C))
    content.documentElement.appendChild(content.importNode(defaultType, true));
  const overrides = new Map(
    descendants(originalTypes, "Override", C).map((o) => [
      (o.getAttribute("PartName") || "").replace(/^\//, ""),
      o.getAttribute("ContentType") || "",
    ]),
  );
  for (const path of parts.keys()) {
    const kind = /^xl\/worksheets\/[^/]+\.xml$/.test(path)
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
      : overrides.get(copiedTypes.get(path) || path);
    if (kind)
      append(content.documentElement, C, "Override", {
        PartName: `/${path}`,
        ContentType: kind,
      });
  }
  parts.set("[Content_Types].xml", serialize(content));
  return zipSync(Object.fromEntries(parts), { level: 6 });
}
