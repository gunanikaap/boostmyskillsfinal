import type { Metadata } from "next";
import { siteUrl } from "@/lib/env";
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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
