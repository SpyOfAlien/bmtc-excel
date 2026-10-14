import { emptyManualFields } from "../src/lib/lesson-fields";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { LessonCodeCell } from "../src/components/lesson-code-cell";
import type { DraftLesson, Lesson } from "../src/lib/workbook";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
let cleanup = () => {};
afterEach(() => { cleanup(); document.body.replaceChildren(); });

const makeLesson = (code: string, scored = true): Lesson => ({
  id: crypto.randomUUID(), code, name: `Tên ${code}`, objective: "Mục tiêu", instruction: "Hướng dẫn", criteria: "Tiêu chí", row: 3,
  scores: scored ? [{ id: code, label: "2", source: `${code}.2`, value: 2, criteria: "Tiêu chí", row: 3, dateLike: false }] : [],
});
const lessons = new Map([makeLesson("A1"), makeLesson("A5"), makeLesson("B1"), makeLesson("C1", false)].map(lesson => [lesson.code.toLowerCase(), lesson]));

function renderPicker(otherRows: DraftLesson[] = [], availableLessons = lessons) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container), selected: DraftLesson[][] = [];
  const row = { id: "blank", lessonId: null, code: "", scoreId: "", notes: "", manual: emptyManualFields(), index: 1 };
  act(() => root.render(createElement(LessonCodeCell, { row, lessons: availableLessons, getRows: () => [row, ...otherRows], limit: 10, startOpen: true,
    close: () => {}, commit: (_id, rows) => { selected.push(rows); } })));
  cleanup = () => { act(() => root.unmount()); };
  return selected;
}
function checkbox(code: string) {
  const element = document.querySelector(`button[role="checkbox"][aria-label="Chọn bài ${code}"]`);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing checkbox ${code}`);
  return element;
}
function button(text: string) {
  const element = Array.from(document.querySelectorAll("button")).find(button => button.textContent === text);
  if (!element) throw new Error(`Missing button ${text}`);
  return element;
}
function search(value: string) {
  const input = document.querySelector('input[aria-label="Bài số bài 1"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("Missing inline input");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Missing input value setter");
  act(() => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("inline lesson control", () => {
  it("opens beside the cell and applies several selected lessons in click order", () => {
    const committed = renderPicker();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    act(() => checkbox("A5").click()); act(() => checkbox("A1").click());
    act(() => button("Áp dụng 2 bài").click());
    expect(committed[0]?.map(row => row.code)).toEqual(["A5", "A1"]);
    expect(committed[0]?.every(row => !row.scoreId && !row.notes)).toBe(true);
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  });
  it("keeps selections while filtering, rejects duplicates, and allows unscored lessons", () => {
    const committed = renderPicker([{ id: "other", lessonId: null, code: "B1", scoreId: "", notes: "", manual: emptyManualFields() }]);
    expect(checkbox("B1").disabled).toBe(true); expect(checkbox("C1").disabled).toBe(false);
    act(() => checkbox("A5").click());
    search("A1");
    expect(document.querySelector('button[aria-label="Chọn bài A5"]')).toBeNull();
    act(() => checkbox("A1").click());
    act(() => button("Áp dụng 2 bài").click());
    expect(committed[0]?.map(row => row.code)).toEqual(["A5", "A1"]);
  });
  it("shows and selects lessons beyond the first 100 results", () => {
    const catalog = new Map(Array.from({ length: 150 }, (_, index) => {
      const lesson = makeLesson(`D${index + 1}`);
      return [lesson.code.toLowerCase(), lesson] as const;
    }));
    const committed = renderPicker([], catalog);
    expect(document.querySelectorAll('button[role="checkbox"]')).toHaveLength(150);
    act(() => checkbox("D150").click());
    act(() => button("Áp dụng 1 bài").click());
    expect(committed[0]?.[0]?.code).toBe("D150");
  });
  it("does not add rows when the selection is cancelled", () => {
    const committed = renderPicker();
    act(() => checkbox("A1").click()); act(() => button("Hủy").click());
    expect(committed).toHaveLength(0);
  });
  it("adds a lesson without predefined score options", () => {
    const committed = renderPicker();
    act(() => checkbox("C1").click()); act(() => button("Áp dụng 1 bài").click());
    expect(committed[0]?.[0]?.code).toBe("C1");
    expect(committed[0]?.[0]?.manual.score).toBe("");
  });
});
