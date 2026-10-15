import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type ToolbarSearch = {
  label: string;
  placeholder: string;
  value: string;
  change: (value: string) => void;
};

export function TableToolbar({ title, label, search, actions, className }: {
  title: ReactNode;
  label: string;
  search?: ToolbarSearch;
  actions?: ReactNode;
  className?: string;
}) {
  return <div role="toolbar" aria-label={label} className={cn("table-toolbar rounded-t-lg border-b bg-card", className)}>
    <div className="min-w-0 text-sm font-medium">{title}</div>
    {(search || actions) && <div className="ml-auto flex items-center gap-3">
      {search && <Label className="grid gap-2">
        <span className="sr-only">{search.label}</span>
        <div className="search-field"><Search aria-hidden="true" /><Input type="search" className="h-9 w-64 border-transparent bg-muted pl-9 shadow-none" placeholder={search.placeholder} value={search.value} onChange={event => search.change(event.target.value)} /></div>
      </Label>}
      {actions}
    </div>}
  </div>;
}
