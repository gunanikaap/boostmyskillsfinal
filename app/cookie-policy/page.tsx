import { redirect } from "next/navigation";

// Canonical alias → the existing cookie policy route.
export default function CookiePolicyAlias() {
  redirect("/cookie_policy");
}
