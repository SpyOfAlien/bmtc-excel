import { Suspense } from "react";
import Planner from "@/components/planner";

export default function PlansPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8">
          Đang tải kế hoạch…
        </p>
      }
    >
      <Planner />
    </Suspense>
  );
}
