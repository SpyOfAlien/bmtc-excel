"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAppNavigation } from "./app-shell";
import { nextPlanMonth } from "@/lib/plan-utils";
import { teacherName } from "@/lib/user-profile";
import { Save, Download, Trash2 } from "lucide-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  importPlans,
  MAX_UPLOAD,
  normalize,
  validatePlans,
} from "@/lib/workbook";
import type {
  ChildDraft,
  DraftLesson,
  Lesson,
  ManualLessonFields,
  Score,
  Template,
} from "@/lib/workbook";
import {
  SavePlanDialog,
} from "@/components/storage-dialogs";
import {
  currentUser,
  loadPlan,
  extendTemplate,
  listLessons,
  savePlan,
  recordExport,
} from "@/lib/storage-client";
import type { SavedPlan } from "@/lib/storage-schema";
import { bundledTemplate, templateName } from "@/lib/bundled-template";
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
import { SearchPicker } from "./search-picker";
import { MonthPicker } from "./month-picker";
import { Modal } from "./planner-modal";
import { ExportPlanDialog } from "./export-plan-dialog";
import { StudentAutocomplete } from "./student-autocomplete";
import { StudentPicker } from "./student-picker";


ModuleRegistry.registerModules([AllCommunityModule]);
const theme = themeQuartz.withParams({
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 12,
  foregroundColor: "#242239",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#fafafd",
  borderColor: "#eeedf2",
  accentColor: "#6938ef",
  wrapperBorderRadius: 7,
  rowHoverColor: "#faf9fd",
});
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Không thể xử lý workbook.";


function Header({
  saveAction,
  exportAction,
  busy = false,
  children,
}: {
  children?: ReactNode;
  saveAction: () => void;
  exportAction?: () => void;
  busy?: boolean;
}) {
  return (
    <header className="topbar">
      {children}
      <div className="flex shrink-0 items-center gap-2">
        <Button onClick={saveAction} disabled={busy}><Save aria-hidden="true" />Lưu giáo án</Button>
        <Button variant="outline" onClick={exportAction} disabled={!exportAction || busy}>
          <Download aria-hidden="true" />Xuất Excel
        </Button>
      </div>
    </header>
  );
}

interface LoadedTemplate {
  template: Template;
  filename: string;
  directory: FileSystemDirectoryHandle | null;
  month: number;
  year: number;
  teacher: string;
}

