// @vitest-environment node
import { expect, it, vi } from "vitest";
import worker from "../worker/index";

it("serves the detail shell for a newly created plan UUID while preserving the original API route", async () => {
  const fetchAsset = vi.fn(async (_request: Request) => new Response("detail shell"));
  const env = { ASSETS: { fetch: fetchAsset } };
  const id = crypto.randomUUID();
  const response = await worker.fetch(new Request(`https://planner.test/plans/${id}/edit`), env);
  expect(await response.text()).toBe("detail shell");
  expect(fetchAsset.mock.calls[0]?.[0].url).toBe("https://planner.test/plans/detail/edit");
  const apiResponse = await worker.fetch(new Request(`https://planner.test/api/plans/${id}`), env);
  expect(apiResponse.status).toBe(503);
  expect(fetchAsset).toHaveBeenCalledTimes(1);
});
it("leaves normal assets and invalid plan routes with the asset handler", async () => {
  const fetchAsset = vi.fn(async (_request: Request) => new Response("asset"));
  for (const path of ["/library", "/plans/not-an-id", "/plans", "/plans/new"]) {
    await worker.fetch(new Request(`https://planner.test${path}`), { ASSETS: { fetch: fetchAsset } });
  }
  expect(fetchAsset.mock.calls.map(([request]) => new URL(request.url).pathname)).toEqual(["/library", "/plans/not-an-id", "/plans", "/plans/new"]);
});

it("redirects the default page to the plan list and preserves old plan bookmarks", async () => {
  const fetchAsset = vi.fn(async (_request: Request) => new Response("asset"));
  const env = { ASSETS: { fetch: fetchAsset } };
  const root = await worker.fetch(new Request("https://planner.test/"), env);
  expect(root.status).toBe(302);
  expect(root.headers.get("Location")).toBe("https://planner.test/plans");
  const id = crypto.randomUUID();
  const old = await worker.fetch(new Request(`https://planner.test/plans/${id}/`), env);
  expect(old.status).toBe(302);
  expect(old.headers.get("Location")).toBe(`https://planner.test/plans/${id}/edit`);
  expect(fetchAsset).not.toHaveBeenCalled();
});

it("removes trailing slashes from plan routes while retaining the query string", async () => {
  const fetchAsset = vi.fn(async (_request: Request) => new Response("asset"));
  const id = crypto.randomUUID();
  for (const path of ["/plans/", "/plans/new/", `/plans/${id}/edit/`]) {
    const response = await worker.fetch(new Request(`https://planner.test${path}?from=test`), { ASSETS: { fetch: fetchAsset } });
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(`https://planner.test${path.slice(0, -1)}?from=test`);
  }
  expect(fetchAsset).not.toHaveBeenCalled();
});
