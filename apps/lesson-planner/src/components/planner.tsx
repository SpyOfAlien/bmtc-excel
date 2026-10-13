"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  exportWorkbook,
  importPlans,
  MAX_UPLOAD,
  normalize,
  readTemplate,
  sheetNames,
  validatePlans,
} from "@/lib/workbook";
import type {
  ChildDraft,
  DraftLesson,
  Lesson,
  ManualLessonFields,
  ReferenceRow,
  Score,
  Template,
} from "@/lib/workbook";
import {
  workbookDownloadUrl,
  nextFilename,
  saveInDirectory,
  validPeriod,
} from "@/lib/files";
import { moveLesson } from "@/lib/lesson-order";
import { applyLessonSelection } from "@/lib/lesson-selection";
import { LessonCodeCell } from "@/components/lesson-code-cell";
import {
  AddLessonRow,
  LessonFieldCell,
} from "@/components/lesson-table-controls";
import { emptyManualFields, lessonReferences } from "@/lib/lesson-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

ModuleRegistry.registerModules([AllCommunityModule]);
const theme = themeQuartz.withParams({
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 12,
  foregroundColor: "#2b4537",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#f0f4ed",
  borderColor: "#dde5de",
  accentColor: "#205a46",
  wrapperBorderRadius: 7,
  rowHoverColor: "#f3f7ef",
});
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Không thể xử lý workbook.";

function Modal({
  title,
  children,
  close,
  label,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  label?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto bg-card sm:max-w-[620px]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          {label && <div className="eyebrow">{label}</div>}
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Sử dụng các lựa chọn bên dưới. Nhấn Escape để đóng.
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Header({
  exportAction,
  busy = false,
  children,
}: {
  children?: ReactNode;
  exportAction?: () => void;
  busy?: boolean;
}) {
  return (
    <header className="topbar">
      {children}
      <Button
        variant="default"
        className=""
        onClick={exportAction}
        disabled={!exportAction || busy}
      >
        Xuất Excel
      </Button>
    </header>
  );
}

interface LoadedTemplate {
  template: Template;
  filename: string;
  directory: FileSystemDirectoryHandle | null;
  month: number;
  year: number;
}

export default function Planner() {
  const [loaded, setLoaded] = useState<LoadedTemplate | null>(null);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    dragDepth = useRef(0);

  async function load(file: File) {
    if (busy) return;
    setBusy(true);
    setStatus("Đang đọc tệp…");
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("Chỉ nhận tệp .xlsx.");
      if (file.size > MAX_UPLOAD)
        throw new Error("Tệp .xlsx không được lớn hơn 30 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const template = readTemplate(bytes);
      const date = new Date();
      setLoaded({
        template,
        filename: file.name,
        directory: null,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
      });
      setStatus("");
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(false);
    }
  }
  if (loaded)
    return (
      <Workspace
        loaded={loaded}
        restart={() => {
          setLoaded(null);
          setStatus("");
        }}
      />
    );
  return (
    <main
      className="grid min-h-dvh place-items-center p-6"
      onDragEnter={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files") && !busy) {
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = busy ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (busy) return;
        const files = Array.from(event.dataTransfer.files);
        const file = files[0];
        if (files.length !== 1 || !file) {
          setStatus("Hãy kéo một tệp .xlsx vào đây.");
          return;
        }
        void load(file);
      }}
    >
      <div
        className={`flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragging ? "border-primary bg-primary/10" : "border-border bg-card"}`}
        aria-busy={busy}
      >
        <Input
          ref={input}
          type="file"
          accept=".xlsx"
          hidden
          disabled={busy}
          aria-label="Chọn tệp .xlsx"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void load(file);
            event.target.value = "";
          }}
        />
        <Button
          size="lg"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Đang nhập…" : "Nhập tệp .xlsx"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {dragging
            ? "Thả tệp .xlsx để nhập"
            : "hoặc kéo và thả tệp .xlsx vào đây"}
        </p>
        {status && (
          <p
            className={`text-sm ${busy ? "text-muted-foreground" : "text-destructive"}`}
            role="status"
          >
            {status}
          </p>
        )}
      </div>
    </main>
  );
}

