import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Instructor · TerpPlan",
  description: "An instructor's UMD sections this term, with PlanetTerp ratings and average GPA.",
};

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
