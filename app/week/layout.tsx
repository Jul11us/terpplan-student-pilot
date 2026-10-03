import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My week · TerpPlan",
  description: "Your UMD classes this week, with building map links. Works without internet once opened.",
  alternates: { canonical: "/week" },
};

export default function WeekLayout({ children }: { children: React.ReactNode }) {
  return children;
}
