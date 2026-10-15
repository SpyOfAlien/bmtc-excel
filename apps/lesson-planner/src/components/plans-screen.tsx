"use client";
import { PlanList } from "./plan-list";
import { newPlanPath } from "@/lib/plan-routes";
import { useAppNavigation } from "./app-shell";

export function PlansScreen() {
  const { navigate } = useAppNavigation();
  return (
    <PlanList
      create={() => navigate(newPlanPath)}
    />
  );
}
