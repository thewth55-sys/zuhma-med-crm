import { describe, it, expect } from "vitest";
import { timingSafeSecretEqual } from "./verify-secret";

describe("timingSafeSecretEqual", () => {
  it("matches identical strings", () => {
    expect(timingSafeSecretEqual("hunter2", "hunter2")).toBe(true);
  });

  it("rejects a mismatch of the same length", () => {
    expect(timingSafeSecretEqual("hunter3", "hunter2")).toBe(false);
  });

  it("rejects different lengths without throwing", () => {
    expect(timingSafeSecretEqual("short", "a-much-longer-secret")).toBe(false);
  });

  it("rejects a null/missing supplied header", () => {
    expect(timingSafeSecretEqual(null, "hunter2")).toBe(false);
  });

  it("rejects an empty supplied value", () => {
    expect(timingSafeSecretEqual("", "hunter2")).toBe(false);
  });
});
