import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "UMD minor & double-major explorer · TerpPlan",
  description: "Explore UMD minors and double majors. Compare remaining courses, prerequisite paths and possible overlap with your current major.",
  alternates: { canonical: "/minor" },
};

export default function MinorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
