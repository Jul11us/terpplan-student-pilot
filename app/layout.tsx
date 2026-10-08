import type { Metadata, Viewport } from "next";
import ServiceWorker from "@/app/components/service-worker";
import { SITE_URL } from "@/lib/site-config";
import Analytics from "@/app/components/analytics";
import ReferralTracker from "@/app/components/referral-tracker";
import ErrorReporter from "@/app/components/error-reporter";
import FeedbackDialog from "@/app/components/feedback-dialog";
import "./globals.css";

const title = "TerpPlan · UMD course & schedule planner";
const description = "Find University of Maryland courses, compare conflict-free schedules, and watch open seats. Free and student-built.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  applicationName: "TerpPlan",
  // Home-screen install ("My week" opens offline); see public/manifest.webmanifest and public/sw.js.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TerpPlan", statusBarStyle: "default" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "TerpPlan",
    title,
    description,
    locale: "en_US",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "TerpPlan — Plan your next semester at UMD" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.svg",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = { themeColor: "#273c38" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <ServiceWorker />
        <Analytics />
        <ReferralTracker />
        <ErrorReporter />
        <FeedbackDialog />
      </body>
    </html>
  );
}
