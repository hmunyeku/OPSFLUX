/**
 * Tests for appState store — account blocked, force update, maintenance.
 */

import { useAppState } from "../src/stores/appState";

describe("useAppState", () => {
  beforeEach(() => {
    useAppState.getState().clear();
  });

  it("starts with no blocking state", () => {
    const state = useAppState.getState();
    expect(state.accountBlocked).toBe(false);
    expect(state.updateRequired).toBe(false);
    expect(state.maintenance).toBe(false);
  });

  it("setAccountBlocked sets reason and message", () => {
    useAppState.getState().setAccountBlocked("blocked", "Votre compte est bloqué");

    const state = useAppState.getState();
    expect(state.accountBlocked).toBe(true);
    expect(state.blockReason).toBe("blocked");
    expect(state.blockMessage).toBe("Votre compte est bloqué");
  });

  it("setAccountBlocked with null clears blocked state", () => {
    useAppState.getState().setAccountBlocked("suspended");
    useAppState.getState().setAccountBlocked(null);

    expect(useAppState.getState().accountBlocked).toBe(false);
    expect(useAppState.getState().blockReason).toBeNull();
  });

  it("setUpdateRequired marks update needed", () => {
    useAppState.getState().setUpdateRequired(true, "2.0.0", false);

    const state = useAppState.getState();
    expect(state.updateRequired).toBe(true);
    expect(state.requiredVersion).toBe("2.0.0");
    expect(state.updateSoft).toBe(false);
  });

  it("setUpdateRequired with soft=true allows skip", () => {
    useAppState.getState().setUpdateRequired(true, "1.5.0", true);

    expect(useAppState.getState().updateSoft).toBe(true);
  });

  it("setMaintenance activates maintenance mode", () => {
    useAppState.getState().setMaintenance(true, "Maintenance prévue");

    const state = useAppState.getState();
    expect(state.maintenance).toBe(true);
    expect(state.maintenanceMessage).toBe("Maintenance prévue");
  });

  it("clear() resets everything", () => {
    useAppState.getState().setAccountBlocked("deleted", "Supprimé");
    useAppState.getState().setUpdateRequired(true, "3.0.0");
    useAppState.getState().setMaintenance(true);

    useAppState.getState().clear();

    const state = useAppState.getState();
    expect(state.accountBlocked).toBe(false);
    expect(state.updateRequired).toBe(false);
    expect(state.maintenance).toBe(false);
    expect(state.blockReason).toBeNull();
    expect(state.requiredVersion).toBeNull();
  });
});
