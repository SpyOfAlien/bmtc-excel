"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { listStudents } from "@/lib/storage-client";
import type { Student } from "@/lib/storage-schema";
import { Input } from "./ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

export function StudentAutocomplete({ value, studentId, exclude, change, select }: { value: string; studentId?: string; exclude: string[]; change: (name: string) => void; select: (student: Student) => void }) {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  useEffect(() => {
    if (!open) return;
    let cancelled = false; setLoading(true);
    void listStudents().then(rows => { if (!cancelled) { setStudents(rows); setError(""); } }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "Không tải được học sinh."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, retry]);
  const filtered = students.filter(student => !exclude.includes(student.id) && student.name.toLocaleLowerCase("vi").includes(value.trim().toLocaleLowerCase("vi")));
  const highlighted = filtered[activeIndex];
  const highlightedId = highlighted?.id;
  useEffect(() => { if (open && highlightedId) document.getElementById(`${listId}-${highlightedId}`)?.scrollIntoView({ block: "nearest" }); }, [open, highlightedId, listId]);
  function choose(student: Student) { select(student); setOpen(false); }
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverAnchor asChild><div className="relative"><Input ref={input} role="combobox" aria-label="Họ tên học sinh" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && highlighted ? `${listId}-${highlighted.id}` : undefined} value={value} maxLength={200} autoComplete="off" placeholder="Nhập hoặc chọn học sinh" className="pr-8" onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={event => { change(event.target.value); setActiveIndex(0); setOpen(true); }} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActiveIndex(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter" && open && highlighted) { event.preventDefault(); choose(highlighted); }
    }} /><ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /></div></PopoverAnchor>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-1" onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()} onInteractOutside={event => { const target = event.detail.originalEvent.target; if (target instanceof Node && input.current?.contains(target)) event.preventDefault(); }}>
      {loading && <p role="status" className="p-3 text-xs text-muted-foreground">Đang tải học sinh…</p>}
      {error && <div role="alert" className="p-3 text-xs text-destructive">{error}<button className="ml-2 underline" onClick={() => setRetry(count => count + 1)}>Thử lại</button></div>}
      <div id={listId} role="listbox" aria-label="Học sinh gợi ý" className="max-h-60 overflow-y-auto">{filtered.map((student,index) => <button type="button" role="option" id={`${listId}-${student.id}`} key={student.id} tabIndex={-1} aria-selected={student.id === studentId} className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-accent ${index === activeIndex ? "bg-accent" : ""}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(student)}><span>{student.name}<span className="ml-2 text-xs text-muted-foreground"> {student.age}</span></span>{student.id === studentId && <Check className="size-4 text-primary" aria-hidden="true" />}</button>)}</div>
      {!loading && !error && !filtered.length && <p className="p-3 text-xs text-muted-foreground">Không tìm thấy học sinh. Tạo hồ sơ tại mục Học sinh hoặc tiếp tục nhập tên cho bản kế hoạch.</p>}
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Chọn học sinh để điền tên và tuổi. Dùng ↑ ↓ và Enter để chọn.</p>
    </PopoverContent>
  </Popover>;
}
