import { emptyManualFields } from "../src/lib/lesson-fields";
import { describe, expect, it } from "vitest";
import { moveLesson } from "../src/lib/lesson-order";

const rows = [
  { id: "a", code: "A1", scoreId: "one", notes: "Ghi chú A1", manual: emptyManualFields() },
  { id: "b", code: "A5", scoreId: "two", notes: "", manual: emptyManualFields() },
  { id: "c", code: "A6", scoreId: "three", notes: "", manual: emptyManualFields() },
];

describe("lesson order", () => {
  it("moves rows in both directions without changing scores or the original array", () => {
    const moved = moveLesson(rows, "a", 2);
    expect(moved).toEqual([rows[1], rows[2], rows[0]]);
    expect(moveLesson(moved, "a", 0)).toEqual(rows);
    expect(rows.map(row => row.id)).toEqual(["a", "b", "c"]);
    expect(moved[2]).toBe(rows[0]);
  });
  it("ignores missing rows, unchanged positions, and out-of-bounds moves", () => {
    for (const target of [-1, 3, 1.5, NaN, 0]) expect(moveLesson(rows, "a", target)).toBe(rows);
    expect(moveLesson(rows, "missing", 1)).toBe(rows);
  });
});
