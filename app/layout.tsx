import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TerpPlan Student Pilot",
  description: "Find UMD courses, build a conflict-checked schedule, and watch section seats.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
