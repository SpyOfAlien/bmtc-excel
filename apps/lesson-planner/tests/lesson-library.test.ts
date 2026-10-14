import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LessonLibrary } from "../src/components/lesson-library";
import { bundledTemplate } from "../src/lib/bundled-template";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
let cleanup = () => {};
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function button(label: string) {
  const element = document.querySelector(`button[aria-label="${label}"]`);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing ${label}`);
  return element;
}
it("expands a group, selects its first lesson, and updates the detail panel when another lesson is clicked", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  cleanup = () => { act(() => root.unmount()); };
  await act(async () => root.render(createElement(LessonLibrary)));
  expect(button("Nhóm A").getAttribute("aria-expanded")).toBe("true");
  expect(button("Bài A1").getAttribute("aria-current")).toBe("true");
  act(() => button("Nhóm B").click());
  expect(button("Nhóm B").getAttribute("aria-expanded")).toBe("true");
  expect(button("Bài B1").getAttribute("aria-current")).toBe("true");
  const detail = document.querySelector('section[aria-label="Chi tiết bài học"]');
  expect(detail?.textContent).toContain(bundledTemplate().lessons.get("b1")?.name);
  act(() => button("Bài B2").click());
  expect(button("Bài B2").getAttribute("aria-current")).toBe("true");
  expect(detail?.textContent).toContain(bundledTemplate().lessons.get("b2")?.name);
  act(() => button("Nhóm B").click());
  expect(button("Nhóm B").getAttribute("aria-expanded")).toBe("false");
  expect(document.querySelector('button[aria-label="Bài B2"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
