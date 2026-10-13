import { describe, expect, it } from "vitest";
import { bundledTemplate } from "../src/lib/bundled-template";
import { exportWorkbook, importPlans } from "../src/lib/workbook";

describe("repository template", () => {
  it("loads the complete catalog with empty student fields", () => {
    const template = bundledTemplate();
    expect(template.lessons.size).toBe(970);
    expect(template.reference).toHaveLength(3792);
    expect(template.values.get("C6")).toBe("");
    expect(template.values.get("F6")).toBe("");
    expect(template.defaults.teacher).toBe("Cô Hoà");
    expect([...template.values.keys()].every(coord => Number(coord.replace(/\D/g, "")) < 9)).toBe(true);
    expect(template.assets.get("xl/media/image2.png")?.length).toBeGreaterThan(0);
  });
  it("exports and reimports a plan without any source workbook", async () => {
    const template = bundledTemplate(), lesson = template.lessons.get("a5"), score = lesson?.scores[0];
    if (!lesson || !score) throw new Error("Missing catalog fixture");
    const bytes = await exportWorkbook(template, [{ id: "student", name: "Bé An", age: "5", teacher: "Cô Hoà", manager: "", period: "Tháng 10/2026", lessons: [{
      id: "lesson", code: lesson.code, scoreId: score.id, notes: "Ghi chú", manual: { name: "", objective: "", instruction: "", criteria: "", score: "" },
    }] }]);
    const restored = importPlans(bytes, template);
    expect(restored[0]?.name).toBe("Bé An");
    expect(restored[0]?.lessons[0]?.code).toBe("A5");
    expect(restored[0]?.lessons[0]?.manual.score).toBe(String(score.value));
    expect(restored[0]?.lessons[0]?.notes).toBe("Ghi chú");
  });
});
