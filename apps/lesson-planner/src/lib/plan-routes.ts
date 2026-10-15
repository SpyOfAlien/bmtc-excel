export const plansPath = "/plans";
export const newPlanPath = "/plans/new";

export function planEditPath(id: string) {
  return `/plans/${encodeURIComponent(id)}/edit`;
}

export function planIdFromPath(pathname: string) {
  return pathname.match(/^\/plans\/([^/]+)\/edit\/?$/)?.[1] ?? null;
}
