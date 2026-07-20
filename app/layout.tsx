import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { siteUrl } from "@/lib/env";
import { clerkConfigured } from "@/lib/auth/clerkConfig";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "BoostMySkills",
    template: "%s · BoostMySkills",
  },
  description: "BoostMySkills — micro-credentials and micro-programmes for sustainability skills.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
  // Only mount ClerkProvider when a publishable key is configured, so the
  // baseline build/render succeeds without Clerk secrets.
  return clerkConfigured() ? <ClerkProvider>{body}</ClerkProvider> : body;
}
