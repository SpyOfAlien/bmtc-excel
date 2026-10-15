"use client";

import { useCallback, useEffect, useState } from "react";
import { currentUser, listPlans, loadPlan, extendTemplate, recordExport, savePlan } from "../lib/storage-client";
import type {
  PlanSummary,
  SavedPlan,
  UserProfile,
} from "../lib/storage-schema";
import { FileText, Plus, Download, Copy } from "lucide-react";
import { Button } from "./ui/button";
import { TableToolbar } from "./table-toolbar";
import { ExportPlanDialog } from "./export-plan-dialog";
import { bundledTemplate, templateName } from "@/lib/bundled-template";
import { validatePlans } from "@/lib/workbook";
import { planEditPath } from "@/lib/plan-routes";
import { copyPlan } from "@/lib/plan-utils";
import { Card } from "./ui/card";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Không tải được danh sách kế hoạch.";
type PlanListState =
  | { kind: "loading" }
  | {
      kind: "ready";
      user: UserProfile | null;
      plans: PlanSummary[];
      error: string;
    };

export function PlanList({
  create,
}: {
  create: () => void;
}) {
  const [state, setState] = useState<PlanListState>({ kind: "loading" });
  const [exporting, setExporting] = useState<SavedPlan | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const refresh = useCallback(
    async (cancelled: () => boolean = () => false) => {
      setState({ kind: "loading" });
      const [userResult, plansResult] = await Promise.allSettled([
        currentUser(),
        listPlans(),
      ]);
      if (cancelled()) return;
      const errors = [userResult, plansResult].flatMap((result) =>
        result.status === "rejected" ? [message(result.reason)] : [],
      );
      setState({
        kind: "ready",
        user: userResult.status === "fulfilled" ? userResult.value : null,
        plans: plansResult.status === "fulfilled" ? plansResult.value : [],
        error: [...new Set(errors)].join(" "),
      });
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
  const plans = state.kind === "ready" ? state.plans : [];
  const key = query.trim().toLocaleLowerCase("vi");
  const filtered = plans.filter((plan) =>
    `${plan.title} ${plan.month}/${plan.year}`
      .toLocaleLowerCase("vi")
      .includes(key),
  );
  async function duplicatePlan(id: string) {
    if (opening) return;
    setOpening(id);
    setOpenError("");
    setNotice("");
    try {
      const original = await loadPlan(id);
      const saved = await savePlan(copyPlan(original.plan));
      setState(current => current.kind === "ready" ? {
        ...current,
        plans: [{
          id: saved.plan.id,
          title: saved.plan.title,
          month: saved.plan.month,
          year: saved.plan.year,
          updatedAt: saved.updatedAt,
          revision: saved.revision,
          exportCount: 0,
        }, ...current.plans],
      } : current);
      setQuery("");
      setNotice(`Đã sao chép thành "${saved.plan.title}". Mở bản sao để chỉnh sửa.`);
    } catch (error) {
      setOpenError(message(error));
    } finally {
      setOpening(null);
    }
  }
  async function exportPlan(id: string) {
    if (opening) return;
    setOpening(id); setOpenError("");
    try {
      const saved = await loadPlan(id);
      validatePlans(extendTemplate(bundledTemplate(), saved.plan.lessons), saved.plan.children);
      setExporting(saved);
    } catch (error) { setOpenError(message(error)); }
    finally { setOpening(null); }
  }
  return (
    <>
      <main className="dashboard-page">
        <div className="page-toolbar">
          <div>
            <h1>Kế hoạch của bạn</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Mở để chỉnh sửa hoặc xuất Excel trực tiếp từ bản kế hoạch đã lưu.
            </p>
          </div>
          <Button size="lg" disabled={opening !== null} onClick={create}>
            <Plus aria-hidden="true" /> Tạo kế hoạch mới
          </Button>
        </div>
        {notice && <p role="status" className="mb-3 text-sm text-primary">{notice}</p>}
        <Card className="page-section gap-0 overflow-hidden py-0" aria-label="Kế hoạch đã lưu">
          <TableToolbar label="Công cụ danh sách kế hoạch" title={<>Kế hoạch đã lưu{state.kind === "ready" && <span className="ml-2 font-normal text-muted-foreground">({plans.length})</span>}</>} search={{ label: "Tìm kế hoạch", placeholder: "Tên kế hoạch hoặc tháng/năm…", value: query, change: setQuery }} />
          <div className="section-scroll">
          {state.kind === "loading" && (
            <p
              role="status"
              className="p-8 text-center text-sm text-muted-foreground"
            >
              Đang tải kế hoạch…
            </p>
          )}
          {state.kind === "ready" && state.error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 p-4 text-sm"
            >
              <span>{state.error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
              >
                Thử lại
              </Button>
            </div>
          )}
          {openError && (
            <p role="alert" className="px-5 pt-4 text-sm text-destructive">
              {openError}
            </p>
          )}
          {state.kind === "ready" && !filtered.length && (
            <div className="p-10 text-center">
              <p className="text-sm font-medium">
                {query
                  ? "Không tìm thấy kế hoạch phù hợp."
                  : state.error
                    ? "Chưa tải được kế hoạch."
                    : "Chưa có kế hoạch đã lưu."}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {query
                  ? "Thử tìm bằng tên hoặc tháng/năm khác."
                  : "Tạo kế hoạch mới và nhấn Lưu giáo án để kế hoạch xuất hiện ở đây."}
              </p>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="overflow-x-auto px-5 pb-5">
              <table className="dashboard-table min-w-[900px]">
                <thead className="sticky top-0 z-10 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Tên kế hoạch</th>
                    <th className="px-5 py-3 font-medium">Tháng / năm</th>
                    <th className="px-5 py-3 font-medium">Cập nhật gần nhất</th>
                    <th className="px-5 py-3 font-medium">Lượt xuất</th>
                    <th className="px-5 py-3">
                      <span className="sr-only">Thao tác kế hoạch</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((plan) => (
                    <tr key={plan.id} className="border-t hover:bg-muted/20">
                      <td className="min-w-60 px-5 py-4 font-medium"><div className="flex items-center gap-3"><span className="table-icon"><FileText className="size-4" aria-hidden="true" /></span><a href={planEditPath(plan.id)} className="text-primary underline-offset-4 hover:underline focus-visible:underline">{plan.title}</a></div></td>
                      <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                        {plan.month}/{plan.year}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                        {new Date(plan.updatedAt).toLocaleString("vi-VN")}
                      </td>
                      <td className="px-5 py-4"><span className="rounded-md bg-accent px-2 py-1 text-xs text-primary">{plan.exportCount}</span></td>
                      <td className="px-5 py-4 text-right"><div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" disabled={opening !== null} aria-label={`Sao chép kế hoạch ${plan.title}`} onClick={() => void duplicatePlan(plan.id)}><Copy aria-hidden="true" />Sao chép</Button>
                        <Button variant="outline" size="sm" disabled={opening !== null} aria-label={`Xuất Excel ${plan.title}`} onClick={() => void exportPlan(plan.id)}><Download aria-hidden="true" />Xuất Excel</Button></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </Card>
      </main>
      {exporting && <ExportPlanDialog loaded={{ template: extendTemplate(bundledTemplate(), exporting.plan.lessons), filename: templateName, directory: null }} childrenPlans={exporting.plan.children} month={exporting.plan.month} year={exporting.plan.year} close={() => setExporting(null)} prepare={async ({ month, year }) => {
        if (month === exporting.plan.month && year === exporting.plan.year) return exporting.plan.children;
        const saved = await savePlan({
          ...exporting.plan,
          month,
          year,
          children: exporting.plan.children.map(child => ({ ...child, period: `Tháng ${month}/${year}` })),
          expectedRevision: exporting.revision,
        });
        setExporting(saved);
        setState(current => current.kind === "ready" ? { ...current, plans: current.plans.map(plan => plan.id === saved.plan.id ? { ...plan, month, year, updatedAt: saved.updatedAt, revision: saved.revision } : plan) } : current);
        return saved.plan.children;
      }} record={async eventId => {
        const result = await recordExport(exporting.plan.id, eventId);
        setState(current => current.kind === "ready" ? { ...current, plans: current.plans.map(plan => plan.id === exporting.plan.id ? { ...plan, exportCount: result.exportCount } : plan) } : current);
      }} saved={message => { setNotice(message); setExporting(null); }} />}
    </>
  );
}
