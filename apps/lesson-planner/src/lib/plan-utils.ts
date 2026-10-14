import type { PlanInput } from "./storage-schema";

export function nextPlanMonth(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { month: next.getMonth() + 1, year: next.getFullYear() };
}

export function copyPlan(plan: PlanInput): PlanInput {
  const copy = structuredClone(plan);
  return {
    ...copy,
    id: crypto.randomUUID(),
    title: `${copy.title.slice(0, 190)} (bản sao)`,
    expectedRevision: 0,
    children: copy.children.map(child => ({
      ...child,
      id: crypto.randomUUID(),
      lessons: child.lessons.map(row => ({ ...row, id: crypto.randomUUID() })),
    })),
  };
}
