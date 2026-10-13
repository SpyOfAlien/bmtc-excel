import { strToU8, zipSync } from "fflate";
import type { Template } from "../src/lib/workbook";

/** Build a small parser fixture from repository data, without a source .xlsx. */
export function templateFixture(template: Template): Uint8Array {
  const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const reference = new DOMParser().parseFromString(`<worksheet xmlns="${namespace}"><sheetData/></worksheet>`, "application/xml");
  const data = reference.getElementsByTagNameNS(namespace, "sheetData")[0];
  if (!data) throw new Error("Missing fixture sheetData");
  const addRow = (number: number, values: string[]) => {
    const row = reference.createElementNS(namespace, "row"); row.setAttribute("r", String(number));
    values.forEach((value, index) => {
      if (!value) return;
      const cell = reference.createElementNS(namespace, "c"); cell.setAttribute("r", `${String.fromCharCode(65 + index)}${number}`); cell.setAttribute("t", "inlineStr");
      const inline = reference.createElementNS(namespace, "is"), text = reference.createElementNS(namespace, "t");
      text.textContent = value; inline.append(text); cell.append(inline); row.append(cell);
    });
    data.append(row);
  };
  addRow(2, ["Bài số", "Tên bài", "Mục tiêu và hướng dẫn", "Thang điểm", "Cách chấm điểm", "Hướng dẫn"]);
  const starts = new Set([...template.lessons.values()].map(lesson => lesson.row));
  for (const row of template.reference) addRow(row.row, [starts.has(row.row) ? row.code : "", row.name, row.objective, row.score, row.criteria, row.instruction]);
  const workbook = `<workbook xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="KHGDCN" sheetId="1" r:id="plan"/><sheet name="Ko dc xoa" sheetId="2" r:id="reference"/></sheets></workbook>`;
  const relations = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="plan" Target="/${template.sheetPath}"/><Relationship Id="reference" Target="worksheets/reference.xml"/></Relationships>`;
  const parts = new Map([...template.parts, ...template.assets]);
  parts.set(template.sheetPath, strToU8(template.sheetXml));
  parts.set("xl/workbook.xml", strToU8(workbook));
  parts.set("xl/_rels/workbook.xml.rels", strToU8(relations));
  parts.set("xl/worksheets/reference.xml", strToU8(new XMLSerializer().serializeToString(reference)));
  return zipSync(Object.fromEntries(parts));
}
