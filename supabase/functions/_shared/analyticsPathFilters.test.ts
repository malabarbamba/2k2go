import { describe, it } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { expect } from "https://deno.land/std@0.208.0/expect/mod.ts";

import {
  isAdminPath,
  isInternalTestPath,
  isRoutableAnalyticsPath,
  isTrackableAnalyticsPath,
  normalizeAnalyticsPath,
  normalizeTrackedPath,
} from "./analyticsPathFilters.ts";

describe("analyticsPathFilters", () => {
  it("normalizes tracked paths with lowercase and trim", () => {
    expect(normalizeTrackedPath("  /TeSt-Route  ")).toBe("/test-route");
    expect(normalizeTrackedPath("   ")).toBe("/");
  });

  it("normalizes analytics path from full URL", () => {
    expect(normalizeAnalyticsPath("https://example.com/admin?x=1")).toBe("/admin");
    expect(normalizeAnalyticsPath("not-a-path")).toBe("not-a-path");
  });

  it("detects admin and internal test paths", () => {
    expect(isAdminPath("/admin/analytics")).toBe(true);
    expect(isInternalTestPath("/test-home-subtitles-19s")).toBe(true);
    expect(isInternalTestPath("/_test/sandbox")).toBe(true);
    expect(isInternalTestPath("/dev-lab")).toBe(true);
    expect(isInternalTestPath("/apprendre/video/intro")).toBe(false);
  });

  it("keeps only routable and trackable analytics paths", () => {
    expect(isRoutableAnalyticsPath("/apprendre")).toBe(true);
    expect(isRoutableAnalyticsPath("https://example.com/apprendre")).toBe(true);
    expect(isRoutableAnalyticsPath("component:hero")).toBe(false);

    expect(isTrackableAnalyticsPath("/apprendre")).toBe(true);
    expect(isTrackableAnalyticsPath("/admin")).toBe(false);
    expect(isTrackableAnalyticsPath("/test-home-subtitles-19s")).toBe(false);
    expect(isTrackableAnalyticsPath("component:hero")).toBe(false);
  });
});
