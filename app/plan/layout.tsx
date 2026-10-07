import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plan your semester · TerpPlan",
  description: "Search UMD courses, build conflict-free schedules around your commitments, check prerequisites and watch for open seats.",
  alternates: { canonical: "/plan" },
};

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
