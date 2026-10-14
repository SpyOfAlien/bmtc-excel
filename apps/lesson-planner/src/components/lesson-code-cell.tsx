"use client";

import { useState } from "react";
import { normalize } from "@/lib/workbook";
import { emptyManualFields } from "@/lib/lesson-fields";
import type { DraftLesson, Lesson } from "@/lib/workbook";
import { Button } from "@/components/ui/button";
import { SearchPicker } from "./search-picker";

export function LessonCodeCell({ row, lessons, getRows, limit, startOpen, close, commit }: {
  row: DraftLesson & { index: number };
  lessons: Map<string, Lesson>;
  getRows: () => DraftLesson[];
  limit: number;
  startOpen: boolean;
  close: () => void;
  commit: (rowId: string, selected: DraftLesson[]) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [selected, setSelected] = useState<string[]>(row.code ? [row.code] : []);
  const used = new Set(getRows().filter(other => other.id !== row.id).map(other => normalize(other.code)));
  const capacity = Math.max(0, limit - getRows().length + 1);
  function dismiss() { setOpen(false); close(); }
  function apply() {
    commit(row.id, selected.map(code => ({
      id: crypto.randomUUID(),
      lessonId: lessons.get(normalize(code))?.id ?? null,
      code,
      scoreId: "",
      notes: "",
      manual: emptyManualFields(),
    })));
    dismiss();
  }
  return <div className="lesson-code-cell flex h-full flex-col justify-center gap-1 py-2">
    <SearchPicker label={`Bài số bài ${row.index}`} placeholder="Chọn bài" display={row.code} className="h-7 px-2 pr-7 text-xs" contentClassName="w-[520px] min-w-0 max-w-[calc(100vw-2rem)] [&_[role=listbox]]:max-h-80" startOpen={startOpen} openState={{ open, change: next => {
      if (next) { setSelected(row.code ? [row.code] : []); setOpen(true); }
      else dismiss();
    } }} options={Array.from(lessons.values()).map(lesson => ({
      value: lesson.code,
      label: `${lesson.code} · ${lesson.name || "Chưa có tên bài"}`,
      keywords: lesson.objective,
      description: used.has(normalize(lesson.code)) ? "Đã có trong kế hoạch" : !lesson.scores.length ? "Nhập điểm thủ công" : `${lesson.scores.length} lựa chọn điểm`,
      disabled: used.has(normalize(lesson.code)) || (!selected.includes(lesson.code) && selected.length >= capacity),
    }))} selection={{ kind: "multiple", values: selected, select: code => setSelected(all => all.includes(code) ? all.filter(value => value !== code) : [...all, code]) }} footer={<div className="flex items-center justify-between gap-2 border-t p-2">
      <Button variant="ghost" size="sm" onClick={dismiss}>Hủy</Button>
      <Button size="sm" disabled={!selected.length || selected.length > capacity} onClick={apply}>Áp dụng {selected.length} bài</Button>
    </div>} />
  </div>;
}
