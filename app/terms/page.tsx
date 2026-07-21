import { redirect } from "next/navigation";

// Canonical alias → the existing terms route.
export default function TermsAlias() {
  redirect("/tos");
}
