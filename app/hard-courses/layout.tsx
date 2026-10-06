import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hardest UMD courses to get · TerpPlan",
  description: "UMD courses that were still full after registration in recent semesters, from Testudo seat counts. Plan backups and seat alerts for these early.",
  alternates: { canonical: "/hard-courses" },
};

export default function HardCoursesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
