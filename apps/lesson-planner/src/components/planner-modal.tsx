"use client";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
export function Modal({
  title,
  children,
  close,
  label,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  label?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto bg-card sm:max-w-[620px]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          {label && <div className="eyebrow">{label}</div>}
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Sử dụng các lựa chọn bên dưới. Nhấn Escape để đóng.
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

