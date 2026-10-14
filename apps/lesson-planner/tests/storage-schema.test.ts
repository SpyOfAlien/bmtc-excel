import { describe, expect, it } from "vitest";
import data from "../src/data/lesson-template.json";
import { bundledTemplate } from "../src/lib/bundled-template";
import { planInputSchema } from "../src/lib/storage-schema";
import { extendTemplate } from "../src/lib/storage-client";
import { exportWorkbook, importPlans } from "../src/lib/workbook";
import type { PlanInput } from "../src/lib/storage-schema";
import type { Lesson } from "../src/lib/workbook";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function testLesson(): Lesson {
  return { id: crypto.randomUUID(), code: "M001", name: "Bài tự thêm", objective: "Mục tiêu", instruction: "Hướng dẫn", criteria: "Tiêu chí chung", row: 0, scores: [{ id: crypto.randomUUID(), value: "2", label: "2", source: "2", criteria: "Tiêu chí điểm 2", row: 0, dateLike: false }] };
}
export function testPlan(lesson = testLesson()): PlanInput {
  return { schemaVersion: 1, id: crypto.randomUUID(), title: "Giáo án thử", month: 10, year: 2026, expectedRevision: 0, lessons: [lesson], children: [{ id: crypto.randomUUID(), name: "Bé thử", age: "5 tuổi", teacher: "Cô Hoà", manager: "", period: "Tháng 10/2026", lessons: [{ id: crypto.randomUUID(), lessonId: lesson.id, code: lesson.code, scoreId: lesson.scores[0]?.id ?? "", notes: "Ghi chú giữ nguyên", manual: { name: "", objective: "", instruction: "", criteria: "", score: "" } }] }] };
}
describe("storage data", () => {
  it("uses unique UUIDs for every JSON lesson, score and reference record", () => {
    const ids = [...data.lessons.flatMap(lesson => [lesson.id, ...lesson.scores.map(score => score.id)]), ...data.reference.map(row => row.id)];
    expect(ids.every(id => uuidPattern.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const lessonIds = new Set(data.lessons.map(lesson => lesson.id));
    expect(data.reference.every(row => row.lessonId === null || lessonIds.has(row.lessonId))).toBe(true);
  });
  it("accepts unfinished drafts but rejects mismatched lesson and score identities", () => {
    const plan = testPlan();
    expect(planInputSchema.safeParse(plan).success).toBe(true);
    const child = plan.children[0], row = child?.lessons[0];
    if (!child || !row) throw new Error("Missing test row");
    row.scoreId = crypto.randomUUID();
    expect(planInputSchema.safeParse(plan).success).toBe(false);
    row.scoreId = ""; row.lessonId = null; row.code = ""; child.name = "";
    expect(planInputSchema.safeParse(plan).success).toBe(true);
  });
  it("keeps student identity distinct from tab identity and rejects duplicate student tabs", () => {
    const plan = testPlan(), child = plan.children[0];
    if (!child) throw new Error("Missing child");
    child.studentId = crypto.randomUUID();
    plan.children.push({ ...child, id: crypto.randomUUID(), lessons: [] });
    expect(planInputSchema.safeParse(plan).success).toBe(false);
    const second = plan.children[1]; if (!second) throw new Error("Missing second child");
    second.studentId = crypto.randomUUID();
    expect(planInputSchema.parse(plan).children[0]?.studentId).toBe(child.studentId);
  });
  it("exports custom lessons and preserves their UUID when importing Excel again", async () => {
    const lesson = testLesson(), template = extendTemplate(bundledTemplate(), [lesson]), plan = testPlan(lesson);
    const imported = importPlans(await exportWorkbook(template, plan.children), template);
    expect(imported[0]?.lessons[0]?.lessonId).toBe(lesson.id);
    expect(imported[0]?.lessons[0]?.manual.criteria).toBe("Tiêu chí điểm 2");
    expect(imported[0]?.lessons[0]?.notes).toBe("Ghi chú giữ nguyên");
  });
  it("merges new lessons and saved snapshots without changing the base catalog", () => {
    const base = bundledTemplate(), added = testLesson();
    const extended = extendTemplate(base, [added]);
    expect(extended.lessons.get("m001")?.id).toBe(added.id);
    expect(extended.reference.find(row => row.lessonId === added.id)?.criteria).toBe("Tiêu chí điểm 2");
    expect(base.lessons.has("m001")).toBe(false);
    const saved = { ...added, name: "Tên trong giáo án đã lưu" };
    expect(extendTemplate(extended, [saved]).lessons.get("m001")?.name).toBe(saved.name);
  });
});
