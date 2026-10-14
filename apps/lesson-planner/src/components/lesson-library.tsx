"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { bundledTemplate } from "@/lib/bundled-template";
import { extendTemplate, listLessons } from "@/lib/storage-client";
import type { Lesson } from "@/lib/workbook";
import { NewLessonDialog } from "./storage-dialogs";
import { Search, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function LessonLibrary() {
  const base = useMemo(() => bundledTemplate(), []);
  const [custom, setCustom] = useState<Lesson[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const refresh = useCallback(
    async (cancelled: () => boolean = () => false) => {
      setLoading(true);
      try {
        const lessons = await listLessons();
        if (!cancelled()) {
          setCustom(lessons);
          setError("");
        }
      } catch (error) {
        if (!cancelled())
          setError(
            error instanceof Error
              ? error.message
              : "Không tải được bài tự thêm.",
          );
      } finally {
        if (!cancelled()) setLoading(false);
      }
    },
    [],
  );
  useEffect(() => {
    let cancelled = false;
    void refresh(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  const catalog = useMemo(
    () => [...extendTemplate(base, custom).lessons.values()],
    [base, custom],
  );
  const key = query.trim().toLocaleLowerCase("vi");
  const lessons = catalog.filter((lesson) =>
    `${lesson.code} ${lesson.name} ${lesson.objective}`
      .toLocaleLowerCase("vi")
      .includes(key),
  );
  const customIds = new Set(custom.map((lesson) => lesson.id));
  return (
    <main className="dashboard-page">
      <div className="page-toolbar">
        <div>
          <h1>Thư viện bài học</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tra cứu bài mẫu và thêm bài để sử dụng trong kế hoạch.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus aria-hidden="true" /> Thêm bài mẫu</Button>
      </div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-4 rounded-t-lg bg-card p-5">
        <p className="text-sm text-muted-foreground">
          {lessons.length} / {catalog.length} bài học
        </p>
        <Label className="grid gap-2">
          <span className="sr-only">Tìm bài học</span>
          <div className="search-field"><Search aria-hidden="true" /><Input
            type="search"
            className="border-transparent bg-muted pl-9 shadow-none"
            placeholder="Mã bài, tên hoặc mục tiêu…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          /></div>
        </Label>
      </div>
      {loading && (
        <p role="status" className="mb-4 text-sm">
          Đang tải bài tự thêm…
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 text-sm"
        >
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Thử lại
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-b-lg bg-card px-5 pb-5">
        <table className="dashboard-table min-w-[640px]">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="p-4">Mã bài</th>
              <th className="p-4">Tên bài</th>
              <th className="p-4">Nguồn</th>
              <th className="p-4">
                <span className="sr-only">Chi tiết</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((lesson) => (
              <tr key={lesson.id} className="border-t hover:bg-muted/20">
                <td className="p-4 font-medium"><span className="rounded-md bg-accent px-2.5 py-1.5 text-xs text-primary">{lesson.code}</span></td>
                <td className="p-4">{lesson.name || "Chưa có tên bài"}</td>
                <td className="whitespace-nowrap p-4 text-muted-foreground">
                  {customIds.has(lesson.id) ? "Tự thêm" : "Bài gốc"}
                </td>
                <td className="p-4 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Chi tiết bài ${lesson.code}`}
                    onClick={() => setSelected(lesson)}
                  >
                    Chi tiết
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lessons.length && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Không tìm thấy bài phù hợp.
          </p>
        )}
      </div>
      {adding && (
        <NewLessonDialog
          close={() => setAdding(false)}
          saved={(lesson) => {
            setCustom((all) => [...all, lesson]);
            setAdding(false);
            setError("");
          }}
        />
      )}
      {selected && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selected.code} · {selected.name || "Bài học"}
              </DialogTitle>
              <DialogDescription>
                Nội dung tham khảo để soạn kế hoạch.
              </DialogDescription>
            </DialogHeader>
            {[
              { label: "Mục tiêu", value: selected.objective },
              { label: "Hướng dẫn", value: selected.instruction },
              { label: "Tiêu chí", value: selected.criteria },
            ].map((field) => (
              <div key={field.label}>
                <h2>{field.label}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {field.value || "Chưa có nội dung"}
                </p>
              </div>
            ))}
            {!!selected.scores.length && (
              <div>
                <h2>Thang điểm</h2>
                {selected.scores.map((score) => (
                  <p
                    key={score.id}
                    className="mt-2 whitespace-pre-wrap text-sm"
                  >
                    <strong>{score.label}</strong>
                    {score.criteria ? `: ${score.criteria}` : ""}
                  </p>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
