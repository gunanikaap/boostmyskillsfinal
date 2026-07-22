import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { siteUrl } from "@/lib/env";
import { clerkConfigured } from "@/lib/auth/clerkConfig";
import { enforceMaintenanceGate } from "@/lib/settings/maintenanceGate";
import "./globals.css";

// The BoostMySkills brand typeface (matches boostmyskills.eu).
const urbanist = Urbanist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-urbanist",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "BoostMySkills",
    template: "%s · BoostMySkills",
  },
  description: "BoostMySkills — micro-credentials and micro-programmes for sustainability skills.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Global maintenance gate: when on, only home + /maintenance are reachable
  // (admins keep full access). Runs before render so it covers every page.
  await enforceMaintenanceGate();
  const body = (
    <html lang="en" className={urbanist.variable}>
      <body>{children}</body>
    </html>
  );
  // Only mount ClerkProvider when a publishable key is configured, so the
  // baseline build/render succeeds without Clerk secrets.
  return clerkConfigured() ? <ClerkProvider>{body}</ClerkProvider> : body;
}
