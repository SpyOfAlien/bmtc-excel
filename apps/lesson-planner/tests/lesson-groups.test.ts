import { describe, expect, it } from "vitest";
import { groupLessons, lessonGroup } from "../src/lib/lesson-groups";
import { bundledTemplate } from "../src/lib/bundled-template";

describe("lesson groups", () => {
  it("groups by initial letter and puts numeric codes in the other group", () => {
    expect(lessonGroup(" a10 ")).toBe("A");
    expect(lessonGroup("MTEST01")).toBe("M");
    expect(lessonGroup("5T1.1")).toBe("Khác");
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
