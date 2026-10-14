"use client";
import { useEffect, useState } from "react";
import { listStudents, createStudent } from "@/lib/storage-client";
import type { Student } from "@/lib/storage-schema";
import { Modal } from "./planner-modal";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function StudentPicker({ close, selected, exclude, limit }: { close: () => void; selected: (students: Student[]) => void; exclude: string[]; limit: number }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { let cancelled = false; setLoading(true); void listStudents().then(rows => { if (!cancelled) { setStudents(rows); setError(""); } }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "Không tải được học sinh."); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [retry]);
  const filtered = students.filter(student => !exclude.includes(student.id) && student.name.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi")));
  async function addStudent() {
    setSaving(true); setError("");
    try {
      const student = await createStudent({ id: crypto.randomUUID(), name: name.trim(), age });
      setStudents(all => [...all, student]);
      setPicked(all => all.size < limit ? new Set([...all, student.id]) : all);
      setName(""); setAge(""); setQuery("");
    } catch (error) { setError(error instanceof Error ? error.message : "Không tạo được học sinh."); }
    finally { setSaving(false); }
  }
  return <Modal title="Chọn học sinh" close={() => { if (!saving) close(); }}>
    <p className="text-xs text-muted-foreground">Danh sách học sinh của giáo viên hiện tại. Một học sinh có thể được liên kết với nhiều giáo viên.</p>
    <Label className="grid gap-2">Tìm học sinh<Input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nhập tên học sinh…" /></Label>
    {loading && <p role="status">Đang tải học sinh…</p>}
    {error && <div role="alert" className="text-sm text-destructive">{error}<Button variant="ghost" onClick={() => setRetry(value => value + 1)}>Thử lại</Button></div>}
    <div className="max-h-52 overflow-y-auto rounded-md border">{filtered.map(student => <Label key={student.id} className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-b-0"><input className="size-4 accent-primary" type="checkbox" checked={picked.has(student.id)} disabled={!picked.has(student.id) && picked.size >= limit} onChange={event => setPicked(all => { const next = new Set(all); if (event.target.checked) next.add(student.id); else next.delete(student.id); return next; })} /><span>{student.name}<span className="ml-2 text-xs text-muted-foreground"> {student.age}</span></span></Label>)}{!loading && !filtered.length && <p className="p-4 text-sm text-muted-foreground">Chưa có học sinh phù hợp. Có thể tạo hồ sơ bên dưới.</p>}</div>
    <div className="rounded-md bg-muted p-4"><h2>Tạo hồ sơ học sinh</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><Label className="grid gap-2">Họ tên<Input value={name} onChange={event => setName(event.target.value)} maxLength={200} /></Label><Label className="grid gap-2">Tuổi<Input value={age} onChange={event => setAge(event.target.value)} maxLength={200} /></Label></div><Button className="mt-3" disabled={saving || !name.trim()} onClick={() => void addStudent()}>{saving ? "Đang tạo…" : "Tạo học sinh"}</Button><p className="mt-2 text-xs text-muted-foreground">Hồ sơ được lưu ngay. Thêm vào kế hoạch rồi nhấn Lưu giáo án để giữ nội dung bài học.</p></div>
    <div className="flex justify-end gap-3"><Button variant="outline" onClick={close} disabled={saving}>Hủy</Button><Button disabled={!picked.size || saving} onClick={() => selected(students.filter(student => picked.has(student.id)))}>Thêm {picked.size} học sinh</Button></div>
  </Modal>;
}
