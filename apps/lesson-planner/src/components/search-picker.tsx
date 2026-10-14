"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { normalize } from "@/lib/workbook";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

type Choice = { value: string; label: string; description?: string; keywords?: string; disabled?: boolean };
type Selection =
  | { kind: "single"; value: string; select: (value: string) => void }
  | { kind: "multiple"; values: string[]; select: (value: string) => void };

export function SearchPicker({ options, selection, label, placeholder, display, disabled, className, contentClassName, header, footer, startOpen = false, close, openState, columns = 1 }: {
  options: Choice[];
  columns?: 1 | 3;
  selection: Selection;
  label: string;
  placeholder: string;
  display?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  header?: ReactNode;
  footer?: ReactNode;
  startOpen?: boolean;
  close?: () => void;
  openState?: { open: boolean; change: (open: boolean) => void };
}) {
  const [internalOpen, setInternalOpen] = useState(startOpen);
  const open = openState?.open ?? internalOpen;
  const setOpen = openState?.change ?? setInternalOpen;
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const filtered = options.filter(option => normalize(`${option.label} ${option.keywords ?? ""}`).includes(normalize(query)));
  const highlighted = filtered[activeIndex];
  const selected = (value: string) => selection.kind === "single" ? selection.value === value : selection.values.includes(value);
  const shown = display ?? (selection.kind === "single" ? options.find(option => option.value === selection.value)?.label ?? "" : "");
  useEffect(() => { if (startOpen) input.current?.focus(); }, [startOpen]);
  useEffect(() => { if (open && highlighted) document.getElementById(`${listId}-${highlighted.value}`)?.scrollIntoView?.({ block: "nearest" }); }, [open, highlighted, listId]);
  function dismiss() { setOpen(false); close?.(); }
  function begin() { if (!open) { setQuery(""); setActiveIndex(0); setOpen(true); } }
  function choose(option: Choice) {
    if (option.disabled) return;
    selection.select(option.value);
    if (selection.kind === "single") dismiss();
  }
  return <Popover open={open} onOpenChange={next => { if (!next) dismiss(); }}>
    <PopoverAnchor asChild><div className="relative w-full">
      <Input ref={input} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && highlighted ? `${listId}-${highlighted.value}` : undefined} autoComplete="off" disabled={disabled} placeholder={placeholder} value={open ? query : shown} className={cn("pr-8", className)} onFocus={begin} onClick={begin} onChange={event => { begin(); setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); dismiss(); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp" || (columns === 3 && (event.key === "ArrowLeft" || event.key === "ArrowRight"))) {
          event.preventDefault();
          if (!open) { begin(); return; }
          const direction = event.key === "ArrowDown" ? columns : event.key === "ArrowUp" ? -columns : event.key === "ArrowRight" ? 1 : -1;
          for (let index = activeIndex + direction; index >= 0 && index < filtered.length; index += direction) {
            if (!filtered[index]?.disabled) { setActiveIndex(index); break; }
          }
        }
        if (event.key === "Enter" && open && highlighted) { event.preventDefault(); choose(highlighted); }
      }} />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </div></PopoverAnchor>
    <PopoverContent role="region" aria-label={label} align="start" className={cn("w-[var(--radix-popover-trigger-width)] min-w-64 p-1", contentClassName)} onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()} onInteractOutside={event => { const target = event.detail.originalEvent.target; if (target instanceof Node && input.current?.contains(target)) event.preventDefault(); }}>
      {header}
      <div id={listId} role="listbox" aria-label={label} aria-multiselectable={selection.kind === "multiple" || undefined} className={columns === 3 ? "grid grid-cols-3 gap-1 p-2" : "max-h-60 overflow-y-auto"}>
        {filtered.map((option, index) => {
          const optionClassName = cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-accent", index === activeIndex && "bg-accent", option.disabled && "opacity-50", columns === 3 && "h-12 gap-1 px-2 text-xs", columns === 3 && selected(option.value) && "bg-accent font-medium text-primary ring-1 ring-inset ring-primary");
          const text = <span className="min-w-0">{option.label}{option.description && <span className="block text-xs text-muted-foreground">{option.description}</span>}</span>;
          if (selection.kind === "multiple") return <label role="option" id={`${listId}-${option.value}`} key={option.value} aria-selected={selected(option.value)} aria-disabled={option.disabled} className={cn(optionClassName, option.disabled ? "cursor-default" : "cursor-pointer")} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)}>
            <input type="checkbox" tabIndex={-1} aria-label={`Chọn ${option.label}`} checked={selected(option.value)} disabled={option.disabled} className="size-4 shrink-0 accent-primary" onChange={() => choose(option)} />
            {text}
          </label>;
          return <button type="button" role="option" id={`${listId}-${option.value}`} key={option.value} tabIndex={-1} disabled={option.disabled} aria-label={`Chọn ${option.label}`} aria-selected={selected(option.value)} className={cn(optionClassName, "justify-between")} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}>
            {text}
            {selected(option.value) && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
          </button>;
        })}
        {!filtered.length && <p className="p-3 text-xs text-muted-foreground">Không tìm thấy lựa chọn phù hợp.</p>}
      </div>
      {footer ?? <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">{columns === 3 ? "Dùng các phím mũi tên và Enter để chọn." : "Dùng ↑ ↓ và Enter để chọn."}</p>}
    </PopoverContent>
  </Popover>;
}
