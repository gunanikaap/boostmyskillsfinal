"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

/**
 * Admin top bar — matches the public site header pattern (white bar, brand left,
 * section nav, actions right) with an "Admin" tag so it's clearly the admin
 * context, plus explicit exits back to the learner side.
 */
const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/credentials", label: "Credentials" },
  { href: "/admin/programmes", label: "Programmes" },
  { href: "/admin/imports", label: "Imports" },
  { href: "/admin/contact", label: "Contact" },
  { href: "/admin/account-deletions", label: "Account deletions" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/maintenance", label: "Maintenance" },
];

export default function AdminBar() {
  const path = usePathname();
  const active = (href: string, exact?: boolean) =>
    exact ? path === href : path === href || path.startsWith(`${href}/`);

  return (
    <header className="admin-bar">
      <div className="admin-bar__inner">
        <Link href="/admin" className="admin-bar__brand" aria-label="BoostMySkills admin">
          <Image
            src="/brand/logo.png"
            alt="BoostMySkills"
            width={100}
            height={48}
            priority
            style={{ height: 36, width: "auto" }}
          />
          <span className="admin-tag">Admin</span>
        </Link>

        <nav className="admin-nav" aria-label="Admin sections">
          {LINKS.map((l) => {
            const on = active(l.href, l.exact);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={on ? "is-active" : undefined}
                aria-current={on ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="admin-bar__right">
          <Link href="/dashboard" className="btn btn-outline btn-sm">
            My dashboard
          </Link>
          <Link href="/" className="btn btn-sm">
            View site
          </Link>
        </div>
      </div>
    </header>
  );
}
