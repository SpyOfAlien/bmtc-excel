"use client";
import { useEffect, useRef, useState } from "react";
import { exportWorkbook, sheetNames } from "@/lib/workbook";
import type { ChildDraft, Template } from "@/lib/workbook";
import { workbookDownloadUrl, nextFilename, saveInDirectory, validPeriod } from "@/lib/files";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Modal } from "./planner-modal";
const message = (error: unknown) => error instanceof Error ? error.message : "Không xuất được kế hoạch.";

export function ExportPlanDialog({
  loaded,
  childrenPlans,
  month: initialMonth,
  year: initialYear,
  close,
  saved,
  record,
}: {
  loaded: { template: Template; filename: string; directory: FileSystemDirectoryHandle | null };
  childrenPlans: ChildDraft[];
  month: number;
  year: number;
  close: () => void;
  saved: (message: string, month: number, year: number) => void;
  record?: (eventId: string) => Promise<void>;
}) {
  const [month, setMonth] = useState(initialMonth),
    [year, setYear] = useState(initialYear);
  const [directory, setDirectory] = useState(loaded.directory);
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const [download, setDownload] = useState<{
    url: string;
    name: string;
  } | null>(null);
  useEffect(() => {
    if (!download) return;
    return () => {
      setTimeout(() => URL.revokeObjectURL(download.url), 30000);
    };
  }, [download]);
  const pendingEvent = useRef<string | null>(null);
  async function track() {
    if (!record) return;
    pendingEvent.current ??= crypto.randomUUID();
    await record(pendingEvent.current);
    pendingEvent.current = null;
  }
  async function downloadFile() {
    if (!download || busy) return;
    setBusy(true);
    try {
      await track();
      const link = document.createElement("a");
      link.href = download.url; link.download = download.name;
      document.body.append(link); link.click(); link.remove();
      setStatus("Đã gửi yêu cầu tải file." + (record ? " Lượt xuất đã được ghi nhận." : " Lưu giáo án để theo dõi lượt xuất."));
    } catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  }
  const supported = typeof window.showDirectoryPicker === "function";
  const filename = `KeHoach_Thang${month}_${year}.xlsx`;
  const names = sheetNames(childrenPlans.map((c) => c.name));
  async function chooseDirectory() {
    try {
      setDirectory(
        await window.showDirectoryPicker({
          id: "lesson-planner",
          mode: "readwrite",
          ...(directory ? { startIn: directory } : {}),
        }),
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setStatus(message(error));
    }
  }
  async function save(useDownload: boolean) {
    setBusy(true);
    setStatus("Đang tạo workbook trên thiết bị…");
    try {
      if (!validPeriod(month, year))
        throw new Error("Hãy chọn tháng và năm hợp lệ.");
      if (
        !useDownload &&
        (!directory ||
          (await directory.requestPermission({ mode: "readwrite" })) !==
            "granted")
      )
        throw new Error("Hãy chọn thư mục và cho phép lưu file.");
      const bytes = await exportWorkbook(loaded.template, childrenPlans);
      if (useDownload) {
        setDownload({
          url: workbookDownloadUrl(bytes),
          name: nextFilename(filename, [], loaded.filename),
        });
        setStatus("Workbook đã sẵn sàng. Nhấn Tải file bên dưới.");
      } else if (directory) {
        const name = await saveInDirectory({
          directory,
          bytes,
          filename,
          originalName: loaded.filename,
        });
        let note = "";
        try { await track(); } catch (error) { note = ` File đã lưu nhưng chưa ghi nhận được lượt xuất: ${message(error)}`; }
        saved(`Đã lưu ${name} trong ${directory.name}.${note}`, month, year);
      }
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Xuất kế hoạch"
      label="MỘT WORKBOOK · NHIỀU HỌC SINH"
      close={() => {
        if (!busy) close();
      }}
    >
      <p>
        {childrenPlans.length} học sinh ·{" "}
        {childrenPlans.reduce((n, c) => n + c.lessons.length, 0)} bài học.
      </p>
      <p className="fine">{record ? "Lượt xuất được tính khi tải file hoặc lưu vào thư mục." : "Giáo án chưa lưu. Lưu giáo án trước để theo dõi số lượt xuất."}</p>
      <p className="fine">
        Các sheet: {names.join(", ")}. Chỉ xuất nội dung, không có công thức hay
        sheet tham khảo.
      </p>
      <div className="two-fields">
        <Label className="grid gap-2 text-xs text-muted-foreground">
          Tháng
          <Input
            type="number"
            min={1}
            max={12}
            value={month}
            disabled={busy}
            onChange={(e) => {
              setMonth(Number(e.target.value));
              setDownload(null);
            }}
          />
        </Label>
        <Label className="grid gap-2 text-xs text-muted-foreground">
          Năm
          <Input
            type="number"
            min={1900}
            max={9999}
            value={year}
            disabled={busy}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setDownload(null);
            }}
          />
        </Label>
      </div>
      <p className="file-preview">{filename}</p>
      {supported && (
        <>
          <Label className="grid gap-2 text-xs text-muted-foreground">
            Thư mục lưu<output>{directory?.name || "Chưa chọn"}</output>
          </Label>
          <Button
            variant="outline"
            className=" wide"
            disabled={busy}
            onClick={chooseDirectory}
          >
            Chọn nơi lưu
          </Button>
          <p className="fine">
            File trùng tên tự thêm _v2, _v3… Mẫu và file đã xuất được giữ
            nguyên.
          </p>
          <Button
            variant="default"
            className=" wide export-save"
            disabled={busy || !directory}
            onClick={() => void save(false)}
          >
            Lưu workbook
          </Button>
        </>
      )}
      <Button
        variant={supported ? "ghost" : "default"}
        className="w-full"
        disabled={busy}
        onClick={() => void save(true)}
      >
        Tải xuống qua trình duyệt
      </Button>
      <p className="fine">
        Khi tải xuống, trình duyệt quyết định nơi lưu và tên file khi trùng. Bật
        hỏi nơi lưu trong thiết lập trình duyệt nếu cần.
      </p>
      <div className="status" role="status">
        {status}
      </div>
      {download && (
        <Button className="w-full" disabled={busy} onClick={() => void downloadFile()}>Tải file {download.name}</Button>
      )}
    </Modal>
  );
}
