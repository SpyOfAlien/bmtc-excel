import { describe, expect, it } from "vitest";
import { emptyManualFields, resolveLessonFields } from "../src/lib/lesson-fields";
import type { Lesson, Score } from "../src/lib/workbook";

const score: Score = { id: "2", label: "2", source: "A1.2", value: 2, criteria: "", row: 3, dateLike: false };
const lesson: Lesson = { id: crypto.randomUUID(), code: "A1", name: "Tên từ tham khảo", objective: "", instruction: "HD từ tham khảo", criteria: "Tiêu chí của điểm khác", row: 3, scores: [score] };
const manual = { name: "Không thay tên", objective: "Mục tiêu thủ công", instruction: "Không thay HD", criteria: "Tiêu chí thủ công", score: "Không thay điểm" };

describe("reference and manual lesson fields", () => {
  it("uses manual content only where the selected reference has no value", () => {
    expect(resolveLessonFields(lesson, score, manual)).toEqual({ name: lesson.name, objective: manual.objective, instruction: lesson.instruction, criteria: manual.criteria, score: 2 });
    expect(resolveLessonFields(lesson, { ...score, criteria: "TC từ điểm 2" }, manual).criteria).toBe("TC từ điểm 2");
  });
  it("uses a manual score while retaining criteria for an unscored lesson", () => {
    const unscored = { ...lesson, scores: [] };
    expect(resolveLessonFields(unscored, null, { ...emptyManualFields(), score: " 2 / 4 " })).toMatchObject({ score: "2 / 4", criteria: lesson.criteria });
  });
});
