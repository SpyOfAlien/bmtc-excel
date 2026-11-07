"use client";
import { useRef, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./planner-modal";
import { createLessons } from "@/lib/storage-client";
import { workbookDownloadUrl } from "@/lib/files";
import { IMPORT_HEADERS, lessonImportTemplate, parseLessonImport } from "@/lib/lesson-import";
import type { LessonImport } from "@/lib/lesson-import";
import type { Lesson } from "@/lib/workbook";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Không đọc được tệp Excel.";

function downloadTemplate() {
  const url = workbookDownloadUrl(lessonImportTemplate());
  const link = document.createElement("a");
  link.href = url;
  link.download = "Mau_nhap_bai_hoc.xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function ImportLessonsDialog({
  existingCodes,
  close,
  saved,
}: {
  existingCodes: ReadonlySet<string>;
  close: () => void;
  saved: (lessons: Lesson[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState("");
  const [result, setResult] = useState<LessonImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose(selected: File | undefined) {
    if (!selected) return;
    setBusy(true);
    setError("");
    setResult(null);
    setFile(selected.name);
    try {
      setResult(parseLessonImport(new Uint8Array(await selected.arrayBuffer()), existingCodes));
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function submit() {
    if (!result?.lessons.length || busy) return;
    setBusy(true);
    setError("");
    try {
      saved(await createLessons(result.lessons));
    } catch (error) {
      setError(message(error));
      setBusy(false);
    }
  }
  return (
    <Modal title="Nhập bài mẫu từ Excel" close={() => { if (!busy) close(); }}>
      <div className="grid gap-4 text-sm">
        <p className="text-muted-foreground">
          Sheet đầu tiên cần một hàng tiêu đề gồm các cột {IMPORT_HEADERS.join(", ")}. Mỗi hàng là một mức điểm; hàng để trống mã bài sẽ thêm mức điểm cho bài ngay phía trên.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => input.current?.click()}>
            <FileSpreadsheet aria-hidden="true" />{file ? "Chọn tệp khác" : "Chọn tệp .xlsx"}
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download aria-hidden="true" />Tải file mẫu
          </Button>
          <input ref={input} type="file" accept=".xlsx" className="sr-only" aria-label="Tệp bài học .xlsx" onChange={event => void choose(event.target.files?.[0])} />
        </div>
        {file && <p className="text-muted-foreground">Tệp: <span className="font-medium text-foreground">{file}</span></p>}
        {result && (
          <>
            <div>
              <h2 className="font-medium">Sẽ thêm {result.lessons.length} bài</h2>
              {!!result.lessons.length && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-md border">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2">Mã bài</th><th className="px-3 py-2">Tên bài</th><th className="px-3 py-2">Mức điểm</th></tr></thead>
                    <tbody>{result.lessons.map(lesson => <tr key={lesson.id} className="border-t"><td className="px-3 py-2 font-medium">{lesson.code}</td><td className="px-3 py-2">{lesson.name}</td><td className="px-3 py-2">{lesson.scores.length ? lesson.scores.map(score => score.label).join(", ") : "—"}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
            {!!result.skipped.length && (
              <div>
                <h2 className="font-medium">Bỏ qua {result.skipped.length} hàng</h2>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-muted-foreground">
                  {result.skipped.map(item => <li key={`${item.row}-${item.reason}`}>Hàng {item.row}{item.code && ` (${item.code})`}: {item.reason}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={close}>Hủy</Button>
          <Button disabled={busy || !result?.lessons.length} onClick={() => void submit()}>
            {busy && result ? "Đang nhập…" : `Nhập ${result?.lessons.length ?? 0} bài`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
