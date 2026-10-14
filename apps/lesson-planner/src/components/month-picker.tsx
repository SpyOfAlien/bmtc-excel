"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SearchPicker } from "./search-picker";

export function MonthPicker({ month, year, change }: { month: number; year: number; change: (period: { month: number; year: number }) => void }) {
  const [browseYear, setBrowseYear] = useState(year);
  useEffect(() => setBrowseYear(year), [year]);
  return <SearchPicker columns={3} contentClassName="min-w-80" label="Tháng" placeholder="Tìm tháng…" display={`Tháng ${month}/${year}`} options={Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: `Tháng ${index + 1}`, keywords: String(browseYear) }))} selection={{ kind: "single", value: browseYear === year ? String(month) : "", select: value => change({ month: Number(value), year: browseYear }) }} close={() => setBrowseYear(year)} header={<div className="flex items-center justify-between gap-2 border-b p-2">
    <Button variant="ghost" size="icon-sm" aria-label="Năm trước" disabled={browseYear <= 1900} onClick={() => setBrowseYear(value => value - 1)}><ChevronLeft /></Button>
    <Input type="number" aria-label="Năm kế hoạch" min={1900} max={9999} value={browseYear} className="h-8 w-24 text-center" onChange={event => { if (event.target.validity.valid && event.target.value) setBrowseYear(Number(event.target.value)); }} />
    <Button variant="ghost" size="icon-sm" aria-label="Năm sau" disabled={browseYear >= 9999} onClick={() => setBrowseYear(value => value + 1)}><ChevronRight /></Button>
  </div>} />;
}
