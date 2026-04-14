/**
 * Tests for the offline sync engine — cache, queue, conditions.
 */

import { useOfflineStore } from "../src/services/offline";

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock NetInfo
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
}));

describe("useOfflineStore", () => {
  beforeEach(() => {
    useOfflineStore.setState({
      isOnline: true,
      queueLength: 0,
      syncing: false,
      lastSyncAt: null,
    });
  });

  it("has correct initial state", () => {
    const state = useOfflineStore.getState();
    expect(state.isOnline).toBe(true);
    expect(state.queueLength).toBe(0);
    expect(state.syncing).toBe(false);
    expect(state.lastSyncAt).toBeNull();
  });

  it("updates online status", () => {
    useOfflineStore.getState().setOnline(false);
    expect(useOfflineStore.getState().isOnline).toBe(false);

    useOfflineStore.getState().setOnline(true);
    expect(useOfflineStore.getState().isOnline).toBe(true);
  });

  it("tracks queue length", () => {
    useOfflineStore.getState().setQueueLength(5);
    expect(useOfflineStore.getState().queueLength).toBe(5);
  });

  it("tracks syncing state", () => {
    useOfflineStore.getState().setSyncing(true);
    expect(useOfflineStore.getState().syncing).toBe(true);

    useOfflineStore.getState().setSyncing(false);
    expect(useOfflineStore.getState().syncing).toBe(false);
  });

  it("records last sync timestamp", () => {
    const now = Date.now();
    useOfflineStore.getState().setLastSync(now);
    expect(useOfflineStore.getState().lastSyncAt).toBe(now);
  });
});
