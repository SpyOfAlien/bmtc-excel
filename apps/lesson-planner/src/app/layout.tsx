import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kế hoạch cá nhân · Hương Nắng",
  description: "Lập kế hoạch giáo dục cá nhân từ mẫu Excel, xử lý trực tiếp trên thiết bị của bạn.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
