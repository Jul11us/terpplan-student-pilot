import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "UMD degree audit · TerpPlan",
  description: "Read your uAchieve degree audit in your browser and find UMD courses for unmet requirements. Your PDF stays on your device.",
  alternates: { canonical: "/audit" },
};

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
