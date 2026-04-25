/**
 * Tests for auth store — tokens, entity, user, logout.
 */

import { useAuthStore } from "../src/stores/auth";

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      entityId: null,
      userId: null,
      userDisplayName: null,
      baseUrl: "https://api.opsflux.com",
      isAuthenticated: false,
    });
  });

  it("starts unauthenticated", () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("setTokens authenticates the user", () => {
    useAuthStore.getState().setTokens("access123", "refresh456");

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe("access123");
    expect(state.refreshToken).toBe("refresh456");
  });

  it("setEntity stores entity ID", () => {
    useAuthStore.getState().setEntity("entity-uuid-123");
    expect(useAuthStore.getState().entityId).toBe("entity-uuid-123");
  });

  it("setUser stores user info", () => {
    useAuthStore.getState().setUser("user-123", "John Doe");

    const state = useAuthStore.getState();
    expect(state.userId).toBe("user-123");
    expect(state.userDisplayName).toBe("John Doe");
  });

  it("setBaseUrl updates API base URL", () => {
    useAuthStore.getState().setBaseUrl("https://custom.server.com");
    expect(useAuthStore.getState().baseUrl).toBe("https://custom.server.com");
  });

  it("logout clears all auth state", () => {
    useAuthStore.getState().setTokens("access", "refresh");
    useAuthStore.getState().setUser("user-1", "Test User");
    useAuthStore.getState().setEntity("entity-1");

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.userId).toBeNull();
    expect(state.userDisplayName).toBeNull();
    expect(state.entityId).toBeNull();
  });
});
