import { describe, it, expect } from "vitest";
import { sanitizeHref } from "./safe-url";

describe("sanitizeHref", () => {
  it("blocks javascript: and other script-executing schemes", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "javascript:/*comment*/alert(1)",
      "vbscript:msgbox(1)",
      "data:text/html,<script>alert(1)</script>",
    ]) {
      expect(sanitizeHref(bad)).toBeUndefined();
    }
  });

  it("allows http(s), tel, and mailto", () => {
    expect(sanitizeHref("https://wa.me/15551234567")).toBe("https://wa.me/15551234567");
    expect(sanitizeHref("http://example.com")).toBe("http://example.com");
    expect(sanitizeHref("tel:+15551234567")).toBe("tel:+15551234567");
    expect(sanitizeHref("mailto:hello@example.com")).toBe("mailto:hello@example.com");
  });

  it("passes through scheme-less values unchanged", () => {
    expect(sanitizeHref("#planes")).toBe("#planes");
    expect(sanitizeHref("/agendar/mi-clinica")).toBe("/agendar/mi-clinica");
    expect(sanitizeHref("//maps.google.com/x")).toBe("//maps.google.com/x");
  });

  it("returns undefined for empty/missing values", () => {
    expect(sanitizeHref(undefined)).toBeUndefined();
    expect(sanitizeHref(null)).toBeUndefined();
    expect(sanitizeHref("")).toBeUndefined();
    expect(sanitizeHref("   ")).toBeUndefined();
  });

  it("returns undefined for unparseable garbage", () => {
    expect(sanitizeHref("http://")).toBeUndefined();
  });
});
