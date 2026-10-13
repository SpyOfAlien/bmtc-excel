import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AddLessonRow, LessonFieldCell } from "../src/components/lesson-table-controls";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
let cleanup = () => {};
afterEach(() => { cleanup(); document.body.replaceChildren(); });

function render(element: ReturnType<typeof createElement>) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); act(() => root.render(element));
  cleanup = () => { act(() => root.unmount()); };
}

describe("lesson table controls", () => {
  it("offers a working add button in both the empty and final table row", () => {
    let count = 0;
    render(createElement(AddLessonRow, { empty: true, onAdd: () => { count++; } }));
    const button = document.querySelector("button");
    if (!(button instanceof HTMLButtonElement)) throw new Error("Missing add button");
    expect(button.className).toContain("pointer-events-auto");
    act(() => button.click()); expect(count).toBe(1);
    cleanup();
    render(createElement(AddLessonRow, { onAdd: () => { count++; }, disabled: true }));
    expect(document.querySelector("button")?.disabled).toBe(true);
  });
  it("shows source text directly and makes only missing content editable", () => {
    const changed: string[] = [];
    render(createElement(LessonFieldCell, { source: "Nội dung tham khảo", value: "Ghi đè", label: "Mục tiêu", disabled: false, change: value => changed.push(value) }));
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.body.textContent).toContain("Nội dung tham khảo");
    cleanup();
    render(createElement(LessonFieldCell, { source: "", value: "", label: "Mục tiêu", disabled: false, change: value => changed.push(value) }));
    const textarea = document.querySelector("textarea"), setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!textarea || !setter) throw new Error("Missing manual editor");
    act(() => { setter.call(textarea, "Nhập thủ công"); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(changed).toEqual(["Nhập thủ công"]);
  });
});
