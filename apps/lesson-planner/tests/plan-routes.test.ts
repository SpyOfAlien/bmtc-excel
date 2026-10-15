import { expect, it } from "vitest";
import { plansPath, newPlanPath, planEditPath, planIdFromPath } from "../src/lib/plan-routes";

it("only loads a saved plan for the edit route, keeping list and create routes distinct", () => {
  const id = crypto.randomUUID();
  expect(planIdFromPath(planEditPath(id))).toBe(id);
  expect(planIdFromPath(`${planEditPath(id)}/`)).toBe(id);
  expect(planIdFromPath(plansPath)).toBeNull();
  expect(planIdFromPath(newPlanPath)).toBeNull();
  expect(planIdFromPath(`/plans/${id}/`)).toBeNull();
  expect(planIdFromPath(`/students/${id}/edit/`)).toBeNull();
});
