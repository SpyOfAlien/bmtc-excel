"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { bundledTemplate } from "@/lib/bundled-template";
import { extendTemplate, listLessons } from "@/lib/storage-client";
import type { Lesson } from "@/lib/workbook";
import { NewLessonDialog } from "./storage-dialogs";
import { groupLessons, lessonGroup } from "@/lib/lesson-groups";
import { Search, Plus, ChevronRight, BookOpen } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";


export function LessonLibrary() {
  const base = useMemo(() => bundledTemplate(), []);
  const [custom, setCustom] = useState<Lesson[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["A"]));
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
  const groups = groupLessons(lessons);
  const selected = lessons.find(lesson => lesson.id === selectedId) ?? groups[0]?.lessons[0] ?? null;
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
            onChange={event => {
              setQuery(event.target.value);
              setSelectedId(null);
              setExpanded(event.target.value.trim() ? new Set(catalog.map(lesson => lessonGroup(lesson.code))) : new Set(["A"]));
            }}
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
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <nav aria-label="Nhóm bài học" className="max-h-[70dvh] overflow-y-auto rounded-lg bg-card p-2">
          {groups.map(group => {
            const open = expanded.has(group.name);
            return <div key={group.name}>
              <button type="button" aria-label={`Nhóm ${group.name}`} aria-expanded={open} aria-controls={`lesson-group-${group.name}`} className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left text-sm font-medium hover:bg-muted" onClick={() => {
                setExpanded(current => { const next = new Set(current); if (open) next.delete(group.name); else next.add(group.name); return next; });
                if (!open) setSelectedId(group.lessons[0]?.id ?? null);
              }}>
                <ChevronRight className={`size-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
                <span>Nhóm {group.name}</span><span className="ml-auto text-xs font-normal text-muted-foreground">{group.lessons.length}</span>
              </button>
              {open && <ul id={`lesson-group-${group.name}`} className="ml-5 space-y-1 border-l pl-2 pb-2">
                {group.lessons.map(lesson => <li key={lesson.id}><button type="button" aria-label={`Bài ${lesson.code}`} aria-current={selected?.id === lesson.id ? "true" : undefined} className={`flex w-full items-start gap-2 rounded-md px-3 py-2.5 text-left text-xs transition-colors ${selected?.id === lesson.id ? "bg-accent font-medium text-primary" : "hover:bg-muted"}`} onClick={() => setSelectedId(lesson.id)}>
                  <BookOpen className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span><span className="block font-medium">{lesson.code}</span><span className="mt-1 block text-muted-foreground">{lesson.name || "Chưa có tên bài"}</span></span>
                </button></li>)}
              </ul>}
            </div>;
          })}
          {!groups.length && <p className="p-4 text-sm text-muted-foreground">Không tìm thấy bài phù hợp.</p>}
        </nav>
        <section aria-label="Chi tiết bài học" className="min-w-0 rounded-lg bg-card p-5 sm:p-6">
          {selected ? <>
            <div className="mb-6 border-b pb-4">
              <span className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-primary">{selected.code}</span>
              <h2 className="mt-3 text-lg font-semibold">{selected.name || "Bài học"}</h2>
              <p className="mt-2 text-xs text-muted-foreground">{customIds.has(selected.id) ? "Bài tự thêm" : "Bài gốc"}</p>
            </div>
            <div className="space-y-6">
              {[
                { label: "Mục tiêu", value: selected.objective },
                { label: "Hướng dẫn", value: selected.instruction },
                { label: "Tiêu chí", value: selected.criteria },
              ].map(field => <div key={field.label}><h3 className="text-sm font-medium">{field.label}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{field.value || "Chưa có nội dung"}</p></div>)}
              {!!selected.scores.length && <div><h3 className="text-sm font-medium">Thang điểm</h3><div className="mt-3 space-y-2">{selected.scores.map(score => <div key={score.id} className="flex items-start gap-3 rounded-md bg-muted/50 p-3"><span className="rounded bg-accent px-2 py-1 text-xs font-medium text-primary">{score.label}</span><p className="whitespace-pre-wrap text-sm leading-relaxed">{score.criteria || "Chưa có tiêu chí"}</p></div>)}</div></div>}
            </div>
          </> : <p className="text-sm text-muted-foreground">Chọn bài học trong cây bên trái để xem nội dung.</p>}
        </section>
      </div>
      {adding && <NewLessonDialog close={() => setAdding(false)} saved={lesson => {
        setCustom(all => [...all, lesson]);
        setSelectedId(lesson.id);
        setExpanded(current => new Set([...current, lessonGroup(lesson.code)]));
        setQuery("");
        setAdding(false);
        setError("");
      }} />}
    </main>
  );
}
