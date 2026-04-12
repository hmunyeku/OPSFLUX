/**
 * Tests for version comparison utility.
 */

import { compareVersions } from "../src/screens/ForceUpdateScreen";

describe("compareVersions", () => {
  it("equal versions return 0", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("2.5.3", "2.5.3")).toBe(0);
  });

  it("detects older major version", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
  });

  it("detects older minor version", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
  });

  it("detects older patch version", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
  });

  it("detects newer version", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
  });

  it("handles uneven segment counts", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.1", "1.0.9")).toBe(1);
  });
});
