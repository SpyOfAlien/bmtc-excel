import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LessonLibrary } from "../src/components/lesson-library";
import { bundledTemplate } from "../src/lib/bundled-template";
import { lessonGroup } from "../src/lib/lesson-groups";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
let cleanup = () => {};
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function button(label: string) {
  const element = document.querySelector(`button[aria-label="${label}"]`);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing ${label}`);
  return element;
}
async function renderLibrary() {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  cleanup = () => { act(() => root.unmount()); };
  await act(async () => root.render(createElement(LessonLibrary)));
}
function visibleCodes() {
  return Array.from(document.querySelectorAll("table tbody tr")).map(row => row.querySelector("td")?.textContent ?? "");
}
it("filters the list with multiple group checkboxes and supports selecting all or no groups", async () => {
  await renderLibrary();
  const catalog = [...bundledTemplate().lessons.values()];
  expect(visibleCodes()).toHaveLength(catalog.length);
  expect(button("Nhóm A").getAttribute("role")).toBe("checkbox");
  act(() => button("Tất cả nhóm").click());
  expect(visibleCodes()).toHaveLength(0);
  act(() => button("Nhóm A").click());
  expect(visibleCodes()).toHaveLength(catalog.filter(lesson => lessonGroup(lesson.code) === "A").length);
  expect(visibleCodes()).toContain("A1");
  expect(visibleCodes()).not.toContain("B1");
  act(() => button("Nhóm B").click());
  expect(visibleCodes()).toContain("A1");
  expect(visibleCodes()).toContain("B1");
  expect(visibleCodes()).not.toContain("C1");
  expect(button("Tất cả nhóm").getAttribute("aria-checked")).toBe("mixed");
  act(() => button("Tất cả nhóm").click());
  expect(visibleCodes()).toHaveLength(catalog.length);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("combines search with the selected groups and opens details for a list item", async () => {
  await renderLibrary();
  act(() => button("Tất cả nhóm").click());
  act(() => button("Nhóm B").click());
  const field = document.querySelector('input[placeholder="Mã bài, tên hoặc mục tiêu…"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!(field instanceof HTMLInputElement) || !setter) throw new Error("Missing search");
  act(() => { setter.call(field, "B2"); field.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(visibleCodes()).toContain("B2");
  expect(visibleCodes().every(code => lessonGroup(code) === "B")).toBe(true);
  expect(button("Nhóm B").getAttribute("aria-checked")).toBe("true");
  act(() => button("Chi tiết bài B2").click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(bundledTemplate().lessons.get("b2")?.name);
});

it("filters numeric prefixes without regrouping when the lesson search narrows to one result", async () => {
  await renderLibrary();
  act(() => button("Tất cả nhóm").click());
  act(() => button("Nhóm 1TNN").click());
  const groupSearch = document.querySelector('input[aria-label="Tìm nhóm bài học"]');
  const lessonSearch = document.querySelector('input[placeholder="Mã bài, tên hoặc mục tiêu…"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!(groupSearch instanceof HTMLInputElement) || !(lessonSearch instanceof HTMLInputElement) || !setter) throw new Error("Missing search");
  act(() => { setter.call(groupSearch, "1TNN"); groupSearch.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(document.querySelector('button[aria-label="Nhóm A"]')).toBeNull();
  expect(button("Nhóm 1TNN").getAttribute("aria-checked")).toBe("true");
  const target = visibleCodes()[0];
  if (!target) throw new Error("Missing numeric-prefix lesson");
  act(() => { setter.call(lessonSearch, target); lessonSearch.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(visibleCodes()).toContain(target);
  expect(visibleCodes().every(code => code.startsWith("1TNN"))).toBe(true);
});
