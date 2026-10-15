import { describe, expect, it } from "vitest";
import { groupLessons, lessonGroup } from "../src/lib/lesson-groups";
import { bundledTemplate } from "../src/lib/bundled-template";

describe("lesson groups", () => {
  it("extracts complete letter prefixes including numeric age prefixes", () => {
    expect(lessonGroup(" a10 ")).toBe("A");
    expect(lessonGroup("MTEST01")).toBe("MTEST");
    expect(lessonGroup("5T1.1")).toBe("5T");
  });
  it("creates a full-prefix group at three lessons, including numeric prefixes", () => {
    const base = bundledTemplate().lessons.get("a1");
    if (!base) throw new Error("Missing sample lesson");
    const rows = ["1TNN1", "1TNN2", "1TNN10", "BC1", "BC2", "BC3", "RARE1", "RARE2"].map(code => ({ ...base, id: crypto.randomUUID(), code }));
    const grouped = groupLessons(rows);
    expect(grouped.find(group => group.name === "1TNN")?.lessons.map(lesson => lesson.code)).toEqual(["1TNN1", "1TNN2", "1TNN10"]);
    expect(grouped.find(group => group.name === "BC")?.lessons).toHaveLength(3);
    expect(grouped.some(group => group.name === "RARE")).toBe(false);
    expect(groupLessons(rows.slice(0, 2))[0]?.name).toBe("Khác");
  });
  it("sorts groups and lessons naturally without changing the original catalog", () => {
    const base = bundledTemplate();
    const lessons = [base.lessons.get("b2"), base.lessons.get("a10"), base.lessons.get("a2"), base.lessons.get("a1")].flatMap(lesson => lesson ? [lesson] : []);
    const before = [...lessons];
    const grouped = groupLessons(lessons);
    expect(grouped.map(group => group.name)).toEqual(["A", "B"]);
    expect(grouped[0]?.lessons.map(lesson => lesson.code)).toEqual(["A1", "A2", "A10"]);
    expect(lessons).toEqual(before);
  });
});