function freshChild(
  template: Template,
  month: number,
  year: number,
  previous?: ChildDraft,
): ChildDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    age: previous?.age || "",
    teacher: previous?.teacher ?? "Cô Hoà",
    manager: previous?.manager ?? template.defaults.manager,
    period: previous?.period ?? `Tháng ${month}/${year}`,
    lessons: [],
  };
}
interface RowView extends DraftLesson {
  kind: "lesson";
  index: number;
  lesson: Lesson | null;
  score: Score | null;
}
type TableRow = RowView | { kind: "add"; id: "add-lesson-row" };
const lessonRow = (row: TableRow | undefined) =>
  row?.kind === "lesson" ? row : undefined;

function Workspace({
  loaded,
  restart,
}: {
  loaded: LoadedTemplate;
  restart: () => void;
}) {
  const { template } = loaded;
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [children, setChildren] = useState<ChildDraft[]>(() => [
    freshChild(template, loaded.month, loaded.year),
  ]);
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const [activeIndex, setActiveIndex] = useState(0);
  const [period, setPeriod] = useState({
    month: loaded.month,
    year: loaded.year,
  });
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [referenceSearch, setReferenceSearch] = useState(""),
    [detail, setDetail] = useState<ReferenceRow | null>(null);
  const [warnings, setWarnings] = useState(false),
    [saveOpen, setSaveOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<
    { kind: "delete"; child: ChildDraft } | "restart" | null
  >(null);
  const [toast, setToast] = useState("");
  const active = children[activeIndex];
  const activeId = active?.id;
  const currentRows = useRef(active?.lessons ?? []);
  currentRows.current = active?.lessons ?? [];
  const getRows = useCallback(() => currentRows.current, []);
  const closeInlinePicker = useCallback(() => setEditingRow(null), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!children.some((c) => c.name || c.lessons.length)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [children]);
  const updateChild = useCallback(
    (change: Partial<ChildDraft>) =>
      setChildren((all) =>
        all.map((c) => (c.id === activeId ? { ...c, ...change } : c)),
      ),
    [activeId],
  );
  const updateRow = useCallback(
    (id: string, change: Partial<DraftLesson>) =>
      setChildren((all) =>
        all.map((c) =>
          c.id === activeId
            ? {
                ...c,
                lessons: c.lessons.map((row) =>
                  row.id === id ? { ...row, ...change } : row,
                ),
              }
            : c,
        ),
      ),
    [activeId],
  );
  const updateManual = useCallback(
    (id: string, field: keyof ManualLessonFields, value: string) =>
      setChildren((all) =>
        all.map((child) =>
          child.id === activeId
            ? {
                ...child,
                lessons: child.lessons.map((row) =>
                  row.id === id
                    ? { ...row, manual: { ...row.manual, [field]: value } }
                    : row,
                ),
              }
            : child,
        ),
      ),
    [activeId],
  );
  const addRow = useCallback(() => {
    if (currentRows.current.length >= template.slots.length) return;
    const id = crypto.randomUUID();
    setChildren((all) =>
      all.map((child) =>
        child.id === activeId
          ? {
              ...child,
              lessons: [
                ...child.lessons,
                {
                  id,
                  code: "",
                  scoreId: "",
                  notes: "",
                  manual: emptyManualFields(),
                },
              ],
            }
          : child,
      ),
    );
    setEditingRow(id);
  }, [activeId, template.slots.length]);
  const removeRow = useCallback(
    (id: string) =>
      setChildren((all) =>
        all.map((c) =>
          c.id === activeId
            ? { ...c, lessons: c.lessons.filter((row) => row.id !== id) }
            : c,
        ),
      ),
    [activeId],
  );
  const reorderRow = useCallback(
    (id: string, destination: number) => {
      setChildren((all) =>
        all.map((c) =>
          c.id === activeId
            ? { ...c, lessons: moveLesson(c.lessons, id, destination) }
            : c,
        ),
      );
    },
    [activeId],
  );
  const selectRows = useCallback(
    (rowId: string, selected: DraftLesson[]) => {
      setChildren((all) =>
        all.map((child) =>
          child.id === activeId
            ? {
                ...child,
                lessons: applyLessonSelection({
                  rows: child.lessons,
                  rowId,
                  selected,
                  limit: template.slots.length,
                }),
              }
            : child,
        ),
      );
      setEditingRow(null);
    },
    [activeId, template.slots.length],
  );
  const rowData = useMemo<TableRow[]>(() => {
    const rows: TableRow[] = (active?.lessons || []).map<RowView>(
      (row, index) => {
        const lesson = template.lessons.get(normalize(row.code)) || null;
        return {
          ...row,
          kind: "lesson",
          index: index + 1,
          lesson,
          score:
            lesson?.scores.find((score) => score.id === row.scoreId) || null,
        };
      },
    );
    if (rows.length) rows.push({ kind: "add", id: "add-lesson-row" });
    return rows;
  }, [active?.lessons, template]);
  function lessonDetail(lesson: Lesson, score?: Score): ReferenceRow {
    return {
      row: score?.row || lesson.row,
      code: lesson.code,
      name: lesson.name,
      objective: lesson.objective,
      instruction: lesson.instruction,
      score: score?.source || lesson.scores.map((s) => s.source).join(", "),
      criteria:
        score?.criteria || "Chọn điểm cần đạt để xem tiêu chí tương ứng.",
    };
  }
  const columns = useMemo<ColDef<TableRow>[]>(() => {
    function fieldColumn(
      field: Exclude<keyof ManualLessonFields, "score">,
      label: string,
      minWidth: number,
      flex: number,
    ): ColDef<TableRow> {
      return {
        headerName: label,
        minWidth,
        flex,
        wrapText: true,
        valueGetter: (params) => {
          const data = lessonRow(params.data);
          return data
            ? `${data.index}:${data.code}:${data.scoreId}:${lessonReferences(data.lesson, data.score)[field]}`
            : "";
        },
        cellRenderer: (params: ICellRendererParams<TableRow>) => {
          const data = lessonRow(params.data);
          return (
            data && (
              <LessonFieldCell
                source={
                  data.origin === "excel"
                    ? ""
                    : lessonReferences(data.lesson, data.score)[field]
                }
                value={data.manual[field]}
                label={`${label} bài ${data.index}`}
                disabled={!data.lesson}
                change={(value) => updateManual(data.id, field, value)}
              />
            )
          );
        },
      };
    }
    return [
      {
        headerName: "Thứ tự",
        width: 116,
        suppressSizeToFit: true,
        pinned: "left",
        rowDrag: (params) => params.data?.kind === "lesson",
        valueGetter: (params) => lessonRow(params.data)?.index,
        cellRenderer: (params: ICellRendererParams<TableRow>) => {
          const data = lessonRow(params.data);
          return (
            data && (
              <div className="row-order">
                <span>{data.index}</span>
                <div className="order-buttons">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Chuyển bài ${data.index} lên`}
                    title="Chuyển lên"
                    disabled={data.index === 1}
                    onClick={() => reorderRow(data.id, data.index - 2)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Chuyển bài ${data.index} xuống`}
                    title="Chuyển xuống"
                    disabled={data.index === active?.lessons.length}
                    onClick={() => reorderRow(data.id, data.index)}
                  >
                    ↓
                  </Button>
                </div>
              </div>
            )
          );
        },
      },
      {
        headerName: "Bài số *",
        width: 180,
        minWidth: 180,
        maxWidth: 180,
        resizable: false,
        suppressSizeToFit: true,
        pinned: "left",
        valueGetter: (params) => {
          const data = lessonRow(params.data);
          return data ? `${data.index}:${data.code}` : "";
        },
        cellRenderer: (params: ICellRendererParams<TableRow>) => {
          const data = lessonRow(params.data);
          return (
            data && (
              <LessonCodeCell
                row={data}
                lessons={template.lessons}
                getRows={getRows}
                limit={template.slots.length}
                startOpen={data.id === editingRow}
                close={closeInlinePicker}
                commit={selectRows}
              />
            )
          );
        },
      },
      {
        headerName: "Điểm cần đạt *",
        width: 130,
        minWidth: 130,
        maxWidth: 130,
        resizable: false,
        suppressSizeToFit: true,
        pinned: "left",
        valueGetter: (params) => {
          const data = lessonRow(params.data);
          return data ? `${data.index}:${data.code}:${data.scoreId}` : "";
        },
        cellRenderer: (params: ICellRendererParams<TableRow>) => {
          const data = lessonRow(params.data);
          if (!data) return null;
          if (
            data.lesson &&
            (data.origin === "excel" || !data.lesson.scores.length)
          )
            return (
              <Input
                className="manual-score my-2 h-8 px-2 text-xs"
                aria-label={`Điểm cần đạt bài ${data.index}`}
                placeholder="Nhập điểm…"
                maxLength={32767}
                defaultValue={data.manual.score}
                onChange={(event) =>
                  updateManual(data.id, "score", event.target.value)
                }
                onKeyDown={(event) => event.stopPropagation()}
              />
            );
          return (
            <NativeSelect
              className="score-select my-2 h-8 px-2 pr-6 text-xs"
              aria-label={`Điểm cần đạt bài ${data.index}`}
              disabled={!data.lesson}
              value={data.scoreId}
              onChange={(event) => {
                updateRow(data.id, { scoreId: event.target.value });
                const score = data.lesson?.scores.find(
                  (score) => score.id === event.target.value,
                );
                if (data.lesson) setDetail(lessonDetail(data.lesson, score));
              }}
            >
              <NativeSelectOption value="">Chọn điểm…</NativeSelectOption>
              {data.lesson?.scores.map((score) => (
                <NativeSelectOption key={score.id} value={score.id}>
                  {score.label}
                  {score.dateLike ? " · ngày gốc" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          );
        },
      },
      fieldColumn("name", "Tên bài", 160, 1),
      fieldColumn("objective", "Mục tiêu của bài", 180, 1.2),
      fieldColumn("instruction", "Hướng dẫn", 220, 1.4),
      fieldColumn("criteria", "Tiêu chí cần đạt", 180, 1.2),
      {
        headerName: "Ghi chú",
        minWidth: 180,
        flex: 1,
        valueGetter: (params) => {
          const data = lessonRow(params.data);
          return data ? `${data.index}:${data.code}` : "";
        },
        cellRenderer: (params: ICellRendererParams<TableRow>) => {
          const data = lessonRow(params.data);
          return (
            data && (
              <Textarea
                className="lesson-notes my-2 h-[72px] min-h-0 resize-none p-2 text-xs"
                aria-label={`Ghi chú bài ${data.index}`}
                placeholder="Nhập ghi chú…"
                maxLength={32767}
                defaultValue={data.notes}
                onChange={(event) =>
                  updateRow(data.id, { notes: event.target.value })
                }
                onKeyDown={(event) => event.stopPropagation()}
              />
            )
          );
        },
      },
      {
        headerName: "",
        width: 42,
        suppressSizeToFit: true,
        pinned: "right",
        valueGetter: (params) => lessonRow(params.data)?.index,
        cellRenderer: (params: ICellRendererParams<TableRow>) => {
          const data = lessonRow(params.data);
          return (
            data && (
              <Button
                variant="ghost"
                className="delete-row size-7 p-0 text-lg text-destructive"
                aria-label={`Xóa bài ${data.index}`}
                onClick={() => removeRow(data.id)}
              >
                ×
              </Button>
            )
          );
        },
      },
    ];
  }, [
    removeRow,
    reorderRow,
    updateRow,
    updateManual,
    active?.lessons.length,
    editingRow,
    closeInlinePicker,
    getRows,
    selectRows,
    template,
  ]);
  const referenceColumns = useMemo<ColDef<ReferenceRow>[]>(
    () => [
      {
        field: "code",
        headerName: "Bài số",
        width: 92,
        minWidth: 92,
        maxWidth: 92,
        resizable: false,
        suppressSizeToFit: true,
      },
      { field: "name", headerName: "Tên bài", width: 180, wrapText: true },
      {
        field: "score",
        headerName: "Thang điểm",
        width: 130,
        minWidth: 130,
        maxWidth: 130,
        resizable: false,
        suppressSizeToFit: true,
      },
      { field: "objective", headerName: "Mục tiêu", width: 230 },
      { field: "criteria", headerName: "Cách chấm điểm", width: 250 },
      { field: "instruction", headerName: "Hướng dẫn", width: 270 },
      { field: "row", headerName: "Hàng", width: 75 },
    ],
    [],
  );
  async function importPlanFile(file: File) {
    if (importing) return;
    setImporting(true);
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("Chỉ nhận tệp .xlsx.");
      if (file.size > MAX_UPLOAD)
        throw new Error("Tệp .xlsx không được lớn hơn 30 MB.");
      const imported = importPlans(
        new Uint8Array(await file.arrayBuffer()),
        template,
      );
      const currentChildren = childrenRef.current;
      const existing =
        currentChildren.length === 1 &&
        !currentChildren[0]?.name &&
        !currentChildren[0]?.lessons.length
          ? []
          : currentChildren;
      if (existing.length + imported.length > 100)
        throw new Error(
          "Tổng số học sinh sau khi nhập không được vượt quá 100.",
        );
      setChildren([...existing, ...imported]);
      setActiveIndex(existing.length);
      setEditingRow(null);
      setDetail(null);
      setToast(
        `Đã nhập ${imported.length} học sinh và ${imported.reduce((sum, child) => sum + child.lessons.length, 0)} bài học từ ${file.name}.`,
      );
    } catch (error) {
      setToast(message(error));
    } finally {
      setImporting(false);
      if (importInput.current) importInput.current.value = "";
    }
  }
  function openExport() {
    try {
      validatePlans(template, children);
      setSaveOpen(true);
    } catch (error) {
      setToast(message(error));
    }
  }
  if (!active) return null;
  return (
    <>
      <Header exportAction={openExport}>
        <div className="workspace-heading">
          <h1>
            Kế hoạch tháng {period.month}
            <span> / {period.year}</span>
          </h1>
          <div className="workspace-meta">
            <Button
              variant="ghost"
              className="text-xs text-primary"
              onClick={() => setWarnings(true)}
            >
              Lưu ý từ mẫu
              {template.warnings.length ? ` (${template.warnings.length})` : ""}
            </Button>
            <Button
              disabled={importing}
              onClick={() => importInput.current?.click()}
            >
              {importing ? "Đang nhập…" : "Nhập kế hoạch Excel"}
            </Button>
            <Button onClick={() => setConfirmation("restart")}>Đổi mẫu</Button>
          </div>
        </div>
      </Header>
      <input
        ref={importInput}
        type="file"
        accept=".xlsx"
        hidden
        aria-label="Chọn file kế hoạch Excel"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importPlanFile(file);
        }}
      />
      <main className="planner-shell">
        <div className="students-bar">
          <nav className="student-tabs" aria-label="Danh sách học sinh">
            {children.map((c, i) => (
              <div
                key={c.id}
                className={`student-tab${i === activeIndex ? " active" : ""}`}
              >
                <Button
                  variant="ghost"
                  className="h-12 min-w-0 gap-2 rounded-b-none"
                  aria-current={i === activeIndex}
                  onClick={() => setActiveIndex(i)}
                >
                  <span className="max-w-52 truncate">
                    {c.name || "Học sinh mới"}
                  </span>
                  <small>{c.lessons.length}</small>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-1 size-8 text-xl text-muted-foreground hover:text-destructive"
                  aria-label={`Xóa học sinh ${c.name || `số ${i + 1}`}`}
                  title="Xóa học sinh"
                  onClick={() => setConfirmation({ kind: "delete", child: c })}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              className="student-tab add-student h-12 gap-4 rounded-b-none"
              aria-label="Thêm học sinh"
              title="Thêm học sinh"
              disabled={children.length >= 100}
              onClick={() => {
                setChildren((all) => [
                  ...all,
                  freshChild(template, period.month, period.year, active),
                ]);
                setActiveIndex(children.length);
              }}
            >
              <span>Thêm học sinh</span>
              <span className="text-xl leading-none" aria-hidden="true">
                +
              </span>
            </Button>
          </nav>
        </div>
        <Card
          className="student-card gap-2 p-4"
          aria-label="Thông tin học sinh"
        >
          <div className="student-fields">
            <Label className="grid gap-2 text-xs text-muted-foreground">
              Họ tên học sinh *
              <Input
                value={active.name}
                maxLength={200}
                onChange={(e) => updateChild({ name: e.target.value })}
                autoComplete="off"
                placeholder="Nhập họ tên"
              />
            </Label>
            <Label className="grid gap-2 text-xs text-muted-foreground">
              Tuổi
              <Input
                value={active.age}
                maxLength={200}
                onChange={(e) => updateChild({ age: e.target.value })}
                placeholder="Ví dụ: 5 tuổi"
              />
            </Label>
            <Label className="grid gap-2 text-xs text-muted-foreground">
              Giáo viên
              <Input
                value={active.teacher}
                maxLength={200}
                onChange={(e) => updateChild({ teacher: e.target.value })}
              />
            </Label>
            <Label className="grid gap-2 text-xs text-muted-foreground">
              QLCM
              <Input
                value={active.manager}
                maxLength={200}
                onChange={(e) => updateChild({ manager: e.target.value })}
              />
            </Label>
            <Label className="period-field grid gap-2 text-xs text-muted-foreground">
              Tháng / tuần trong sheet
              <Input
                value={active.period}
                maxLength={200}
                onChange={(e) => updateChild({ period: e.target.value })}
                placeholder="Ví dụ: Tháng 10 / Tuần 2"
              />
            </Label>
          </div>
        </Card>
        <section className="plan-panel" aria-label="Kế hoạch bài học">
          <div className="lesson-toolbar">
            <div>
              <h2>
                Kế hoạch bài học{" "}
                <Badge variant="secondary" className="count">
                  {active.lessons.length}
                </Badge>
              </h2>
            </div>
          </div>
          <div className="lesson-grid" aria-label="Bảng bài học">
            <AgGridReact<TableRow>
              theme={theme}
              rowData={rowData}
              columnDefs={columns}
              onFirstDataRendered={(event) => event.api.sizeColumnsToFit()}
              onGridSizeChanged={(event) => {
                if (event.clientWidth > 0) event.api.sizeColumnsToFit();
              }}
              rowHeight={96}
              headerHeight={42}
              suppressCellFocus
              getRowHeight={(params) => (params.data?.kind === "add" ? 56 : 96)}
              isFullWidthRow={(params) => params.rowNode.data?.kind === "add"}
              fullWidthCellRenderer={() => (
                <AddLessonRow
                  onAdd={addRow}
                  disabled={active.lessons.length >= template.slots.length}
                />
              )}
              onRowDataUpdated={(event) => {
                if (editingRow) {
                  const node = event.api.getRowNode(editingRow);
                  if (node) event.api.ensureNodeVisible(node, "bottom");
                }
              }}
              onRowDragEnd={(event) => {
                const row = lessonRow(event.node.data),
                  target = event.overNode?.rowIndex;
                if (row && target !== null && target !== undefined)
                  reorderRow(
                    row.id,
                    Math.min(target, active.lessons.length - 1),
                  );
              }}
              getRowId={(params) => params.data.id}
              defaultColDef={{
                resizable: true,
                sortable: false,
                suppressMovable: true,
              }}
              noRowsOverlayComponent={AddLessonRow}
              noRowsOverlayComponentParams={{ onAdd: addRow, empty: true }}
            />
          </div>
          <div className="plan-footer">
            <span>Ghi chú được xuất cùng bài học. Cột phụ để trống.</span>
            <span>Tối đa {template.slots.length} bài / học sinh</span>
          </div>
        </section>
        <Card
          className="reference-panel gap-0 py-0"
          aria-label="Tham khảo giáo viên"
        >
          <div className="reference-topbar">
            <div className="reference-heading">
              <h2>
                Tham khảo giáo viên{" "}
                <Badge variant="outline" className="text-[10px] font-normal">
                  Ko dc xoa · Chỉ đọc
                </Badge>
              </h2>
              <p>Chọn một hàng để đọc đầy đủ nội dung bên cạnh.</p>
            </div>
            <Label className="search-label grid gap-2">
              <span>Tìm trong tham khảo</span>
              <Input
                type="search"
                value={referenceSearch}
                onChange={(e) => setReferenceSearch(e.target.value)}
                placeholder="Tìm bài số, tên bài, nội dung…"
              />
            </Label>
          </div>
          <div className={`reference-body${detail ? " has-detail" : ""}`}>
            <div className="reference-grid" aria-label="Bảng tham khảo chỉ đọc">
              <AgGridReact<ReferenceRow>
                theme={theme}
                rowData={template.reference}
                columnDefs={referenceColumns}
                onFirstDataRendered={(event) => event.api.sizeColumnsToFit()}
                onGridSizeChanged={(event) => {
                  if (event.clientWidth > 0) event.api.sizeColumnsToFit();
                }}
                rowHeight={65}
                headerHeight={38}
                defaultColDef={{
                  resizable: true,
                  sortable: true,
                  editable: false,
                }}
                quickFilterText={referenceSearch}
                rowSelection={{
                  mode: "singleRow",
                  checkboxes: false,
                  enableClickSelection: true,
                }}
                onRowClicked={(e) => {
                  if (e.data) setDetail(e.data);
                }}
              />
            </div>
            {detail && (
              <div className="reference-detail">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="ref-row mb-0">
                    Hàng {detail.row} · Ko dc xoa
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-xl text-muted-foreground"
                    aria-label="Đóng chi tiết bài học"
                    title="Đóng chi tiết bài học"
                    onClick={() => setDetail(null)}
                  >
                    ×
                  </Button>
                </div>
                <div className="ref-title">
                  {detail.code} · {detail.name || "Chưa có tên bài"}
                </div>
                <h3>Mục tiêu và hướng dẫn</h3>
                <p>
                  {detail.objective || "Không có nội dung trong tham khảo."}
                </p>
                <h3>Thang điểm gốc</h3>
                <p>{detail.score || "Chưa có thang điểm."}</p>
                <h3>Cách chấm điểm</h3>
                <p>{detail.criteria || "Không có nội dung trong tham khảo."}</p>
                <h3>Hướng dẫn</h3>
                <p>
                  {detail.instruction || "Không có nội dung trong tham khảo."}
                </p>
              </div>
            )}
          </div>
        </Card>
      </main>
      {warnings && (
        <Modal title="Lưu ý từ mẫu" close={() => setWarnings(false)}>
          <ul>
            {template.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="fine">
            Hàng có bài học cao 120 điểm; hàng trống dùng chiều cao mặc định của
            Excel. Nội dung quá dài có thể bị cắt khi in.
          </p>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation !== "restart"
              ? "Xóa kế hoạch học sinh?"
              : "Bắt đầu kế hoạch mới?"
          }
          close={() => setConfirmation(null)}
        >
          <p>
            {confirmation !== "restart"
              ? `Kế hoạch của ${confirmation.child.name || "học sinh này"} sẽ bị xóa khỏi phiên hiện tại.`
              : "Tất cả kế hoạch đang nhập sẽ bị xóa. File Excel đã xuất vẫn được giữ lại."}
          </p>
          <div className="dialog-actions">
            <Button
              variant="outline"
              className=""
              onClick={() => setConfirmation(null)}
            >
              Giữ lại
            </Button>
            <Button
              variant="default"
              className=""
              onClick={() => {
                if (confirmation === "restart") restart();
                else {
                  const remaining = children.filter(
                    (c) => c.id !== confirmation.child.id,
                  );
                  setChildren(
                    remaining.length
                      ? remaining
                      : [
                          freshChild(
                            template,
                            period.month,
                            period.year,
                            active,
                          ),
                        ],
                  );
                  const nextActiveIndex = remaining.findIndex(
                    (c) => c.id === active.id,
                  );
                  setActiveIndex(
                    nextActiveIndex >= 0
                      ? nextActiveIndex
                      : Math.min(
                          activeIndex,
                          Math.max(0, remaining.length - 1),
                        ),
                  );
                }
                setConfirmation(null);
              }}
            >
              Xác nhận
            </Button>
          </div>
        </Modal>
      )}
      {saveOpen && (
        <SaveDialog
          loaded={loaded}
          childrenPlans={children}
          month={period.month}
          year={period.year}
          close={() => setSaveOpen(false)}
          saved={(info, month, year) => {
            setToast(info);
            setPeriod({ month, year });
            setSaveOpen(false);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function SaveDialog({
  loaded,
  childrenPlans,
  month: initialMonth,
  year: initialYear,
  close,
  saved,
}: {
  loaded: LoadedTemplate;
  childrenPlans: ChildDraft[];
  month: number;
  year: number;
  close: () => void;
  saved: (message: string, month: number, year: number) => void;
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
        setStatus("Workbook đã sẵn sàng. Nhấn liên kết tải file bên dưới.");
      } else if (directory) {
        const name = await saveInDirectory({
          directory,
          bytes,
          filename,
          originalName: loaded.filename,
        });
        saved(`Đã lưu ${name} trong ${directory.name}.`, month, year);
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
        <a
          className="download-link primary wide"
          href={download.url}
          download={download.name}
        >
          Tải file {download.name}
        </a>
      )}
    </Modal>
  );
}
