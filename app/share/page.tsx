import type { Metadata } from "next";
import { shareMetadata } from "@/lib/share-metadata";
import SharedSchedulePage from "./shared-schedule";

// A shared link's preview in chats names its term and courses; a broken link keeps the site's own. Shared schedules
// are kept out of search results.
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") query.set(key, value);
  const shared = shareMetadata(query);
  const robots = { index: false, follow: true };
  if (!shared) return { robots };
  const url = `/share?${query.toString()}`;
  // openGraph and twitter replace the layout's whole entry, so the site image is named again.
  return {
    title: shared.title,
    description: shared.description,
    robots,
    openGraph: { type: "website", url, siteName: "TerpPlan", title: shared.title, description: shared.description, locale: shared.language === "zh" ? "zh_CN" : "en_US", images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "TerpPlan" }] },
    twitter: { card: "summary_large_image", title: shared.title, description: shared.description, images: ["/og-image.png"] },
  };
}

export default function Page() {
  return <SharedSchedulePage />;
}
