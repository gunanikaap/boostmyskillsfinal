import { describe, expect, it } from "vitest";
import { loadRedirects, resolveRedirect, safeReturnPath } from "@/lib/redirects/redirects";

describe("redirect map", () => {
  it("validates the redirect file and resolves known auth routes", () => {
    const { authRedirects } = loadRedirects();
    expect(authRedirects.length).toBeGreaterThan(0);
    expect(resolveRedirect("/login")?.to).toBe("/sign-in");
    expect(resolveRedirect("/register")?.to).toBe("/sign-up");
    expect(resolveRedirect("/nonexistent")).toBeNull();
  });
});

describe("safeReturnPath (open-redirect prevention)", () => {
  it("allows same-origin in-app paths", () => {
    expect(safeReturnPath("/dashboard")).toBe("/dashboard");
    expect(safeReturnPath("/courses/abc")).toBe("/courses/abc");
  });

  it("rejects external, protocol-relative, scheme, backslash and traversal", () => {
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil.example")).toBe("/");
    expect(safeReturnPath("/javascript:alert(1)")).toBe("/");
    expect(safeReturnPath("/../secret")).toBe("/");
    expect(safeReturnPath("/%2e%2e/%2f%2fevil")).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath("relative")).toBe("/");
  });
});
