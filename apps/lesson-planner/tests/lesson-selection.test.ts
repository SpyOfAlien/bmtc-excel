import { emptyManualFields } from "../src/lib/lesson-fields";
import { describe, expect, it } from "vitest";
import { applyLessonSelection } from "../src/lib/lesson-selection";
import type { DraftLesson } from "../src/lib/workbook";

const lesson = (code: string): DraftLesson => ({ id: `new-${code}`, code, scoreId: "", notes: "", manual: emptyManualFields() });

describe("inline multi-lesson selection", () => {
  it("fills a blank row and inserts selected lessons in order before later rows", () => {
    const blank = { id: "blank", code: "", scoreId: "", notes: "Note", manual: emptyManualFields() }, later = lesson("B1");
    const result = applyLessonSelection({ rows: [blank, later], rowId: blank.id, selected: [lesson("A5"), lesson("A1")], limit: 20 });
    expect(result.map(row => row.code)).toEqual(["A5", "A1", "B1"]);
    expect(result[0]).toEqual({ ...blank, code: "A5" });
    expect(result[2]).toBe(later);
    expect(blank.code).toBe("");
  });
  it("retains an existing lesson's score, note and identity when included in the selection", () => {
    const existing = { id: "original", code: "A5", scoreId: "score-2", notes: "Keep", manual: emptyManualFields() };
    const result = applyLessonSelection({ rows: [existing], rowId: existing.id, selected: [lesson("A1"), lesson("A5")], limit: 20 });
    expect(result.map(row => row.code)).toEqual(["A1", "A5"]);
    expect(result[1]).toBe(existing);
    expect(applyLessonSelection({ rows: [existing], rowId: existing.id, selected: [lesson("A1")], limit: 20 })[0]).toEqual({ ...existing, code: "A1", scoreId: "" });
  });
  it("prevents duplicates and enforces the child's remaining row capacity", () => {
    const rows = [lesson("B1"), lesson("")];
    const result = applyLessonSelection({ rows, rowId: "new-", selected: [lesson(" b 1 "), lesson("A1"), lesson("a 1"), lesson("A5"), lesson("A6")], limit: 3 });
    expect(result.map(row => row.code)).toEqual(["B1", "A1", "A5"]);
    expect(applyLessonSelection({ rows, rowId: "missing", selected: [lesson("A1")], limit: 3 })).toBe(rows);
    expect(applyLessonSelection({ rows, rowId: "new-", selected: [], limit: 3 })).toBe(rows);
  });
});
