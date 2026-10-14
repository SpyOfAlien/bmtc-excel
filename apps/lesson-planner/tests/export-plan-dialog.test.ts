import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ExportPlanDialog } from "../src/components/export-plan-dialog";
import type { ChildDraft } from "../src/lib/workbook";
import { emptyManualFields } from "../src/lib/lesson-fields";
import { bundledTemplate } from "../src/lib/bundled-template";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
let cleanup = () => {};
afterEach(() => { cleanup(); document.body.replaceChildren(); vi.restoreAllMocks(); });
function render(prepare: NonNullable<Parameters<typeof ExportPlanDialog>[0]["prepare"]>) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(ExportPlanDialog, {
    loaded: { template: bundledTemplate(), filename: "template.xlsx", directory: null },
    childrenPlans: [], month: 11, year: 2026, prepare, close: () => {}, saved: () => {},
  })));
  cleanup = () => { act(() => root.unmount()); };
}
function createDownload() {
  const button = Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Tải xuống qua trình duyệt");
  if (!button) throw new Error("Missing export button");
  button.click();
}
it("waits for the current plan to be saved before creating a downloadable workbook", async () => {
  const lesson = bundledTemplate().lessons.get("a1");
  const score = lesson?.scores[0];
  if (!lesson || !score) throw new Error("Missing reference lesson");
  const savedChildren: ChildDraft[] = [{ id: crypto.randomUUID(), name: "Bé kiểm thử", age: "5 tuổi", teacher: "Cô Hoà", manager: "Cô Hương", period: "Tháng 11/2026", lessons: [{ id: crypto.randomUUID(), lessonId: lesson.id, code: lesson.code, scoreId: score.id, notes: "Ghi chú mới nhất", manual: emptyManualFields() }] }];
  let finish: (rows: ChildDraft[]) => void = () => {};
  const prepare = vi.fn(() => new Promise<ChildDraft[]>(resolve => { finish = resolve; }));
  const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export-test");
  render(prepare);
  await act(async () => { createDownload(); });
  expect(prepare).toHaveBeenCalledWith({ month: 11, year: 2026 });
  expect(document.body.textContent).toContain("Đang lưu giáo án…");
  expect(createUrl).not.toHaveBeenCalled();
  await act(async () => { finish(savedChildren); });
  expect(createUrl).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain("Đã lưu giáo án. Workbook đã sẵn sàng.");
});
it("stops exporting and permits retry when saving the plan fails", async () => {
  const prepare = vi.fn().mockRejectedValue(new Error("Không lưu được giáo án."));
  const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export-test");
  render(prepare);
  await act(async () => { createDownload(); });
  expect(createUrl).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Không lưu được giáo án.");
  expect(document.querySelector('button[disabled]')).toBeNull();
  await act(async () => { createDownload(); });
  expect(prepare).toHaveBeenCalledTimes(2);
});
