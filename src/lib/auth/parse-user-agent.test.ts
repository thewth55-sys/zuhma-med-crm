import { describe, it, expect } from "vitest";
import { parseBrowser, parseDevice } from "./parse-user-agent";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";

describe("parseBrowser", () => {
  it("identifies Chrome", () => {
    expect(parseBrowser(CHROME_MAC)).toBe("Chrome");
  });

  it("identifies Safari without being fooled by Chrome's Safari/ token", () => {
    expect(parseBrowser(SAFARI_IPHONE)).toBe("Safari");
  });

  it("identifies Edge ahead of the Chrome check", () => {
    expect(parseBrowser(EDGE_WINDOWS)).toBe("Edge");
  });

  it("returns null for a missing user agent", () => {
    expect(parseBrowser(null)).toBeNull();
  });
});

describe("parseDevice", () => {
  it("identifies desktop", () => {
    expect(parseDevice(CHROME_MAC)).toBe("Escritorio");
  });

  it("identifies mobile", () => {
    expect(parseDevice(SAFARI_IPHONE)).toBe("Móvil");
  });

  it("returns null for a missing user agent", () => {
    expect(parseDevice(null)).toBeNull();
  });
});
