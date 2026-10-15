import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function config(phase: string): NextConfig {
  return {
    trailingSlash: false,
    poweredByHeader: false,
    ...(phase === PHASE_DEVELOPMENT_SERVER ? {
      async redirects() {
        return [{ source: "/plans/:id([0-9a-fA-F-]{36})", destination: "/plans/:id/edit", permanent: false }];
      },
      async rewrites() {
        return [{ source: "/api/:path*", destination: "http://127.0.0.1:8787/api/:path*" }];
      },
    } : { output: "export" }),
  };
}
