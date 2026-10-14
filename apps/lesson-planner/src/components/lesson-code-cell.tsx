"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { normalize } from "@/lib/workbook";
import { emptyManualFields } from "@/lib/lesson-fields";
import type { DraftLesson, Lesson } from "@/lib/workbook";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

export function LessonCodeCell({
  row,
  lessons,
  getRows,
  limit,
  startOpen,
  close,
  commit,
}: {
  row: DraftLesson & { index: number };
  lessons: Map<string, Lesson>;
  getRows: () => DraftLesson[];
  limit: number;
  startOpen: boolean;
  close: () => void;
  commit: (rowId: string, selected: DraftLesson[]) => void;
}) {
  const [open, setOpen] = useState(startOpen),
    [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(
    row.code ? [row.code] : [],
  );
  const input = useRef<HTMLInputElement>(null),
    results = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (startOpen) input.current?.focus();
  }, [startOpen]);
  const choices = useMemo(() => {
    const key = normalize(query);
    return Array.from(lessons.values())
      .filter((lesson) =>
        normalize(`${lesson.code} ${lesson.name} ${lesson.objective}`).includes(
          key,
        ),
      )
      .sort(
        (a, b) =>
          Number(normalize(b.code) === key) - Number(normalize(a.code) === key),
      );
  }, [lessons, query]);
  const used = new Set(
    getRows()
      .filter((other) => other.id !== row.id)
      .map((other) => normalize(other.code)),
  );
  const capacity = Math.max(0, limit - getRows().length + 1);
  function dismiss() {
    setOpen(false);
    close();
  }
  function begin() {
    if (open) return;
    setQuery("");
    setSelected(row.code ? [row.code] : []);
    setOpen(true);
  }
  function apply() {
    commit(
      row.id,
      selected.map((code) => ({
        id: crypto.randomUUID(),
        lessonId: lessons.get(normalize(code))?.id ?? null,
        code,
        scoreId: "",
        notes: "",
        manual: emptyManualFields(),
      })),
    );
    dismiss();
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      modal={false}
    >
      <div className="lesson-code-cell flex h-full flex-col justify-center gap-1 py-2">
        <PopoverAnchor asChild>
          <Input
            ref={input}
            className="h-8 px-2 text-xs"
            aria-label={`Bài số bài ${row.index}`}
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            autoComplete="off"
            placeholder="Tìm bài số…"
            value={open ? query : row.code}
            onFocus={begin}
            onChange={(event) => {
              begin();
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") dismiss();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                results.current
                  ?.querySelector<HTMLButtonElement>("button:not([disabled])")
                  ?.focus();
              }
            }}
          />
        </PopoverAnchor>
        <span className="text-[10px] leading-tight text-muted-foreground">
          {open ? `${selected.length} bài đã chọn` : "Chọn nhiều bài"}
        </span>
      </div>
      <PopoverContent
        role="region"
        aria-label="Chọn nhiều bài học"
        align="start"
        className="w-[460px] max-w-[calc(100vw-2rem)] p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target === input.current) event.preventDefault();
        }}
      >
        <div className="border-b p-3">
          <p className="text-xs text-muted-foreground">
            Tích chọn bài, rồi nhấn Áp dụng.
          </p>
          {selected.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selected.map((code) => (
                <Badge key={code} variant="secondary">
                  {code}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div
          id={id}
          ref={results}
          className="max-h-64 overflow-y-auto p-2"
          aria-label="Kết quả tìm bài"
        >
          {choices.map((lesson) => {
            const checked = selected.includes(lesson.code),
              duplicate = used.has(normalize(lesson.code));
            const disabled =
              duplicate || (!checked && selected.length >= capacity);
            const optionId = `${id}-${normalize(lesson.code)}`;
            return (
              <Label
                key={lesson.code}
                htmlFor={optionId}
                className={`flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent ${disabled ? "cursor-default opacity-50" : ""}`}
              >
                <Checkbox
                  id={optionId}
                  className="mt-0.5"
                  aria-label={`Chọn bài ${lesson.code}`}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(value) =>
                    setSelected((all) =>
                      value === true
                        ? [...all, lesson.code]
                        : all.filter((code) => code !== lesson.code),
                    )
                  }
                />
                <span className="min-w-0 text-xs leading-relaxed">
                  <strong className="mr-2">{lesson.code}</strong>
                  {lesson.name || "Chưa có tên bài"}
                  <small className="block text-[10px] text-muted-foreground">
                    {duplicate
                      ? "Đã có trong kế hoạch"
                      : !lesson.scores.length
                        ? "Nhập điểm thủ công"
                        : `${lesson.scores.length} lựa chọn điểm`}
                  </small>
                </span>
              </Label>
            );
          })}
          {!choices.length && (
            <p className="p-3 text-xs text-muted-foreground">
              Không có bài phù hợp.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-3">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Hủy
          </Button>
          <Button
            size="sm"
            disabled={!selected.length || selected.length > capacity}
            onClick={apply}
          >
            Áp dụng {selected.length} bài
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
