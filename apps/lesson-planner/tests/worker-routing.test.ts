// @vitest-environment node
import { expect, it, vi } from "vitest";
import worker from "../worker/index";

it("serves the detail shell for a newly created plan UUID while preserving the original API route", async () => {
  const fetchAsset = vi.fn(async (_request: Request) => new Response("detail shell"));
  const env = { ASSETS: { fetch: fetchAsset } };
  const id = crypto.randomUUID();
  const response = await worker.fetch(new Request(`https://planner.test/plans/${id}/`), env);
  expect(await response.text()).toBe("detail shell");
  expect(fetchAsset.mock.calls[0]?.[0].url).toBe("https://planner.test/plans/detail/");
  const apiResponse = await worker.fetch(new Request(`https://planner.test/api/plans/${id}`), env);
  expect(apiResponse.status).toBe(503);
  expect(fetchAsset).toHaveBeenCalledTimes(1);
});
it("leaves normal assets and invalid plan routes with the asset handler", async () => {
  const fetchAsset = vi.fn(async (_request: Request) => new Response("asset"));
  for (const path of ["/library/", "/plans/not-an-id/", "/plans/"]) {
    await worker.fetch(new Request(`https://planner.test${path}`), { ASSETS: { fetch: fetchAsset } });
  }
  expect(fetchAsset.mock.calls.map(([request]) => new URL(request.url).pathname)).toEqual(["/library/", "/plans/not-an-id/", "/plans/"]);
});
