import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registration day · TerpPlan",
  description: "Your course and section numbers and backups, ready next to Testudo when your registration time opens.",
  // Shows only what this browser saved, so there is nothing to index.
  robots: { index: false, follow: false },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
