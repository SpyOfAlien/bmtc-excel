import type { Lesson } from "./workbook";

export function lessonGroup(code: string): string {
  return code.trim().match(/^\d*[a-z]+/i)?.[0]?.toUpperCase() ?? "Khác";
}

export function groupLessons(lessons: Lesson[]) {
  const prefixCounts = new Map<string, number>();
  for (const lesson of lessons) {
    const prefix = lessonGroup(lesson.code);
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }
  const grouped = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const prefix = lessonGroup(lesson.code);
    const group = (prefixCounts.get(prefix) ?? 0) >= 3 || /^[A-Z]$/.test(prefix)
      ? prefix
      : lesson.code.trim().match(/^[a-z]/i)?.[0]?.toUpperCase() ?? "Khác";
    const rows = grouped.get(group) ?? [];
    rows.push(lesson);
    grouped.set(group, rows);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left === "Khác" ? 1 : right === "Khác" ? -1 : left.localeCompare(right, "vi", { numeric: true }))
    .map(([name, rows]) => ({ name, lessons: rows.sort((left, right) => left.code.localeCompare(right.code, "vi", { numeric: true })) }));
}
