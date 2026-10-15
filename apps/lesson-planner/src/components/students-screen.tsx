"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, UsersRound } from "lucide-react";
import { listStudents, createStudent, updateStudent } from "@/lib/storage-client";
import type { Student } from "@/lib/storage-schema";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { TableToolbar } from "./table-toolbar";
import { Label } from "./ui/label";
import { Modal } from "./planner-modal";

export function StudentsScreen() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<{ kind: "create" } | { kind: "edit"; student: Student } | null>(null);
  useEffect(() => { let cancelled = false; setLoading(true); void listStudents().then(rows => { if (!cancelled) { setStudents(rows); setError(""); } }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "Không tải được học sinh."); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [retry]);
  const filtered = students.filter(student => `${student.name} ${student.age}`.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi")));
  return <main className="dashboard-page">
    <div className="page-toolbar"><div><h1>Quản lý học sinh</h1><p className="mt-2 text-sm text-muted-foreground">Hồ sơ học sinh của giáo viên hiện tại, dùng lại trong nhiều kế hoạch.</p></div><Button onClick={() => setEditor({ kind: "create" })}><Plus aria-hidden="true" />Thêm học sinh</Button></div>
    <section className="page-section rounded-lg bg-card" aria-label="Danh sách học sinh"><TableToolbar label="Công cụ danh sách học sinh" title={<span className="font-normal text-muted-foreground">{filtered.length} / {students.length} học sinh</span>} search={{ label: "Tìm học sinh", placeholder: "Tên hoặc tuổi…", value: query, change: setQuery }} />
      <div className="section-scroll px-5 pb-5">
      {loading && <p role="status" className="py-6 text-center text-sm">Đang tải học sinh…</p>}
      {error && <div role="alert" className="flex items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" onClick={() => setRetry(value => value + 1)}>Thử lại</Button></div>}
      <div className="overflow-x-auto"><table className="dashboard-table min-w-[600px]"><thead className="sticky top-0 z-10"><tr><th className="p-4">Họ tên</th><th className="p-4">Tuổi</th><th className="p-4">Cập nhật gần nhất</th><th className="p-4"><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{filtered.map(student => <tr key={student.id}><td className="p-4"><div className="flex items-center gap-3"><span className="table-icon"><UsersRound className="size-4" aria-hidden="true" /></span><span className="font-medium">{student.name}</span></div></td><td className="p-4 text-muted-foreground">{student.age || "Chưa nhập"}</td><td className="p-4 text-muted-foreground">{new Date(student.updatedAt).toLocaleString("vi-VN")}</td><td className="p-4 text-right"><Button variant="outline" size="sm" aria-label={`Sửa hồ sơ ${student.name}`} onClick={() => setEditor({ kind: "edit", student })}><Pencil aria-hidden="true" />Sửa</Button></td></tr>)}</tbody></table></div>
      {!loading && !error && !filtered.length && <p className="py-8 text-center text-sm text-muted-foreground">{query ? "Không tìm thấy học sinh phù hợp." : "Chưa có học sinh. Nhấn Thêm học sinh để tạo hồ sơ."}</p>}
      </div>
    </section>
    <p className="mt-4 text-xs text-muted-foreground">Hồ sơ có thể dùng chung cho nhiều giáo viên. Thay đổi ở đây không sửa nội dung các kế hoạch đã lưu.</p>
    {editor && <StudentEditor key={editor.kind === "edit" ? editor.student.id : "new"} student={editor.kind === "edit" ? editor.student : null} close={() => setEditor(null)} saved={student => { setStudents(all => [...all.filter(item => item.id !== student.id), student].sort((a,b) => a.name.localeCompare(b.name,"vi"))); setEditor(null); }} />}
  </main>;
}
function StudentEditor({ student, close, saved }: { student: Student | null; close: () => void; saved: (student: Student) => void }) {
  const [name, setName] = useState(student?.name ?? "");
  const [age, setAge] = useState(student?.age ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setError("");
    try { saved(student ? await updateStudent({ id: student.id, name: name.trim(), age, expectedUpdatedAt: student.updatedAt }) : await createStudent({ id: crypto.randomUUID(), name: name.trim(), age })); }
    catch (error) { setError(error instanceof Error ? error.message : "Không lưu được hồ sơ."); }
    finally { setBusy(false); }
  }
  return <Modal title={student ? "Sửa hồ sơ học sinh" : "Thêm học sinh"} close={() => { if (!busy) close(); }}><form onSubmit={event => { event.preventDefault(); if (!busy && name.trim()) void save(); }}><div className="grid gap-4"><Label className="grid gap-2">Họ tên<Input value={name} autoFocus maxLength={200} disabled={busy} onChange={event => setName(event.target.value)} required /></Label><Label className="grid gap-2">Tuổi<Input value={age} maxLength={200} disabled={busy} onChange={event => setAge(event.target.value)} placeholder="Ví dụ: 5 tuổi" /></Label></div><p className="mt-4 text-xs text-muted-foreground">{student ? "Thông tin mới áp dụng cho hồ sơ dùng chung của các giáo viên. Các kế hoạch đã lưu giữ nguyên nội dung." : "Học sinh được liên kết với giáo viên hiện tại và có thể chọn khi soạn kế hoạch."}</p>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<div className="dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={close}>Hủy</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? "Đang lưu…" : "Lưu học sinh"}</Button></div></form></Modal>;
}
