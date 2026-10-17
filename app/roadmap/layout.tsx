import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Four-year plan · TerpPlan",
  description: "Lay out your UMD courses term by term. TerpPlan checks credits, prerequisite order, fall-only and spring-only courses and the Gen Ed requirements, and prints it like a graduation plan.",
  alternates: { canonical: "/roadmap" },
};

export default function RoadmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
