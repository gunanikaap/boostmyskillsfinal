import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "@/lib/content/sanitize";

const NUL = String.fromCharCode(0);
const DEL = String.fromCharCode(0x7f);
const VT = String.fromCharCode(0x0b); // vertical tab (C0 whitespace)

/**
 * safeUrl() strips C0 control chars, DEL and whitespace before checking the URL
 * scheme, so an attacker cannot smuggle "javascript:" past the allowlist by
 * splitting the scheme with an invisible byte. This exercises that rule via the
 * public sanitizeHtml() (safeUrl is internal) and guards the reviewability
 * refactor (explicit code-point filter) against behaviour regressions.
 */
describe("sanitizeHtml URL scheme allowlist (control-char smuggling)", () => {
  it("drops a plain javascript: href but keeps the element text", () => {
    const out = sanitizeHtml(`<a href="javascript:alert(1)">click</a>`);
    expect(out).toContain(">click</a>");
    expect(out.toLowerCase()).not.toContain("javascript");
    expect(out).not.toContain("href=");
  });

  it.each([
    ["NUL", `java${NUL}script:alert(1)`],
    ["DEL", `java${DEL}script:alert(1)`],
    ["tab", `java\tscript:alert(1)`],
    ["newline", `java\nscript:alert(1)`],
    ["vertical-tab", `java${VT}script:alert(1)`],
    ["spaces", `java script:alert(1)`],
  ])("rejects a javascript: scheme split by %s", (_label, href) => {
    const out = sanitizeHtml(`<a href="${href}">x</a>`);
    expect(out).not.toContain("href=");
    expect(out.toLowerCase()).not.toContain("alert");
  });

  it.each([
    "https://example.com/posts",
    "https://s.example.com/s/s?q=s", // many 's' — guards the /\\s/ (not /s/) regex
    "http://example.org",
    "mailto:person@example.com",
    "/relative/path",
    "#anchor",
  ])("preserves the benign URL %s", (href) => {
    const out = sanitizeHtml(`<a href="${href}">link</a>`);
    expect(out).toContain(`href="${href}"`);
  });
});

describe("sanitizeHtml element allowlist", () => {
  it("drops <script> with its content and neutralises on* handlers", () => {
    const out = sanitizeHtml(`<script>alert(1)</script><p onclick="steal()">hi</p>`);
    expect(out).toBe("<p>hi</p>");
  });

  it("keeps allowlisted formatting tags", () => {
    const out = sanitizeHtml(`<p>Hello <strong>world</strong> and <em>friends</em></p>`);
    expect(out).toBe("<p>Hello <strong>world</strong> and <em>friends</em></p>");
  });
});
