import { Suspense } from "react";
import Planner from "@/components/planner";

export default function NewPlanPage() {
  return <Suspense fallback={<p role="status" className="p-8">Đang tạo kế hoạch…</p>}><Planner /></Suspense>;
}
