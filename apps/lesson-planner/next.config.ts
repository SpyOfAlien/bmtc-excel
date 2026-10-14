import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function config(phase: string): NextConfig {
  return {
    trailingSlash: true,
    poweredByHeader: false,
    ...(phase === PHASE_DEVELOPMENT_SERVER ? {
      async rewrites() {
        return [{ source: "/api/:path*", destination: "http://127.0.0.1:8787/api/:path*" }];
      },
    } : { output: "export" }),
  };
}
