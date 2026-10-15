import { handleApi } from "./storage-api";
import type { Env } from "./storage-api";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) return handleApi(request, env);
    const url = new URL(request.url);
    if (url.pathname === "/") return Response.redirect(new URL("/plans", url), 302);
    const oldPlan = url.pathname.match(/^\/plans\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i);
    if (oldPlan) return Response.redirect(new URL(`/plans/${oldPlan[1]}/edit`, url), 302);
    if (url.pathname.startsWith("/plans/") && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
      return Response.redirect(url, 308);
    }
    if (/^\/plans\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/edit\/?$/i.test(url.pathname)) {
      url.pathname = "/plans/detail/edit";
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
