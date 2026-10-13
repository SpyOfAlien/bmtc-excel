import { normalize } from "./workbook";
import type { DraftLesson } from "./workbook";
import { emptyManualFields } from "./lesson-fields";

/** Replace the selected row and insert additional lessons immediately after it. */
export function applyLessonSelection({ rows, rowId, selected, limit }: {
  rows: DraftLesson[]; rowId: string; selected: DraftLesson[]; limit: number;
}): DraftLesson[] {
  const position = rows.findIndex(row => row.id === rowId), original = rows[position];
  if (!original) return rows;
  const used = new Set(rows.filter(row => row.id !== rowId).map(row => normalize(row.code)));
  const available = Math.max(0, limit - rows.length + 1);
  const accepted = selected.filter(row => {
    const key = normalize(row.code);
    if (!key || used.has(key)) return false;
    used.add(key); return true;
  }).slice(0, available);
  if (!accepted.length) return rows;
  const originalSelected = accepted.some(row => normalize(row.code) === normalize(original.code));
  const replacements = accepted.map((row, index) => {
    if (normalize(row.code) === normalize(original.code)) return original;
    if (!originalSelected && index === 0) return { ...original, code: row.code, scoreId: "", manual: emptyManualFields() };
    return row;
  });
  return [...rows.slice(0, position), ...replacements, ...rows.slice(position + 1)];
}
