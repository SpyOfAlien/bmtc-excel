"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { createLesson, listPlans, loadPlan } from "../lib/storage-client";
import { newLessonSchema } from "../lib/storage-schema";
import type { PlanSummary, SavedPlan } from "../lib/storage-schema";
import type { Lesson } from "../lib/workbook";
import type { ReactNode, FormEvent } from "react";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Không thực hiện được. Hãy thử lại.";

function StorageDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Nhập và lưu nội dung để sử dụng lại.
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function NewLessonDialog({
  close,
  saved,
}: {
  close: () => void;
  saved: (lesson: Lesson) => void;
}) {
  const [lesson, setLesson] = useState<Lesson>(() => ({
    id: crypto.randomUUID(),
    code: "",
    name: "",
    objective: "",
    instruction: "",
    criteria: "",
    row: 0,
    scores: [],
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const update = (
    key: "code" | "name" | "objective" | "instruction" | "criteria",
    value: string,
  ) => setLesson((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const result = newLessonSchema.safeParse(lesson);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Kiểm tra nội dung bài.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      saved(await createLesson(result.data));
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <StorageDialog title="Thêm bài mẫu" close={close}>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Label className="grid gap-2">
            Mã bài *
            <Input
              value={lesson.code}
              maxLength={40}
              required
              onChange={(event) => update("code", event.target.value)}
              placeholder="Ví dụ: M001"
            />
          </Label>
          <Label className="grid gap-2">
            Tên bài *
            <Input
              value={lesson.name}
              maxLength={200}
              required
              onChange={(event) => update("name", event.target.value)}
            />
          </Label>
        </div>
        <Label className="grid gap-2">
          Mục tiêu
          <Textarea
            value={lesson.objective}
            maxLength={32767}
            onChange={(event) => update("objective", event.target.value)}
          />
        </Label>
        <Label className="grid gap-2">
          Hướng dẫn
          <Textarea
            value={lesson.instruction}
            maxLength={32767}
            onChange={(event) => update("instruction", event.target.value)}
          />
        </Label>
        <Label className="grid gap-2">
          Tiêu chí chung
          <Textarea
            value={lesson.criteria}
            maxLength={32767}
            onChange={(event) => update("criteria", event.target.value)}
          />
        </Label>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Thang điểm</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={lesson.scores.length >= 100}
            onClick={() =>
              setLesson((current) => ({
                ...current,
                scores: [
                  ...current.scores,
                  {
                    id: crypto.randomUUID(),
                    label: "",
                    source: "",
                    value: "",
                    criteria: "",
                    row: 0,
                    dateLike: false,
                  },
                ],
              }))
            }
          >
            + Thêm mức điểm
          </Button>
        </div>
        {!lesson.scores.length && (
          <p className="text-xs text-muted-foreground">
            Có thể nhập điểm thủ công khi đưa bài vào giáo án.
          </p>
        )}
        {lesson.scores.map((score) => (
          <div key={score.id} className="grid gap-2 rounded-md border p-3">
            <div className="flex gap-2">
              <Label className="grid flex-1 gap-2">
                Điểm
                <Input
                  value={String(score.value)}
                  required
                  maxLength={200}
                  placeholder="Ví dụ: 2 hoặc 2 / 4"
                  onChange={(event) => {
                    const value = event.target.value;
                    setLesson((current) => ({
                      ...current,
                      scores: current.scores.map((item) =>
                        item.id === score.id
                          ? { ...item, value, label: value, source: value }
                          : item,
                      ),
                    }));
                  }}
                />
              </Label>
              <Button
                type="button"
                variant="ghost"
                aria-label="Bỏ mức điểm"
                onClick={() =>
                  setLesson((current) => ({
                    ...current,
                    scores: current.scores.filter(
                      (item) => item.id !== score.id,
                    ),
                  }))
                }
              >
                ×
              </Button>
            </div>
            <Label className="grid gap-2">
              Tiêu chí mức điểm
              <Textarea
                value={score.criteria}
                maxLength={32767}
                onChange={(event) => {
                  const criteria = event.target.value;
                  setLesson((current) => ({
                    ...current,
                    scores: current.scores.map((item) =>
                      item.id === score.id ? { ...item, criteria } : item,
                    ),
                  }));
                }}
              />
            </Label>
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={close}
          >
            Hủy
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu bài mẫu"}
          </Button>
        </div>
      </form>
    </StorageDialog>
  );
}
export function SavePlanDialog({
  initialTitle,
  close,
  save,
}: {
  initialTitle: string;
  close: () => void;
  save: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialTitle),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <StorageDialog title="Lưu giáo án" close={close}>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await save(title);
          } catch (error) {
            setError(message(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Label className="grid gap-2">
          Tên giáo án
          <Input
            value={title}
            maxLength={200}
            required
            onChange={(event) => setTitle(event.target.value)}
          />
        </Label>
        <p className="text-xs text-muted-foreground">
          Lưu tất cả tab học sinh, nội dung bài, điểm và ghi chú. Có thể lưu khi
          đang soạn dở.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={close}
          >
            Hủy
          </Button>
          <Button disabled={busy || !title.trim()}>
            {busy ? "Đang lưu…" : "Lưu giáo án"}
          </Button>
        </div>
      </form>
    </StorageDialog>
  );
}
export function PlanLibraryDialog({
  close,
  opened,
}: {
  close: () => void;
  opened: (plan: SavedPlan) => void;
}) {
  const [plans, setPlans] = useState<PlanSummary[]>([]),
    [loading, setLoading] = useState(true),
    [opening, setOpening] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    listPlans()
      .then((plans) => {
        if (!cancelled) setPlans(plans);
      })
      .catch((error) => {
        if (!cancelled) setError(message(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <StorageDialog title="Giáo án đã lưu" close={close}>
      <div className="grid gap-3">
        <p className="text-xs text-muted-foreground">
          Mở giáo án sẽ thay nội dung đang soạn. Hãy lưu trước nếu cần giữ lại.
        </p>
        {loading && <p role="status">Đang tải…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!loading && !error && !plans.length && <p>Chưa có giáo án đã lưu.</p>}
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="flex items-center justify-between gap-3 rounded-md border p-3"
          >
            <div>
              <p className="text-sm font-medium">{plan.title}</p>
              <p className="text-xs text-muted-foreground">
                Tháng {plan.month}/{plan.year} ·{" "}
                {new Date(plan.updatedAt).toLocaleString("vi-VN")}
              </p>
            </div>
            <Button
              size="sm"
              disabled={opening !== null}
              onClick={async () => {
                setOpening(plan.id);
                setError("");
                try {
                  opened(await loadPlan(plan.id));
                } catch (error) {
                  setError(message(error));
                } finally {
                  setOpening(null);
                }
              }}
            >
              {opening === plan.id ? "Đang mở…" : "Mở"}
            </Button>
          </div>
        ))}
      </div>
    </StorageDialog>
  );
}
