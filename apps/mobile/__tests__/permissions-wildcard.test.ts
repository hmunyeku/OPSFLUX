/**
 * Tests for permission wildcard matching.
 */

import { permissionMatches, checkPermission } from "../src/stores/permissions";

describe("permissionMatches", () => {
  it('wildcard "*" matches anything', () => {
    expect(permissionMatches("*", "paxlog.ads.read")).toBe(true);
    expect(permissionMatches("*", "anything.at.all")).toBe(true);
    expect(permissionMatches("*", "")).toBe(true);
  });

  it("exact match", () => {
    expect(permissionMatches("paxlog.ads.read", "paxlog.ads.read")).toBe(true);
    expect(permissionMatches("paxlog.ads.read", "paxlog.ads.create")).toBe(false);
  });

  it("module wildcard matches sub-permissions", () => {
    expect(permissionMatches("paxlog.*", "paxlog.ads.read")).toBe(true);
    expect(permissionMatches("paxlog.*", "paxlog.ads.approve")).toBe(true);
    expect(permissionMatches("paxlog.*", "paxlog.credential.create")).toBe(true);
  });

  it("module wildcard does NOT match other modules", () => {
    expect(permissionMatches("paxlog.*", "packlog.cargo.read")).toBe(false);
  });

  it("resource wildcard matches actions", () => {
    expect(permissionMatches("paxlog.ads.*", "paxlog.ads.read")).toBe(true);
    expect(permissionMatches("paxlog.ads.*", "paxlog.ads.approve")).toBe(true);
    expect(permissionMatches("paxlog.ads.*", "paxlog.credential.read")).toBe(false);
  });
});

describe("checkPermission", () => {
  it("super-admin with '*' has all permissions", () => {
    const grants = ["*"];
    expect(checkPermission(grants, "paxlog.ads.approve")).toBe(true);
    expect(checkPermission(grants, "admin.users.delete")).toBe(true);
    expect(checkPermission(grants, "any.thing.really")).toBe(true);
  });

  it("specific grants", () => {
    const grants = ["packlog.cargo.read", "paxlog.ads.read"];
    expect(checkPermission(grants, "packlog.cargo.read")).toBe(true);
    expect(checkPermission(grants, "packlog.cargo.create")).toBe(false);
    expect(checkPermission(grants, "paxlog.ads.read")).toBe(true);
  });

  it("module wildcard grant", () => {
    const grants = ["paxlog.*"];
    expect(checkPermission(grants, "paxlog.ads.read")).toBe(true);
    expect(checkPermission(grants, "paxlog.credential.validate")).toBe(true);
    expect(checkPermission(grants, "packlog.cargo.read")).toBe(false);
  });

  it("mixed grants", () => {
    const grants = ["packlog.cargo.read", "paxlog.*", "admin.users.read"];
    expect(checkPermission(grants, "packlog.cargo.read")).toBe(true);
    expect(checkPermission(grants, "packlog.cargo.create")).toBe(false);
    expect(checkPermission(grants, "paxlog.ads.approve")).toBe(true);
    expect(checkPermission(grants, "admin.users.read")).toBe(true);
    expect(checkPermission(grants, "admin.users.delete")).toBe(false);
  });

  it("empty grants", () => {
    expect(checkPermission([], "anything")).toBe(false);
  });
});
