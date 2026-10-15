"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { bundledTemplate } from "@/lib/bundled-template";
import { extendTemplate, listLessons } from "@/lib/storage-client";
import type { Lesson } from "@/lib/workbook";
import { NewLessonDialog } from "./storage-dialogs";
import { groupLessons } from "@/lib/lesson-groups";
import { Search, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

type GroupFilter = { kind: "all" } | { kind: "selected"; groups: Set<string> };


export function LessonLibrary() {
  const base = useMemo(() => bundledTemplate(), []);
  const [custom, setCustom] = useState<Lesson[]>([]);
  const [query, setQuery] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>({ kind: "all" });
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
  const customIds = new Set(custom.map((lesson) => lesson.id));
  const groups = useMemo(() => groupLessons(catalog), [catalog]);
  const visibleGroups = groups.filter(group => group.name.toLocaleLowerCase("vi").includes(groupQuery.trim().toLocaleLowerCase("vi")));
  const isGroupSelected = (group: string) => groupFilter.kind === "all" || groupFilter.groups.has(group);
  const lessons = groups.flatMap(group => isGroupSelected(group.name) ? group.lessons.filter(lesson =>
    `${lesson.code} ${lesson.name} ${lesson.objective}`.toLocaleLowerCase("vi").includes(key)
  ) : []);
  const selected = catalog.find(lesson => lesson.id === selectedId) ?? null;
  const selectedGroupCount = groups.filter(group => isGroupSelected(group.name)).length;
  const allChecked = selectedGroupCount === groups.length;
  function toggleGroup(group: string, checked: boolean) {
    setGroupFilter(current => {
      const next = current.kind === "all" ? new Set(groups.map(item => item.name)) : new Set(current.groups);
      if (checked) next.add(group); else next.delete(group);
      return { kind: "selected", groups: next };
    });
  }
  return (
    <main className="dashboard-page library-page">
      <h1 className="sr-only">Thư viện bài học</h1>
      <div className="table-toolbar mb-1 rounded-t-lg bg-card">
        <p className="text-sm text-muted-foreground">
          {lessons.length} / {catalog.length} bài học
        </p>
        <div className="ml-auto flex min-w-0 items-center gap-3">
        <Label className="grid min-w-0 gap-2">
          <span className="sr-only">Tìm bài học</span>
          <div className="search-field"><Search aria-hidden="true" /><Input
            type="search"
            className="border-transparent bg-muted pl-9 shadow-none"
            placeholder="Mã bài, tên hoặc mục tiêu…"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setSelectedId(null);
            }}
          /></div>
        </Label>
        <Button className="h-9 shrink-0" onClick={() => setAdding(true)}><Plus aria-hidden="true" />Thêm bài mẫu</Button>
        </div>
      </div>
      {loading && (
        <p role="status" className="mb-4 text-sm">
          Đang tải bài tự thêm…
        </p>
      )}
      {error && error !== "Không lưu/đọc được dữ liệu." && (
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
      <div className="library-sections grid min-h-0 flex-1 grid-cols-[160px_minmax(0,1fr)] gap-4 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside aria-label="Lọc nhóm bài học" className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-card p-3">
          <div className="shrink-0 bg-card">
          <h2 className="px-2 py-2 text-sm font-medium">Nhóm bài học</h2>
          <Label className="block px-2 pb-2">
            <span className="sr-only">Tìm nhóm bài học</span>
            <div className="search-field"><Search aria-hidden="true" /><Input type="search" aria-label="Tìm nhóm bài học" placeholder="Tìm nhóm…" className="h-8 bg-muted pl-9" value={groupQuery} onChange={event => setGroupQuery(event.target.value)} /></div>
          </Label>
          <Label className="mb-2 flex cursor-pointer items-center gap-3 border-b px-2 py-3">
            <Checkbox aria-label="Tất cả nhóm" checked={allChecked ? true : selectedGroupCount ? "indeterminate" : false} onCheckedChange={checked => setGroupFilter(checked === true ? { kind: "all" } : { kind: "selected", groups: new Set() })} />
            <span>Tất cả nhóm</span>
          </Label>
          </div>
          <div aria-label="Danh sách nhóm" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {visibleGroups.map(group => <Label key={group.name} className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted ${isGroupSelected(group.name) ? "text-primary" : ""}`}>
            <Checkbox aria-label={`Nhóm ${group.name}`} checked={isGroupSelected(group.name)} onCheckedChange={checked => toggleGroup(group.name, checked === true)} />
            <span>Nhóm {group.name}</span><span className="ml-auto text-xs text-muted-foreground">{group.lessons.length}</span>
          </Label>)}
          {!visibleGroups.length && <p className="px-2 py-4 text-xs text-muted-foreground">Không tìm thấy nhóm phù hợp.</p>}
          </div>
        </aside>
        <section aria-label="Danh sách bài học" className="h-full min-h-0 min-w-0 overflow-auto overscroll-contain rounded-lg bg-card px-5 pb-5">
          <table className="dashboard-table w-full min-w-[600px]">
            <thead className="sticky top-0 z-10"><tr><th className="p-4">Mã bài</th><th className="p-4">Tên bài</th><th className="p-4">Nguồn</th><th className="p-4"><span className="sr-only">Chi tiết</span></th></tr></thead>
            <tbody>{lessons.map(lesson => <tr key={lesson.id}>
              <td className="p-4"><span className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-primary">{lesson.code}</span></td>
              <td className="p-4"><button className="text-left underline-offset-4 hover:text-primary hover:underline" onClick={() => setSelectedId(lesson.id)}>{lesson.name || "Chưa có tên bài"}</button></td>
              <td className="whitespace-nowrap p-4 text-muted-foreground">{customIds.has(lesson.id) ? "Tự thêm" : "Bài gốc"}</td>
              <td className="p-4 text-right"><Button variant="outline" size="sm" aria-label={`Chi tiết bài ${lesson.code}`} onClick={() => setSelectedId(lesson.id)}>Chi tiết</Button></td>
            </tr>)}</tbody>
          </table>
          {!lessons.length && <p className="p-8 text-center text-sm text-muted-foreground">Không tìm thấy bài phù hợp với nhóm và nội dung đang lọc.</p>}
        </section>
      </div>
      {selected && <Dialog open onOpenChange={open => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{selected.code} · {selected.name || "Bài học"}</DialogTitle><DialogDescription>Nội dung tham khảo để soạn kế hoạch.</DialogDescription></DialogHeader>
          {[
            { label: "Mục tiêu", value: selected.objective },
            { label: "Hướng dẫn", value: selected.instruction },
            { label: "Tiêu chí", value: selected.criteria },
          ].map(field => <div key={field.label}><h2 className="text-sm font-medium">{field.label}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{field.value || "Chưa có nội dung"}</p></div>)}
          {!!selected.scores.length && <div><h2 className="text-sm font-medium">Thang điểm</h2><div className="mt-3 space-y-2">{selected.scores.map(score => <div key={score.id} className="flex items-start gap-3 rounded-md bg-muted/50 p-3"><span className="rounded bg-accent px-2 py-1 text-xs font-medium text-primary">{score.label}</span><p className="whitespace-pre-wrap text-sm leading-relaxed">{score.criteria || "Chưa có tiêu chí"}</p></div>)}</div></div>}
        </DialogContent>
      </Dialog>}
      {adding && <NewLessonDialog close={() => setAdding(false)} saved={lesson => {
        setCustom(all => [...all, lesson]);
        const newGroup = groupLessons([...catalog, lesson]).find(group => group.lessons.some(item => item.id === lesson.id));
        setGroupFilter(current => current.kind === "all" ? current : { kind: "selected", groups: new Set([...current.groups, ...(newGroup ? [newGroup.name] : [])]) });
        setQuery("");
        setGroupQuery("");
        setAdding(false);
        setError("");
      }} />}
    </main>
  );
}
