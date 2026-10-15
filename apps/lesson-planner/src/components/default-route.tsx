"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { plansPath } from "@/lib/plan-routes";

export function DefaultRoute() {
  const router = useRouter();
  useEffect(() => { router.replace(plansPath); }, [router]);
  return <p role="status" className="p-8">Đang mở danh sách kế hoạch…</p>;
}
