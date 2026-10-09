import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Empty classrooms at UMD right now · TerpPlan",
  description: "Find University of Maryland classrooms with no class scheduled right now, how long they stay free, and the nearest ones to you. From this term's Testudo class schedule.",
  alternates: { canonical: "/rooms" },
};

export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
