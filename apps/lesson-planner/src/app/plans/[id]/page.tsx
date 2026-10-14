import { Suspense } from "react";
import Planner from "@/components/planner";

// The worker serves this client-side detail shell for plans created after build.
export function generateStaticParams() {
  return [{ id: "detail" }];
}

export default function PlanDetailPage() {
  return <Suspense fallback={<p role="status" className="p-8">Đang tải kế hoạch…</p>}><Planner /></Suspense>;
}
