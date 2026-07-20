import { describe, it, expect } from "vitest";
import { escapeHtml } from "./branded-template";

describe("escapeHtml", () => {
  it("escapes the 5 HTML-special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("neutralizes a link/markup injection attempt", () => {
    const malicious = `<a href="https://evil.example/phish">Click here</a>`;
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain("<a ");
    expect(escaped).not.toContain("</a>");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Ana Torres")).toBe("Ana Torres");
    expect(escapeHtml("")).toBe("");
  });
});
