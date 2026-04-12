/**
 * Tests for the permissions store.
 */

import { usePermissions } from "../src/stores/permissions";

// Mock API
jest.mock("../src/services/api", () => ({
  api: {
    get: jest.fn(() =>
      Promise.resolve({
        data: ["paxlog.ads.read", "paxlog.ads.create", "packlog.cargo.read"],
      })
    ),
  },
}));

describe("usePermissions", () => {
  beforeEach(() => {
    usePermissions.setState({
      permissions: [],
      loaded: false,
      loading: false,
    });
  });

  it("has correct initial state", () => {
    const state = usePermissions.getState();
    expect(state.permissions).toEqual([]);
    expect(state.loaded).toBe(false);
  });

  it("has() checks single permission", () => {
    usePermissions.setState({
      permissions: ["paxlog.ads.read", "paxlog.ads.create"],
      loaded: true,
    });

    expect(usePermissions.getState().has("paxlog.ads.read")).toBe(true);
    expect(usePermissions.getState().has("admin.settings")).toBe(false);
  });

  it("hasAny() checks if user has at least one", () => {
    usePermissions.setState({
      permissions: ["paxlog.ads.read"],
      loaded: true,
    });

    expect(
      usePermissions.getState().hasAny(["paxlog.ads.read", "admin.settings"])
    ).toBe(true);
    expect(
      usePermissions.getState().hasAny(["admin.settings", "admin.users"])
    ).toBe(false);
  });

  it("hasAll() checks if user has all permissions", () => {
    usePermissions.setState({
      permissions: ["paxlog.ads.read", "paxlog.ads.create", "packlog.cargo.read"],
      loaded: true,
    });

    expect(
      usePermissions.getState().hasAll(["paxlog.ads.read", "paxlog.ads.create"])
    ).toBe(true);
    expect(
      usePermissions.getState().hasAll(["paxlog.ads.read", "admin.settings"])
    ).toBe(false);
  });

  it("clear() resets permissions", () => {
    usePermissions.setState({
      permissions: ["paxlog.ads.read"],
      loaded: true,
    });

    usePermissions.getState().clear();
    expect(usePermissions.getState().permissions).toEqual([]);
    expect(usePermissions.getState().loaded).toBe(false);
  });

  it("fetchPermissions() loads from API", async () => {
    await usePermissions.getState().fetchPermissions();

    expect(usePermissions.getState().permissions).toEqual([
      "paxlog.ads.read",
      "paxlog.ads.create",
      "packlog.cargo.read",
    ]);
    expect(usePermissions.getState().loaded).toBe(true);
  });
});