export default function Planner() {
  const pathname = usePathname();
  const planId = pathname?.match(/^\/plans\/([^/]+)\/?$/)?.[1] ?? null;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | { kind: "ready"; loaded: LoadedTemplate; saved: SavedPlan | null }
  >({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void Promise.all([
      currentUser(),
      planId ? loadPlan(planId) : Promise.resolve(null),
    ])
      .then(([user, saved]) => {
        if (cancelled) return;
        const nextMonth = nextPlanMonth();
        setState({
          kind: "ready",
          loaded: {
            template: bundledTemplate(),
            filename: templateName,
            directory: null,
            month: nextMonth.month,
            year: nextMonth.year,
            teacher: teacherName(user),
          },
          saved,
        });
      })
      .catch((error) => {
        if (!cancelled) setState({ kind: "error", error: message(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [planId, retry]);
  if (state.kind === "loading")
    return (
      <p role="status" className="p-8">
        Đang tải kế hoạch…
      </p>
    );
  if (state.kind === "error")
    return (
      <div className="p-8">
        <p role="alert">{state.error}</p>
        <Button className="mt-4" onClick={() => setRetry((value) => value + 1)}>
          Thử lại
        </Button>
      </div>
    );
  return (
    <Workspace
      key={planId ?? "new"}
      loaded={state.loaded}
      initialPlan={state.saved}

    />
  );
}

function freshChild(
  template: Template,
  month: number,
  year: number,
  previous?: ChildDraft,
  teacher = "Cô Hoà",
): ChildDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    age: previous?.age || "",
    teacher: previous?.teacher ?? teacher,
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
const lessonDefaultColDef: ColDef<TableRow> = {
  resizable: true,
  sortable: false,
  suppressMovable: true,
};
const lessonRow = (row: TableRow | undefined) =>
  row?.kind === "lesson" ? row : undefined;

function Workspace({
  loaded,
  initialPlan,
}: {
  loaded: LoadedTemplate;
  initialPlan: SavedPlan | null;
}) {
  const { guard } = useAppNavigation();
  const { template: baseTemplate } = loaded;
  const [customLessons, setCustomLessons] = useState<Lesson[]>([]);
  const [savedLessons] = useState<Lesson[]>(
    initialPlan?.plan.lessons ?? [],
  );
  const template = useMemo(
    () =>
      extendTemplate(baseTemplate, [
        ...new Map(
          [...customLessons, ...savedLessons].map((lesson) => [
            lesson.id,
            lesson,
          ]),
        ).values(),
      ]),
    [baseTemplate, customLessons, savedLessons],
  );
  const [studentPicker, setStudentPicker] = useState(false);
  const [planSaveDialog, setPlanSaveDialog] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [planIdentity, setPlanIdentity] = useState(() => ({
    id: initialPlan?.plan.id ?? crypto.randomUUID(),
    title: initialPlan?.plan.title ?? "",
    revision: initialPlan?.revision ?? 0,
  }));
  const refreshLessons = useCallback(async () => {
    try {
      setCustomLessons(await listLessons());
      setStorageError("");
    } catch (error) {
      setStorageError(message(error));
    }
  }, []);
  useEffect(() => {
    void refreshLessons();
  }, [refreshLessons]);
  const importInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [children, setChildren] = useState<ChildDraft[]>(
    () =>
      initialPlan?.plan.children ?? [
        freshChild(
          template,
          loaded.month,
          loaded.year,
          undefined,
          loaded.teacher,
        ),
      ],
  );
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const [activeIndex, setActiveIndex] = useState(0);
  const [period, setPeriod] = useState({
    month: initialPlan?.plan.month ?? loaded.month,
    year: initialPlan?.plan.year ?? loaded.year,
  });
  const [baseline, setBaseline] = useState({ children, period });
  const hasUnsaved =
    children !== baseline.children ||
    period.month !== baseline.period.month ||
    period.year !== baseline.period.year;
  useEffect(() => {
    guard(hasUnsaved);
    return () => guard(false);
  }, [guard, hasUnsaved]);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<
    { kind: "delete"; child: ChildDraft } | null
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
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);
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
                  lessonId: null,
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
  const lessonsById = useMemo(
    () =>
      new Map(
        Array.from(template.lessons.values()).map((lesson) => [
          lesson.id,
          lesson,
        ]),
      ),
    [template],
  );
  const rowData = useMemo<TableRow[]>(() => {
    const rows: TableRow[] = (active?.lessons || []).map<RowView>(
      (row, index) => {
        const lesson =
          (row.lessonId
            ? lessonsById.get(row.lessonId)
            : template.lessons.get(normalize(row.code))) || null;
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
  }, [active?.lessons, template, lessonsById]);
  const addLessonParams = useMemo(
    () => ({
      onAdd: addRow,
      disabled: (active?.lessons.length ?? 0) >= template.slots.length,
    }),
    [addRow, active?.lessons.length, template.slots.length],
  );
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
        headerName: "Bài số *",
        width: 164,
        minWidth: 164,
        maxWidth: 164,
        resizable: false,
        suppressSizeToFit: true,
        pinned: "left",
        rowDrag: (params) => params.data?.kind === "lesson",
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
        width: 120,
        minWidth: 120,
        maxWidth: 120,
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
                className="manual-score my-2 h-7 px-2 text-xs"
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
            <SearchPicker
              className="score-select h-7 px-2 pr-7 text-xs"
              label={`Điểm cần đạt bài ${data.index}`}
              placeholder="Điểm"
              disabled={!data.lesson}
              options={[
                { value: "", label: "Điểm" },
                ...(data.lesson?.scores.map(score => ({
                  value: score.id,
                  label: `${score.label}${score.dateLike ? " · ngày gốc" : ""}`,
                  description: score.criteria,
                })) ?? []),
              ]}
              selection={{ kind: "single", value: data.scoreId, select: scoreId => updateRow(data.id, { scoreId }) }}
            />
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
        minWidth: 42,
        maxWidth: 42,
        resizable: false,
        suppressSizeToFit: true,
        valueGetter: (params) => lessonRow(params.data)?.index,
        cellRenderer: (params: ICellRendererParams<TableRow>) => {
          const data = lessonRow(params.data);
          return (
            data && (
              <Button
                variant="ghost"
                className="delete-row size-7 items-center justify-center p-0 text-destructive"
                aria-label={`Xóa bài ${data.index}`}
                onClick={() => removeRow(data.id)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
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
  async function persistPlan(title: string, savedPeriod = period) {
    const current = savedPeriod.month === period.month && savedPeriod.year === period.year
      ? childrenRef.current
      : childrenRef.current.map(child => ({ ...child, period: `Tháng ${savedPeriod.month}/${savedPeriod.year}` }));
    const chosen = new Set(
      current.flatMap((child) =>
        child.lessons.flatMap((row) => (row.lessonId ? [row.lessonId] : [])),
      ),
    );
    const snapshots = Array.from(template.lessons.values()).filter((lesson) =>
      chosen.has(lesson.id),
    );
    const result = await savePlan({
      schemaVersion: 1,
      id: planIdentity.id,
      title,
      month: savedPeriod.month,
      year: savedPeriod.year,
      children: current,
      lessons: snapshots,
      expectedRevision: planIdentity.revision,
    });
    setPlanIdentity({
      id: result.plan.id,
      title: result.plan.title,
      revision: result.revision,
    });
    setChildren(current);
    setPeriod(savedPeriod);
    setBaseline({ children: current, period: savedPeriod });
    setPlanSaveDialog(false);
    setToast("Đã lưu giáo án. Bạn có thể mở lại từ Trang chủ.");
    return current;
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
      <Header saveAction={() => setPlanSaveDialog(true)} exportAction={openExport}>
        <div className="workspace-heading">
          <h1>
            Kế hoạch tháng {period.month}
            <span> / {period.year}</span>
          </h1>
          <div className="workspace-meta">
            <Button
              variant="outline"
              disabled={importing}
              onClick={() => importInput.current?.click()}
            >
              {importing ? "Đang tải…" : "Tải kế hoạch có sẵn"}
            </Button>
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
              onClick={() => setStudentPicker(true)}
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
              <StudentAutocomplete key={active.id} value={active.name} studentId={active.studentId} exclude={children.filter(child => child.id !== active.id).map(child => child.studentId ?? child.id)} change={name => updateChild({ name, studentId: undefined })} select={student => updateChild({ studentId: student.id, name: student.name, age: student.age })} />
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
              Quản lý chuyên môn
              <Input
                value={active.manager}
                maxLength={200}
                onChange={(e) => updateChild({ manager: e.target.value })}
              />
            </Label>
            <Label className="period-field grid gap-2 text-xs text-muted-foreground">
              Tháng
              <MonthPicker month={period.month} year={period.year} change={({ month, year }) => {
                setPeriod({ month, year });
                setChildren(current => current.map(child => ({ ...child, period: `Tháng ${month}/${year}` })));
              }} />
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
          {storageError && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border bg-card px-4 py-3 text-xs text-muted-foreground" role="alert">
              <span>{storageError}</span>
              <Button variant="outline" size="sm" onClick={() => void refreshLessons()}>Thử lại</Button>
            </div>
          )}
          <p className="mb-3 text-xs text-muted-foreground">Nhấn Thêm bài để chọn bài từ Thư viện. Chọn điểm cần đạt để lấy tiêu chí tương ứng. Lưu giáo án để giữ thay đổi; Xuất Excel tạo file tải về.</p>
          <div className="lesson-grid" aria-label="Bảng bài học">
            <AgGridReact<TableRow>
              theme={theme}
              rowData={rowData}
              columnDefs={columns}
              rowHeight={96}
              headerHeight={42}
              suppressCellFocus
              getRowHeight={(params) => (params.data?.kind === "add" ? 56 : 96)}
              isFullWidthRow={(params) => params.rowNode.data?.kind === "add"}
              fullWidthCellRenderer={AddLessonRow}
              fullWidthCellRendererParams={addLessonParams}
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
              defaultColDef={lessonDefaultColDef}
              noRowsOverlayComponent={AddLessonRow}
              noRowsOverlayComponentParams={{ onAdd: addRow, empty: true }}
            />
          </div>
          <div className="plan-footer">
            <span>Ghi chú được xuất cùng bài học. Cột phụ để trống.</span>
            <span>Tối đa {template.slots.length} bài / học sinh</span>
          </div>
        </section>
      </main>
      {studentPicker && <StudentPicker close={() => setStudentPicker(false)} exclude={children.map(child => child.studentId ?? child.id)} limit={100 - (children.length === 1 && !active.name.trim() && active.lessons.length === 0 ? 0 : children.length)} selected={students => {
        const added = students.map(student => ({ ...freshChild(template, period.month, period.year, active), studentId: student.id, name: student.name, age: student.age }));
        const replaceEmpty = children.length === 1 && !active.name.trim() && active.lessons.length === 0;
        setChildren(replaceEmpty ? added : [...children, ...added]);
        setActiveIndex(replaceEmpty ? 0 : children.length);
        setStudentPicker(false);
      }} />}
      {planSaveDialog && (
        <SavePlanDialog
          initialTitle={
            planIdentity.title || `Giáo án tháng ${period.month}/${period.year}`
          }
          close={() => setPlanSaveDialog(false)}
          save={async title => { await persistPlan(title); }}
        />
      )}
      {confirmation && (
        <Modal
          title="Xóa kế hoạch học sinh?"
          close={() => setConfirmation(null)}
        >
          <p>
            Kế hoạch của {confirmation.child.name || "học sinh này"} sẽ bị xóa khỏi phiên hiện tại.
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
                setConfirmation(null);
              }}
            >
              Xác nhận
            </Button>
          </div>
        </Modal>
      )}
      {saveOpen && (
        <ExportPlanDialog
          prepare={savedPeriod => persistPlan(planIdentity.title || `Giáo án tháng ${savedPeriod.month}/${savedPeriod.year}`, savedPeriod)}
          record={async eventId => { await recordExport(planIdentity.id, eventId); }}
          loaded={{ ...loaded, template }}
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
