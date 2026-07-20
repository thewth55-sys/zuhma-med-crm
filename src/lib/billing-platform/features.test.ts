import { describe, it, expect } from "vitest";
import { resolveFeatureAccess } from "./features";

describe("resolveFeatureAccess", () => {
  it("falls back to the plan default when there's no override", () => {
    expect(resolveFeatureAccess("trial", "automations", null)).toBe(false);
    expect(resolveFeatureAccess("standalone", "automations", null)).toBe(true);
  });

  it("falls back to the plan default when the feature key is absent", () => {
    expect(resolveFeatureAccess("standalone", "broadcasts", { automations: false })).toBe(true);
  });

  it("an override forces the feature on even on a plan that wouldn't include it", () => {
    expect(resolveFeatureAccess("trial", "automations", { automations: true })).toBe(true);
  });

  it("an override forces the feature off even on a plan that would include it", () => {
    expect(resolveFeatureAccess("zentro_salud_pro", "broadcasts", { broadcasts: false })).toBe(false);
  });
});
