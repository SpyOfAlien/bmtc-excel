import type { DraftLesson } from "./workbook";

/** Move the whole lesson, including its chosen score, within one child's plan. */
export function moveLesson(rows: DraftLesson[], id: string, destination: number): DraftLesson[] {
  const source = rows.findIndex(row => row.id === id);
  if (source < 0 || !Number.isInteger(destination) || destination < 0 || destination >= rows.length || source === destination) return rows;
  const moved = rows[source];
  if (!moved) return rows;
  const result = rows.filter(row => row.id !== id);
  result.splice(destination, 0, moved);
  return result;
}
