import type { Lesson } from "./workbook";

export function lessonGroup(code: string): string {
  return code.trim().match(/^[a-z]/i)?.[0]?.toUpperCase() ?? "Khác";
}

export function groupLessons(lessons: Lesson[]) {
  const grouped = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const group = lessonGroup(lesson.code);
    const rows = grouped.get(group) ?? [];
    rows.push(lesson);
    grouped.set(group, rows);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left === "Khác" ? 1 : right === "Khác" ? -1 : left.localeCompare(right, "vi"))
    .map(([name, rows]) => ({ name, lessons: rows.sort((left, right) => left.code.localeCompare(right.code, "vi", { numeric: true })) }));
}
