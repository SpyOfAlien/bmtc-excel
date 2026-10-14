import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SearchPicker } from "../src/components/search-picker";
import { MonthPicker } from "../src/components/month-picker";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
let cleanup = () => {};
afterEach(() => { cleanup(); document.body.replaceChildren(); });
function render(element: ReturnType<typeof createElement>) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); act(() => root.render(element));
  cleanup = () => { act(() => root.unmount()); };
}
function input() {
  const element = document.querySelector('input[role="combobox"]');
  if (!(element instanceof HTMLInputElement)) throw new Error("Missing picker");
  return element;
}
function click(label: string) {
  const element = document.querySelector(`button[aria-label="${label}"]`);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing ${label}`);
  act(() => element.click());
}
it("filters score choices, picks with the keyboard, and preserves the selection when dismissed", () => {
  const selected: string[] = [];
  render(createElement(SearchPicker, { label: "Điểm", placeholder: "Chọn điểm…", options: [{ value: "1", label: "Điểm 1" }, { value: "2", label: "Điểm 2" }], selection: { kind: "single", value: "1", select: value => selected.push(value) } }));
  const field = input();
  expect(field.value).toBe("Điểm 1");
  act(() => field.focus());
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Missing value setter");
  act(() => { setter.call(field, "2"); field.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  act(() => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(selected).toEqual(["2"]);
  expect(field.getAttribute("aria-expanded")).toBe("false");
  act(() => field.click());
  act(() => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(selected).toEqual(["2"]);
});
it("skips unavailable options and does not open a disabled score picker", () => {
  const selected: string[] = [];
  render(createElement(SearchPicker, { label: "Điểm", placeholder: "Chọn điểm…", startOpen: true, options: [{ value: "1", label: "1" }, { value: "2", label: "2", disabled: true }, { value: "3", label: "3" }], selection: { kind: "single", value: "", select: value => selected.push(value) } }));
  act(() => input().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  act(() => input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(selected).toEqual(["3"]);
  cleanup();
  render(createElement(SearchPicker, { label: "Điểm", placeholder: "Chọn điểm…", disabled: true, options: [], selection: { kind: "single", value: "", select: () => {} } }));
  expect(input().disabled).toBe(true);
});
describe("month picker", () => {
  it("shows the selected month and allows selection in the following year", () => {
    const selected: { month: number; year: number }[] = [];
    render(createElement(MonthPicker, { month: 12, year: 2026, change: period => selected.push(period) }));
    expect(input().value).toBe("Tháng 12/2026");
    act(() => input().focus());
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(12);
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toBe("Tháng 12");
    click("Năm sau");
    click("Chọn Tháng 1");
    expect(selected).toEqual([{ month: 1, year: 2027 }]);
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });
  it("moves by three months vertically and one month horizontally", () => {
    const selected: { month: number; year: number }[] = [];
    render(createElement(MonthPicker, { month: 11, year: 2026, change: period => selected.push(period) }));
    act(() => input().focus());
    act(() => input().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    act(() => input().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    act(() => input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(selected).toEqual([{ month: 5, year: 2026 }]);
  });
});
