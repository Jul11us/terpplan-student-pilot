import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Grade calculator · TerpPlan",
  description: "Pull your UMD Canvas courses and scores, read each syllabus for its real grading weights, and see the standing and GPA that follow under UMD's own rules. Everything stays in your browser.",
  alternates: { canonical: "/grades" },
};

export default function GradesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
