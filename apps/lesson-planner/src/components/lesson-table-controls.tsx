import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AddLessonRow({ onAdd, disabled = false, empty = false }: { onAdd: () => void; disabled?: boolean; empty?: boolean }) {
  return <div className={`flex h-full w-full items-center justify-center ${empty ? "" : "border-t bg-muted/30"}`}>
    <Button variant="ghost" className="pointer-events-auto text-primary" disabled={disabled} onClick={onAdd}>+ Thêm bài</Button>
  </div>;
}

export function LessonFieldCell({ source, value, label, disabled, change }: {
  source: string; value: string; label: string; disabled: boolean; change: (value: string) => void;
}) {
  if (source.trim()) return <div className="whitespace-pre-wrap py-2 text-xs leading-relaxed">{source}</div>;
  return <Textarea className="manual-lesson-field my-2 h-[72px] min-h-0 resize-none p-2 text-xs" aria-label={label} placeholder="Nhập nội dung…" disabled={disabled}
    maxLength={32767} defaultValue={value} onChange={event => change(event.target.value)} onKeyDown={event => event.stopPropagation()} />;
}
